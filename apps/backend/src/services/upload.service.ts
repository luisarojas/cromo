import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

const AVATARS_DIR = '/app/uploads/avatars';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * validateImageBuffer — checks the buffer's magic bytes to confirm it is a
 * supported image type (JPEG, PNG, or WebP). Throws an error if invalid.
 */
export async function validateImageBuffer(buffer: Buffer): Promise<void> {
  const result = await fileTypeFromBuffer(buffer);

  if (!result || !ALLOWED_MIME_TYPES.has(result.mime)) {
    const detected = result?.mime ?? 'unknown';
    const err = new Error(
      `Unsupported file type "${detected}". Only JPEG, PNG, and WebP images are accepted.`
    ) as Error & { statusCode: number };
    err.statusCode = 415;
    throw err;
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

  await sharp(buffer)
    .rotate() // auto-rotate based on EXIF orientation before stripping
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .withMetadata({}) // strip all metadata (pass empty object to clear)
    .toFile(outputPath);

  return `/avatars/${userId}.jpg`;
}
