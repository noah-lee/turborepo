import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { users } from '@repo/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  issueAccessToken,
  issueRefreshToken,
  setAuthCookies,
} from '../tokens.ts';

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_PKCE_COOKIE = 'oauth_pkce';
const OAUTH_COOKIE_PATH = '/api/auth/google';
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

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const googleTokenResponseSchema = z.object({
  id_token: z.string(),
});

const idTokenPayloadSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});

export const googleRoutes: FastifyPluginAsync = async (app) => {
  const { config } = app;
  const oauthCookieOptions = {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    path: OAUTH_COOKIE_PATH,
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
    url.searchParams.set('redirect_uri', config.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');

    return reply.redirect(url.toString());
  });

  app.get('/callback', async (req, reply) => {
    // State and PCKE verification
    const queryResult = callbackQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      reply.code(400);
      return { error: 'missing code or state' };
    }
    const { code, state } = queryResult.data;

    const signed = req.cookies[OAUTH_STATE_COOKIE];
    const verifier = req.cookies[OAUTH_PKCE_COOKIE];
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_COOKIE_PATH });
    reply.clearCookie(OAUTH_PKCE_COOKIE, { path: OAUTH_COOKIE_PATH });

    if (!signed || !verifier) {
      reply.code(400);
      return { error: 'missing oauth cookies' };
    }
    const unsigned = req.unsignCookie(signed);
    if (!unsigned.valid || !unsigned.value) {
      reply.code(400);
      return { error: 'invalid oauth state' };
    }
    if (!constantTimeEqual(unsigned.value, state)) {
      reply.code(400);
      return { error: 'oauth state mismatch' };
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
        redirect_uri: config.GOOGLE_REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) {
      app.log.error(
        { status: tokenRes.status },
        'google token exchange failed',
      );
      reply.code(502);
      return { error: 'token exchange failed' };
    }

    const tokenJson = googleTokenResponseSchema.safeParse(
      await tokenRes.json(),
    );
    if (!tokenJson.success) {
      app.log.error({ err: tokenJson.error }, 'invalid google token response');
      reply.code(502);
      return { error: 'invalid token response' };
    }

    const idToken = tokenJson.data.id_token;
    let rawPayload: unknown;
    try {
      rawPayload = decodeIdTokenPayload(idToken);
    } catch (err) {
      app.log.error({ err }, 'failed to decode id_token');
      reply.code(502);
      return { error: 'invalid id_token' };
    }
    const payloadParse = idTokenPayloadSchema.safeParse(rawPayload);
    if (!payloadParse.success) {
      app.log.error(
        { err: payloadParse.error },
        'id_token payload validation failed',
      );
      reply.code(502);
      return { error: 'invalid id_token' };
    }
    const payload = payloadParse.data;
    if (!payload.email_verified) {
      reply.code(403);
      return { error: 'email not verified' };
    }

    const [user] = await app.db
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

    if (!user) {
      reply.code(500);
      return { error: 'failed to upsert user' };
    }

    const access = issueAccessToken(app, user.id);
    const refresh = issueRefreshToken(app, user);
    setAuthCookies(reply, access, refresh);

    return reply.redirect(config.WEB_ORIGIN);
  });
};
