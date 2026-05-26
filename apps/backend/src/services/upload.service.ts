import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { statusError } from '../utils/errors.js';
import { env } from '../env.js';

const LOCAL_AVATARS_DIR = '/app/uploads/avatars';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Bound libvips' worker pool. Sharp defaults to one thread per CPU, which on a
// busy host means a few concurrent avatar uploads can saturate the box. Two
// threads is more than enough to process a 512×512 JPEG and leaves headroom
// for the rest of the request handlers.
sharp.concurrency(2);

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: env.UPLOADS_REGION });
  }
  return s3Client;
}

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
 * saveAvatar — normalises the buffer to a 512×512 JPEG with EXIF stripped,
 * then writes it to the configured driver (S3 in prod, local disk in dev).
 * Returns a stable URL the frontend can serve directly.
 */
export async function saveAvatar(buffer: Buffer, userId: string): Promise<string> {
  // `limitInputPixels` caps the decoded pixel area so a small but
  // wildly-dimensioned "decompression bomb" upload (e.g. a 1×100M PNG) can't
  // make libvips allocate gigabytes before we've had a chance to reject it.
  const normalized = await sharp(buffer, { limitInputPixels: 16_000_000 })
    .rotate() // auto-rotate based on EXIF orientation before stripping
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .withMetadata({}) // strip all metadata (pass empty object to clear)
    .toBuffer();

  if (env.UPLOADS_DRIVER === 's3') {
    if (!env.UPLOADS_BUCKET) {
      throw new Error('UPLOADS_DRIVER=s3 but UPLOADS_BUCKET is not set');
    }
    const key = `avatars/${userId}.jpg`;
    await getS3Client().send(new PutObjectCommand({
      Bucket: env.UPLOADS_BUCKET,
      Key: key,
      Body: normalized,
      ContentType: 'image/jpeg',
      // Cache for an hour at the CDN; cache-bust via a ?v= parameter when we
      // start tracking avatar versions per user.
      CacheControl: 'public, max-age=3600',
    }));
    // Prefer the explicit public base (CloudFront) when set, otherwise fall
    // back to the regional virtual-host URL. The bucket has public-access
    // blocks on, so the regional URL only works when fronted by CloudFront
    // with OAC — that's the intended prod topology.
    if (env.UPLOADS_PUBLIC_URL) {
      return `${env.UPLOADS_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    }
    return `https://${env.UPLOADS_BUCKET}.s3.${env.UPLOADS_REGION}.amazonaws.com/${key}`;
  }

  await fs.mkdir(LOCAL_AVATARS_DIR, { recursive: true });
  const outputPath = path.join(LOCAL_AVATARS_DIR, `${userId}.jpg`);
  await fs.writeFile(outputPath, normalized);
  return `/avatars/${userId}.jpg`;
}
