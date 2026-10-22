import { files, type SelectFile } from '@repo/db';
import {
  type CreateFileResponse,
  createFileBodySchema,
  type DownloadUrlResponse,
  type FileItem,
  type FileListResponse,
  fileIdParamsSchema,
} from '@repo/shared/schemas';
import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { storageKey, UPLOAD_URL_TTL_MS } from '../storage/driver.ts';

// A pending row older than this was abandoned (its upload URL has long expired); the next
// upload by the same user clears it and its object, if any.
const ABANDONED_AFTER_MS = 4 * UPLOAD_URL_TTL_MS;

const notFound = { error: 'not_found' } as const;

function toFileItem(row: SelectFile, uploadedAt: Date): FileItem {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedAt: uploadedAt.toISOString(),
  };
}

// The bytes never pass through the api: it signs a PUT, the browser uploads straight to the
// bucket, then `complete` checks the object before the file counts as uploaded.
export const fileRoutes: FastifyPluginAsyncZod = async (app) => {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async (req) => {
    const rows = await app.db
      .select()
      .from(files)
      .where(and(eq(files.userId, req.user.sub), isNotNull(files.uploadedAt)))
      .orderBy(desc(files.uploadedAt), desc(files.id));
    return {
      files: rows.flatMap((row) =>
        row.uploadedAt ? [toFileItem(row, row.uploadedAt)] : [],
      ),
    } satisfies FileListResponse;
  });

  app.post(
    '/',
    { ...auth, schema: { body: createFileBodySchema } },
    async (req, reply) => {
      const userId = req.user.sub;
      const { fileName, contentType, sizeBytes } = req.body;
      const key = storageKey(userId);
      const presigned = await app.storage.presignPut({
        key,
        contentType,
        sizeBytes,
      });

      const abandoned = await app.db
        .delete(files)
        .where(
          and(
            eq(files.userId, userId),
            isNull(files.uploadedAt),
            lt(files.createdAt, new Date(Date.now() - ABANDONED_AFTER_MS)),
          ),
        )
        .returning({ key: files.storageKey });
      const [file] = await app.db
        .insert(files)
        .values({ userId, fileName, contentType, sizeBytes, storageKey: key })
        .returning({ id: files.id });
      if (!file) throw new Error('file insert returned no row');
      await app.storage.deleteMany(abandoned.map((row) => row.key));

      reply.code(201);
      return {
        fileId: file.id,
        uploadUrl: presigned.url,
        method: 'PUT',
        headers: presigned.headers,
        expiresAt: presigned.expiresAt.toISOString(),
      } satisfies CreateFileResponse;
    },
  );

  app.post(
    '/:fileId/complete',
    { ...auth, schema: { params: fileIdParamsSchema } },
    async (req, reply) => {
      const userId = req.user.sub;
      const owned = and(
        eq(files.id, req.params.fileId),
        eq(files.userId, userId),
      );
      const [file] = await app.db.select().from(files).where(owned);
      if (!file) {
        reply.code(404);
        return notFound;
      }
      if (file.uploadedAt) return toFileItem(file, file.uploadedAt);

      // Kept for a retry: the browser may still be uploading, or will PUT again.
      const size = await app.storage.headSize(file.storageKey);
      if (size === null) {
        reply.code(409);
        return { error: 'upload_incomplete' };
      }
      if (size !== file.sizeBytes) {
        await app.db.delete(files).where(owned);
        await app.storage.deleteMany([file.storageKey]);
        reply.code(400);
        return { error: 'upload_size_mismatch' };
      }

      const [uploaded] = await app.db
        .update(files)
        .set({ uploadedAt: new Date() })
        .where(owned)
        .returning();
      if (!uploaded?.uploadedAt) {
        reply.code(404);
        return notFound;
      }
      return toFileItem(uploaded, uploaded.uploadedAt);
    },
  );

  app.get(
    '/:fileId/download',
    { ...auth, schema: { params: fileIdParamsSchema } },
    async (req, reply) => {
      const [file] = await app.db
        .select({ key: files.storageKey, fileName: files.fileName })
        .from(files)
        .where(
          and(
            eq(files.id, req.params.fileId),
            eq(files.userId, req.user.sub),
            isNotNull(files.uploadedAt),
          ),
        );
      if (!file) {
        reply.code(404);
        return notFound;
      }
      // Served as an attachment, so an uploaded HTML or SVG file never renders.
      const signed = await app.storage.presignGet({
        key: file.key,
        downloadName: file.fileName,
      });
      return {
        url: signed.url,
        expiresAt: signed.expiresAt.toISOString(),
      } satisfies DownloadUrlResponse;
    },
  );

  app.delete(
    '/:fileId',
    { ...auth, schema: { params: fileIdParamsSchema } },
    async (req, reply) => {
      const [removed] = await app.db
        .delete(files)
        .where(
          and(eq(files.id, req.params.fileId), eq(files.userId, req.user.sub)),
        )
        .returning({ key: files.storageKey });
      if (!removed) {
        reply.code(404);
        return notFound;
      }
      await app.storage.deleteMany([removed.key]);
      return reply.code(204).send();
    },
  );
};
