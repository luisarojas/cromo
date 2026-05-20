import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { statusError } from '../utils/errors.js';

const AVATARS_DIR = '/app/uploads/avatars';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Bound libvips' worker pool. Sharp defaults to one thread per CPU, which on a
// busy host means a few concurrent avatar uploads can saturate the box. Two
// threads is more than enough to process a 512×512 JPEG and leaves headroom
// for the rest of the request handlers.
sharp.concurrency(2);

/**
 * validateImageBuffer — checks the buffer's magic bytes to confirm it is a
 * supported image type (JPEG, PNG, or WebP). Throws an error if invalid.
 */
export async function validateImageBuffer(buffer: Buffer): Promise<void> {
  const result = await fileTypeFromBuffer(buffer);

  if (!result || !ALLOWED_MIME_TYPES.has(result.mime)) {
    const detected = result?.mime ?? 'unknown';
    throw statusError(
      `Unsupported file type "${detected}". Only JPEG, PNG, and WebP images are accepted.`,
      415,
    );
  }
}

/**
 * saveAvatar — resizes the image to at most 512×512, strips EXIF metadata,
 * saves it as JPEG to /app/uploads/avatars/{userId}.jpg.
 * Returns the relative path /avatars/{userId}.jpg.
 */
export async function saveAvatar(buffer: Buffer, userId: string): Promise<string> {
  await fs.mkdir(AVATARS_DIR, { recursive: true });

  const outputPath = path.join(AVATARS_DIR, `${userId}.jpg`);

  // `limitInputPixels` caps the decoded pixel area so a small but
  // wildly-dimensioned "decompression bomb" upload (e.g. a 1×100M PNG) can't
  // make libvips allocate gigabytes before we've had a chance to reject it.
  await sharp(buffer, { limitInputPixels: 16_000_000 })
    .rotate() // auto-rotate based on EXIF orientation before stripping
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .withMetadata({}) // strip all metadata (pass empty object to clear)
    .toFile(outputPath);

  return `/avatars/${userId}.jpg`;
}
