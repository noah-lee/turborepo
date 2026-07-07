// Object-storage seam. Intentionally types + recipe only: no S3 SDK is shipped
// until a project actually needs uploads, keeping the base template dependency-
// free. When you need it, implement StorageProvider and decorate it onto the
// app (mirroring email/index.ts), then expose the two routes sketched below.

export type PresignedUpload = {
  // PUT the file bytes here directly from the browser (no proxying through the
  // api). Short-lived.
  uploadUrl: string;
  // The stable key you persist (e.g. on a user/row) to fetch the object later.
  key: string;
};

export interface StorageProvider {
  // Presign a direct-to-storage upload. `key` is caller-chosen and namespaced
  // (e.g. `avatars/${userId}/${uuid}`).
  presignUpload(key: string, contentType: string): Promise<PresignedUpload>;
  // Presign a time-limited download URL for a private object.
  presignDownload(key: string): Promise<string>;
}

// --- Recipe: Cloudflare R2 / AWS S3 via presigned PUT --------------------------
//
// R2 is S3-compatible and has no egress fees — a good default for small SaaS.
//
// 1. pnpm --filter @repo/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
// 2. Add env: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
//    S3_SECRET_ACCESS_KEY (validate them in config.ts alongside billing).
// 3. Implement the provider:
//
//   import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
//   import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
//
//   export function createStorageProvider(cfg): StorageProvider {
//     const s3 = new S3Client({
//       region: cfg.region,
//       endpoint: cfg.endpoint,          // R2: https://<account>.r2.cloudflarestorage.com
//       credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
//     });
//     return {
//       async presignUpload(key, contentType) {
//         const uploadUrl = await getSignedUrl(
//           s3,
//           new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }),
//           { expiresIn: 300 },
//         );
//         return { uploadUrl, key };
//       },
//       async presignDownload(key) {
//         return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
//           expiresIn: 300,
//         });
//       },
//     };
//   }
//
// 4. Route (browser flow): POST /uploads → { uploadUrl, key }; the browser PUTs
//    the file to uploadUrl; then persist `key`. Keep the bucket private and
//    serve reads through presignDownload.
