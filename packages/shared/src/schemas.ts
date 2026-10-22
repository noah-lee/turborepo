import { z } from 'zod';

// Each value is an api route segment (`/api/auth/<provider>/start`) and the value of
// `users.auth_provider`.
export const authProviderSchema = z.enum(['google']);

export type AuthProvider = z.infer<typeof authProviderSchema>;

export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  picture: z.url().nullable(),
  isPremium: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const subscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionResponseSchema = z.object({
  status: subscriptionStatusSchema,
  currentPeriodEnd: z.iso.datetime(),
  cancelAtPeriodEnd: z.boolean(),
});

export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

export const checkoutResponseSchema = z.object({
  url: z.url(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const fileSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.iso.datetime(),
});

export type FileItem = z.infer<typeof fileSchema>;

export const fileListResponseSchema = z.object({
  files: z.array(fileSchema),
});

export type FileListResponse = z.infer<typeof fileListResponseSchema>;

export const fileIdParamsSchema = z.object({
  fileId: z.uuid(),
});

export const createFileBodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  // Browsers report "" for unknown types; send application/octet-stream instead.
  contentType: z
    .string()
    .max(255)
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'Must be a MIME type'),
  sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
});

export type CreateFileBody = z.infer<typeof createFileBodySchema>;

export const createFileResponseSchema = z.object({
  fileId: z.uuid(),
  // A presigned bucket URL the browser PUTs the bytes to, sending `headers`.
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});

export type CreateFileResponse = z.infer<typeof createFileResponseSchema>;

export const downloadUrlResponseSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export type DownloadUrlResponse = z.infer<typeof downloadUrlResponseSchema>;
