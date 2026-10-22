export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;

export type PresignedPut = {
  url: string;
  // The browser must send these with the PUT; the signature covers them.
  headers: Record<string, string>;
  expiresAt: Date;
};

export type PresignedGet = { url: string; expiresAt: Date };

export type StorageDriver = {
  presignPut(input: {
    key: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<PresignedPut>;
  // With `downloadName`, the bucket answers as an attachment saved under that name.
  presignGet(input: {
    key: string;
    downloadName?: string;
  }): Promise<PresignedGet>;
  // null when the object doesn't exist.
  headSize(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
};

export type Storage = Omit<StorageDriver, 'delete'> & {
  // Best effort: callers run it after a DB commit, so it logs failures instead of throwing.
  deleteMany(keys: string[]): Promise<void>;
};

export function storageKey(userId: string): string {
  return `users/${userId}/${crypto.randomUUID()}`;
}

// RFC 6266: a quoted ASCII fallback for old clients, and the exact name as UTF-8.
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
