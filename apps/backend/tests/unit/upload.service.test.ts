import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock file-type so we can script the detected MIME without crafting real
// image bytes. We only exercise validateImageBuffer in this file; the sharp
// + S3 paths are integration territory.
const fileTypeMock = vi.fn();
vi.mock('file-type', () => ({
  fileTypeFromBuffer: (buf: Buffer) => fileTypeMock(buf),
}));

// sharp's import is a side-effect (sets concurrency); stub the default
// export to a no-op factory so the import succeeds without pulling the
// native binding.
vi.mock('sharp', () => {
  const stub = Object.assign(() => ({}), { concurrency: vi.fn() });
  return { default: stub };
});

// We don't reach the S3 client in any of these tests, but the upload module
// imports it at top level — stub to keep the import graph clean.
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
}));

vi.mock('../../src/env.js', () => ({
  env: {
    UPLOADS_DRIVER: 'local',
    UPLOADS_REGION: 'ca-central-1',
    UPLOADS_BUCKET: '',
  },
}));

import { validateImageBuffer } from '../../src/services/upload.service.js';

beforeEach(() => {
  fileTypeMock.mockReset();
});

describe('validateImageBuffer', () => {
  it.each([
    ['image/jpeg'],
    ['image/png'],
    ['image/webp'],
  ])('accepts %s', async (mime) => {
    fileTypeMock.mockResolvedValue({ mime, ext: mime.split('/')[1] });
    await expect(validateImageBuffer(Buffer.from('x'))).resolves.toBeUndefined();
  });

  it('rejects an unrecognised file with a 415 statusError', async () => {
    fileTypeMock.mockResolvedValue(undefined);
    await expect(validateImageBuffer(Buffer.from('garbage'))).rejects.toMatchObject({
      statusCode: 415,
      message: expect.stringContaining('unknown'),
    });
  });

  it('rejects a MIME type outside the JPEG/PNG/WebP allowlist', async () => {
    fileTypeMock.mockResolvedValue({ mime: 'image/gif', ext: 'gif' });
    await expect(validateImageBuffer(Buffer.from('gif'))).rejects.toMatchObject({
      statusCode: 415,
      message: expect.stringContaining('image/gif'),
    });
  });
});
