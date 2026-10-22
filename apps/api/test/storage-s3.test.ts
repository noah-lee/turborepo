import { describe, expect, it } from 'vitest';
import { attachmentDisposition } from '../src/storage/driver.ts';
import { createS3Driver, s3BucketOrigin } from '../src/storage/s3.ts';
import { createTestConfig } from './helpers/config.ts';

// Presigning is local signing, so this runs offline with dummy credentials.
const config = createTestConfig({
  S3_ENDPOINT: 'https://nyc3.digitaloceanspaces.com',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
});

describe('s3 driver', () => {
  it('signs content type and length into a PUT without a body checksum', async () => {
    const { url, headers } = await createS3Driver(config).presignPut({
      key: `users/${crypto.randomUUID()}/${crypto.randomUUID()}`,
      contentType: 'application/pdf',
      sizeBytes: 1234,
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://bucket.nyc3.digitaloceanspaces.com');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host',
    );
    expect(url).not.toMatch(/x-amz-checksum|x-amz-sdk-checksum/i);
    expect(headers).toEqual({ 'Content-Type': 'application/pdf' });
  });

  it('signs a GET that answers as an attachment', async () => {
    const { url } = await createS3Driver(config).presignGet({
      key: 'users/u/f',
      downloadName: 'report.pdf',
    });
    expect(new URL(url).searchParams.get('response-content-disposition')).toBe(
      attachmentDisposition('report.pdf'),
    );
  });

  it('derives the bucket origin for the CSP', () => {
    expect(s3BucketOrigin(config)).toBe(
      'https://bucket.nyc3.digitaloceanspaces.com',
    );
  });
});

describe('attachmentDisposition', () => {
  it('keeps the exact name in filename* and an ASCII-safe fallback', () => {
    expect(attachmentDisposition('Résumé "final".pdf')).toBe(
      `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`,
    );
  });
});
