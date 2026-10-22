import { files } from '@repo/db';
import {
  createFileResponseSchema,
  downloadUrlResponseSchema,
  MAX_FILE_BYTES,
} from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, memoryStorage } from './helpers/app.ts';
import { createFile } from './helpers/factories.ts';
import {
  completeFile,
  putObject,
  registerFile,
  uploadFile,
} from './helpers/files.ts';
import { keyFromUrl } from './helpers/memory-storage.ts';
import { createTestSession } from './helpers/session.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());
// setup.ts truncates the database; the app's bucket lives as long as the app.
beforeEach(() => memoryStorage(app).objects.clear());

const fileUrl = (id: string, suffix = '') => `/api/files/${id}${suffix}`;

describe('without a session', () => {
  it.each([
    ['GET', '/api/files'],
    ['POST', '/api/files'],
    ['POST', fileUrl(crypto.randomUUID(), '/complete')],
    ['GET', fileUrl(crypto.randomUUID(), '/download')],
    ['DELETE', fileUrl(crypto.randomUUID())],
  ] as const)('%s %s 401s', async (method, url) => {
    const res = await app.inject({ method, url, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/files', () => {
  it('signs a PUT for the declared type and records a pending file', async () => {
    const session = await createTestSession(app);
    const res = await registerFile(app, session, {
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
    });
    expect(res.statusCode).toBe(201);
    const body = createFileResponseSchema.parse(res.json());
    expect(body.method).toBe('PUT');
    expect(body.headers).toEqual({ 'Content-Type': 'application/pdf' });

    const [row] = await app.db
      .select()
      .from(files)
      .where(eq(files.id, body.fileId));
    expect(row).toMatchObject({
      userId: session.user.id,
      fileName: 'report.pdf',
      sizeBytes: 2048,
      uploadedAt: null,
      storageKey: keyFromUrl(body.uploadUrl),
    });
    expect(row?.storageKey).toMatch(new RegExp(`^users/${session.user.id}/`));
  });

  it.each([
    ['an oversized file', { sizeBytes: MAX_FILE_BYTES + 1 }],
    ['an empty file', { sizeBytes: 0 }],
    ['a blank name', { fileName: '  ' }],
    ['a malformed type', { contentType: 'text/html; charset=utf-8' }],
  ])('rejects %s', async (_label, body) => {
    const session = await createTestSession(app);
    const res = await registerFile(app, session, body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it("clears the user's abandoned pending uploads, and only those", async () => {
    const session = await createTestSession(app);
    const other = await createTestSession(app);
    const longAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const abandoned = await createFile(app.db, {
      userId: session.user.id,
      uploadedAt: null,
      createdAt: longAgo,
    });
    memoryStorage(app).objects.set(abandoned.storageKey, 11);
    const recent = await createFile(app.db, {
      userId: session.user.id,
      uploadedAt: null,
    });
    const othersAbandoned = await createFile(app.db, {
      userId: other.user.id,
      uploadedAt: null,
      createdAt: longAgo,
    });

    expect((await registerFile(app, session)).statusCode).toBe(201);

    const ids = (await app.db.select({ id: files.id }).from(files)).map(
      (r) => r.id,
    );
    expect(ids).not.toContain(abandoned.id);
    expect(ids).toContain(recent.id);
    expect(ids).toContain(othersAbandoned.id);
    expect(memoryStorage(app).objects.has(abandoned.storageKey)).toBe(false);
  });
});

describe('POST /api/files/:fileId/complete', () => {
  it('marks the file uploaded once the object is in the bucket', async () => {
    const session = await createTestSession(app);
    const target = createFileResponseSchema.parse(
      (await registerFile(app, session, { sizeBytes: 5 })).json(),
    );

    const early = await completeFile(app, session, target.fileId);
    expect(early.statusCode).toBe(409);
    expect(early.json()).toEqual({ error: 'upload_incomplete' });

    putObject(app, target, 5);
    const done = await completeFile(app, session, target.fileId);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({
      id: target.fileId,
      fileName: 'notes.txt',
      sizeBytes: 5,
    });

    const again = await completeFile(app, session, target.fileId);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(done.json());
  });

  it('discards an object whose size differs from the declared one', async () => {
    const session = await createTestSession(app);
    const target = createFileResponseSchema.parse(
      (await registerFile(app, session, { sizeBytes: 5 })).json(),
    );
    putObject(app, target, 6);

    const res = await completeFile(app, session, target.fileId);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'upload_size_mismatch' });
    expect(await app.db.select().from(files)).toEqual([]);
    expect(memoryStorage(app).objects.size).toBe(0);
  });

  it('400s a malformed id', async () => {
    const session = await createTestSession(app);
    const res = await completeFile(app, session, 'not-a-uuid');
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/files', () => {
  it('lists uploaded files newest first, leaving out pending ones', async () => {
    const session = await createTestSession(app);
    const older = await createFile(app.db, {
      userId: session.user.id,
      uploadedAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    const newer = await createFile(app.db, {
      userId: session.user.id,
      uploadedAt: new Date('2030-01-02T00:00:00.000Z'),
    });
    await createFile(app.db, { userId: session.user.id, uploadedAt: null });

    const res = await app.inject({
      method: 'GET',
      url: '/api/files',
      cookies: session.cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      files: [
        {
          id: newer.id,
          fileName: newer.fileName,
          contentType: 'text/plain',
          sizeBytes: 11,
          uploadedAt: '2030-01-02T00:00:00.000Z',
        },
        expect.objectContaining({ id: older.id }),
      ],
    });
  });
});

describe('GET /api/files/:fileId/download', () => {
  it('signs a GET that downloads under the original name', async () => {
    const session = await createTestSession(app);
    const file = await uploadFile(app, session, { fileName: 'Résumé.pdf' });

    const res = await app.inject({
      method: 'GET',
      url: fileUrl(file.id, '/download'),
      cookies: session.cookies,
    });
    expect(res.statusCode).toBe(200);
    const { url } = downloadUrlResponseSchema.parse(res.json());
    expect(new URL(url).searchParams.get('download')).toBe('Résumé.pdf');
  });

  it('404s a file that is still pending', async () => {
    const session = await createTestSession(app);
    const pending = await createFile(app.db, {
      userId: session.user.id,
      uploadedAt: null,
    });
    const res = await app.inject({
      method: 'GET',
      url: fileUrl(pending.id, '/download'),
      cookies: session.cookies,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/files/:fileId', () => {
  it('removes the row and the object', async () => {
    const session = await createTestSession(app);
    const file = await uploadFile(app, session);

    const res = await app.inject({
      method: 'DELETE',
      url: fileUrl(file.id),
      cookies: session.cookies,
    });
    expect(res.statusCode).toBe(204);
    expect(await app.db.select().from(files)).toEqual([]);
    expect(memoryStorage(app).objects.size).toBe(0);
  });
});

describe("another user's file", () => {
  it('is invisible to every route', async () => {
    const owner = await createTestSession(app);
    const other = await createTestSession(app);
    const file = await uploadFile(app, owner);

    const list = await app.inject({
      method: 'GET',
      url: '/api/files',
      cookies: other.cookies,
    });
    expect(list.json()).toEqual({ files: [] });

    for (const [method, url] of [
      ['POST', fileUrl(file.id, '/complete')],
      ['GET', fileUrl(file.id, '/download')],
      ['DELETE', fileUrl(file.id)],
    ] as const) {
      const res = await app.inject({ method, url, cookies: other.cookies });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }

    expect(await app.db.select().from(files)).toHaveLength(1);
    expect(memoryStorage(app).objects.size).toBe(1);
  });
});
