import {
  type CreateFileBody,
  type CreateFileResponse,
  createFileResponseSchema,
  type FileItem,
  fileSchema,
} from '@repo/shared/schemas';
import type { FastifyInstance } from 'fastify';
import { memoryStorage } from './app.ts';
import { keyFromUrl } from './memory-storage.ts';
import type { TestSession } from './session.ts';

export function registerFile(
  app: FastifyInstance,
  session: TestSession,
  body: Partial<CreateFileBody> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/files',
    cookies: session.cookies,
    payload: {
      fileName: 'notes.txt',
      contentType: 'text/plain',
      sizeBytes: 11,
      ...body,
    },
  });
}

// What the browser's PUT to the signed URL leaves in the bucket.
export function putObject(
  app: FastifyInstance,
  registered: CreateFileResponse,
  sizeBytes: number,
): void {
  memoryStorage(app).objects.set(keyFromUrl(registered.uploadUrl), sizeBytes);
}

export function completeFile(
  app: FastifyInstance,
  session: TestSession,
  fileId: string,
) {
  return app.inject({
    method: 'POST',
    url: `/api/files/${fileId}/complete`,
    cookies: session.cookies,
  });
}

// Register → PUT → complete, failing loudly at any step.
export async function uploadFile(
  app: FastifyInstance,
  session: TestSession,
  body: Partial<CreateFileBody> = {},
): Promise<FileItem> {
  const registered = await registerFile(app, session, body);
  if (registered.statusCode !== 201) {
    throw new Error(`register failed: ${registered.body}`);
  }
  const target = createFileResponseSchema.parse(registered.json());
  putObject(app, target, body.sizeBytes ?? 11);
  const completed = await completeFile(app, session, target.fileId);
  if (completed.statusCode !== 200) {
    throw new Error(`complete failed: ${completed.body}`);
  }
  return fileSchema.parse(completed.json());
}
