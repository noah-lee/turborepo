import type { Page } from '@playwright/test';
import { STORAGE_ORIGIN, STORAGE_STATE } from '../support/env.ts';
import { expect, test } from '../support/fixtures.ts';

test.use({ storageState: STORAGE_STATE });

// No bucket exists in e2e, so every request to it is answered here. The api still signs real
// upload URLs, but its own HEAD would fail, so `complete` is answered here too.
const STORAGE = `${STORAGE_ORIGIN}/**`;
const CORS = { 'Access-Control-Allow-Origin': '*' };

const FILE = {
  id: '3f0c6f8e-6a43-4c55-9d1e-0f6f2b0d1a01',
  fileName: 'notes.txt',
  contentType: 'text/plain',
  sizeBytes: 11,
  uploadedAt: '2030-01-02T00:00:00.000Z',
};

// Serves GET /api/files from `list()`, so a test controls what the list shows.
async function routeFileList(page: Page, list: () => (typeof FILE)[]) {
  await page.route('**/api/files', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { files: list() } })
      : route.fallback(),
  );
}

const filesSection = (page: Page) =>
  page.getByRole('region', { name: 'Files' });

test('a new account shows no files', async ({ page }) => {
  await routeFileList(page, () => []);
  await page.goto('/account');
  await expect(filesSection(page).getByText('No files yet.')).toBeVisible();
});

test('uploading puts the file in the bucket and lists it', async ({ page }) => {
  let put: { method: string; contentType: string | null; body: string } | null =
    null;
  await page.route(STORAGE, async (route) => {
    const request = route.request();
    put = {
      method: request.method(),
      contentType: await request.headerValue('content-type'),
      body: request.postData() ?? '',
    };
    return route.fulfill({ status: 200, headers: CORS, body: '' });
  });
  let completed = false;
  await page.route('**/api/files/*/complete', (route) => {
    completed = true;
    return route.fulfill({ json: FILE });
  });
  await routeFileList(page, () => (completed ? [FILE] : []));

  await page.goto('/account');
  await filesSection(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: FILE.fileName,
      mimeType: FILE.contentType,
      buffer: Buffer.from('hello world'),
    });

  // The progress row shows the name too; only the listed file has actions.
  await expect(
    page.getByRole('button', { name: `Download ${FILE.fileName}` }),
  ).toBeVisible();
  expect(put).toEqual({
    method: 'PUT',
    contentType: 'text/plain',
    body: 'hello world',
  });
});

test('download saves the file under its name', async ({ page }) => {
  await routeFileList(page, () => [FILE]);
  await page.route('**/api/files/*/download', (route) =>
    route.fulfill({
      json: {
        url: `${STORAGE_ORIGIN}/users/u/${FILE.id}?signed=1`,
        expiresAt: '2030-01-02T00:05:00.000Z',
      },
    }),
  );
  await page.route(STORAGE, (route) =>
    route.fulfill({
      headers: {
        'Content-Disposition': `attachment; filename="${FILE.fileName}"`,
        'Content-Type': FILE.contentType,
      },
      body: 'hello world',
    }),
  );

  await page.goto('/account');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download ${FILE.fileName}` }).click();
  expect((await download).suggestedFilename()).toBe(FILE.fileName);
});

test('delete removes the file from the list', async ({ page }) => {
  let deleted = false;
  await routeFileList(page, () => (deleted ? [] : [FILE]));
  await page.route(`**/api/files/${FILE.id}`, (route) => {
    deleted = true;
    return route.fulfill({ status: 204 });
  });

  await page.goto('/account');
  await page.getByRole('button', { name: `Delete ${FILE.fileName}` }).click();
  await expect(filesSection(page).getByText('No files yet.')).toBeVisible();
  expect(deleted).toBe(true);
});
