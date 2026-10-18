import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { type SelectUser, users } from '@repo/db';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  issueAccessToken,
  issueRefreshToken,
  setAuthCookies,
} from '../tokens.ts';

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_PKCE_COOKIE = 'oauth_pkce';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const base64url = (buf: Buffer) => buf.toString('base64url');

function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function randomState(): string {
  return base64url(randomBytes(32));
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function decodeIdTokenPayload(idToken: string): unknown {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('malformed id_token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  // postgres.js PostgresError; newer drizzle versions wrap it in `cause`.
  for (let e = err; e instanceof Error; e = e.cause) {
    const pg = e as { code?: unknown; constraint_name?: unknown };
    if (pg.code === '23505' && pg.constraint_name === constraint) return true;
  }
  return false;
}

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const googleTokenResponseSchema = z.object({
  id_token: z.string(),
});

const idTokenPayloadSchema = z.object({
  sub: z.string(),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.url().optional(),
});

export const googleRoutes: FastifyPluginAsync = async (app) => {
  const { config } = app;
  // Derived from where this plugin is mounted, so it must equal the redirect URI
  // registered in the Google Cloud console.
  const redirectUri = new URL(`${app.prefix}/callback`, config.APP_ORIGIN).href;
  const oauthCookiePath = app.prefix;
  const oauthCookieOptions = {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    path: oauthCookiePath,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  app.get('/start', async (_req, reply) => {
    const state = randomState();
    const { verifier, challenge } = pkce();

    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      ...oauthCookieOptions,
      signed: true,
    });
    reply.setCookie(OAUTH_PKCE_COOKIE, verifier, oauthCookieOptions);

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', config.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');

    return reply.redirect(url.toString());
  });

  // The browser is mid-redirect here, so failures go back to the landing page
  // (which shows a banner for `?error`) instead of rendering raw JSON.
  // Cancelling on Google's consent screen lands here too, as `?error=access_denied`.
  const failSignIn = (reply: FastifyReply, reason: string) => {
    app.log.warn({ reason }, 'google sign-in failed');
    const url = new URL('/', config.APP_ORIGIN);
    url.searchParams.set('error', 'oauth');
    return reply.redirect(url.toString());
  };

  app.get('/callback', async (req, reply) => {
    // State and PCKE verification
    const queryResult = callbackQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return failSignIn(reply, 'missing code or state');
    }
    const { code, state } = queryResult.data;

    const signed = req.cookies[OAUTH_STATE_COOKIE];
    const verifier = req.cookies[OAUTH_PKCE_COOKIE];
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: oauthCookiePath });
    reply.clearCookie(OAUTH_PKCE_COOKIE, { path: oauthCookiePath });

    if (!signed || !verifier) {
      return failSignIn(reply, 'missing oauth cookies');
    }
    const unsigned = req.unsignCookie(signed);
    if (!unsigned.valid || !unsigned.value) {
      return failSignIn(reply, 'invalid oauth state');
    }
    if (!constantTimeEqual(unsigned.value, state)) {
      return failSignIn(reply, 'oauth state mismatch');
    }

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      app.log.error(
        { status: tokenRes.status },
        'google token exchange failed',
      );
      return failSignIn(reply, 'token exchange failed');
    }

    const tokenJson = googleTokenResponseSchema.safeParse(
      await tokenRes.json(),
    );
    if (!tokenJson.success) {
      app.log.error({ err: tokenJson.error }, 'invalid google token response');
      return failSignIn(reply, 'invalid token response');
    }

    const idToken = tokenJson.data.id_token;
    let rawPayload: unknown;
    try {
      rawPayload = decodeIdTokenPayload(idToken);
    } catch (err) {
      app.log.error({ err }, 'failed to decode id_token');
      return failSignIn(reply, 'invalid id_token');
    }
    const payloadParse = idTokenPayloadSchema.safeParse(rawPayload);
    if (!payloadParse.success) {
      app.log.error(
        { err: payloadParse.error },
        'id_token payload validation failed',
      );
      return failSignIn(reply, 'invalid id_token');
    }
    const payload = payloadParse.data;
    if (!payload.email_verified) {
      return failSignIn(reply, 'email not verified');
    }

    let user: SelectUser | undefined;
    try {
      [user] = await app.db
        .insert(users)
        .values({
          email: payload.email,
          googleSub: payload.sub,
          name: payload.name ?? null,
          picture: payload.picture ?? null,
        })
        .onConflictDoUpdate({
          target: users.googleSub,
          set: {
            email: payload.email,
            name: payload.name ?? null,
            picture: payload.picture ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
    } catch (err) {
      // A new Google account (different sub) whose email an existing user already holds,
      // e.g. a deleted and recreated Workspace account. Linking it would be a takeover.
      if (isUniqueViolation(err, 'users_email_unique')) {
        return failSignIn(reply, 'email belongs to another google account');
      }
      throw err;
    }

    if (!user) {
      return failSignIn(reply, 'failed to upsert user');
    }

    const access = issueAccessToken(app, user.id);
    const refresh = issueRefreshToken(app, user);
    setAuthCookies(reply, access, refresh);

    return reply.redirect(config.APP_ORIGIN);
  });
};
