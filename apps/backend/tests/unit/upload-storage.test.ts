import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file, so any reference to a
// `const` declared at module scope would resolve to undefined when the mock
// runs. vi.hoisted is the supported escape hatch: it runs the closure during
// hoisting, returning the same object reference everyone shares.

const {
  mkdirMock, writeFileMock, readFileMock,
  pipelineToBuffer, pipelineToBufferWithInfo,
  s3SendMock,
} = vi.hoisted(() => ({
  mkdirMock: vi.fn().mockResolvedValue(undefined),
  writeFileMock: vi.fn().mockResolvedValue(undefined),
  readFileMock: vi.fn(),
  pipelineToBuffer: vi.fn(),
  pipelineToBufferWithInfo: vi.fn(),
  s3SendMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('node:fs/promises', () => ({
  default: { mkdir: mkdirMock, writeFile: writeFileMock, readFile: readFileMock },
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  readFile: readFileMock,
}));

vi.mock('sharp', () => {
  function pipeline(): {
    rotate: () => ReturnType<typeof pipeline>;
    resize: () => ReturnType<typeof pipeline>;
    jpeg: () => ReturnType<typeof pipeline>;
    withMetadata: () => ReturnType<typeof pipeline>;
    toBuffer: (opts?: { resolveWithObject?: boolean }) => unknown;
  } {
    return {
      rotate: () => pipeline(),
      resize: () => pipeline(),
      jpeg: () => pipeline(),
      withMetadata: () => pipeline(),
      toBuffer: (opts?: { resolveWithObject?: boolean }) =>
        opts?.resolveWithObject ? pipelineToBufferWithInfo() : pipelineToBuffer(),
    };
  }
  const stub = Object.assign(() => pipeline(), { concurrency: vi.fn() });
  return { default: stub };
});

vi.mock('file-type', () => ({ fileTypeFromBuffer: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client { send = s3SendMock; }
  class PutObjectCommand { constructor(public input: unknown) {} }
  class GetObjectCommand { constructor(public input: unknown) {} }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

// env: default to local driver; tests that need s3 re-mock.
vi.mock('../../src/env.js', () => ({
  env: {
    UPLOADS_DRIVER: 'local',
    UPLOADS_REGION: 'ca-central-1',
    UPLOADS_BUCKET: '',
    UPLOADS_PUBLIC_URL: '',
  },
}));

import { saveAvatar, saveReportAttachment, readReportAttachment } from '../../src/services/upload.service.js';

beforeEach(() => {
  mkdirMock.mockClear();
  writeFileMock.mockClear();
  readFileMock.mockReset();
  pipelineToBuffer.mockReset();
  pipelineToBufferWithInfo.mockReset();
  s3SendMock.mockClear();
});

// ── saveAvatar — local driver ───────────────────────────────────────────────

describe('saveAvatar (local driver)', () => {
  it('writes the normalised JPEG to /app/uploads/avatars/<userId>.jpg and returns the relative URL', async () => {
    pipelineToBuffer.mockResolvedValueOnce(Buffer.from('normalised-bytes'));
    const url = await saveAvatar(Buffer.from('input'), 'user-1');
    expect(url).toBe('/avatars/user-1.jpg');
    expect(mkdirMock).toHaveBeenCalledWith('/app/uploads/avatars', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith('/app/uploads/avatars/user-1.jpg', Buffer.from('normalised-bytes'));
    // No S3 traffic in local mode.
    expect(s3SendMock).not.toHaveBeenCalled();
  });
});

// ── saveAvatar — s3 driver ──────────────────────────────────────────────────

describe('saveAvatar (s3 driver)', () => {
  it('uploads to S3 and returns the public URL via UPLOADS_PUBLIC_URL when set', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: {
        UPLOADS_DRIVER: 's3',
        UPLOADS_REGION: 'ca-central-1',
        UPLOADS_BUCKET: 'my-bucket',
        UPLOADS_PUBLIC_URL: 'https://cdn.example.com/',
      },
    }));
    vi.resetModules();
    const sharpStub = await import('sharp');
    (sharpStub as { default: { concurrency: typeof vi.fn } }).default.concurrency = vi.fn();
    const { saveAvatar: s3SaveAvatar } = await import('../../src/services/upload.service.js');
    pipelineToBuffer.mockResolvedValueOnce(Buffer.from('normalised'));

    const url = await s3SaveAvatar(Buffer.from('input'), 'user-2');
    expect(url).toBe('https://cdn.example.com/avatars/user-2.jpg');

    expect(s3SendMock).toHaveBeenCalledTimes(1);
    const cmd = s3SendMock.mock.calls[0]![0] as { constructor: { name: string }; input: { Bucket: string; Key: string; ContentType: string } };
    expect(cmd.constructor.name).toBe('PutObjectCommand');
    expect(cmd.input.Bucket).toBe('my-bucket');
    expect(cmd.input.Key).toBe('avatars/user-2.jpg');
    expect(cmd.input.ContentType).toBe('image/jpeg');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('falls back to the regional virtual-host URL when UPLOADS_PUBLIC_URL is empty', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: {
        UPLOADS_DRIVER: 's3', UPLOADS_REGION: 'eu-west-1',
        UPLOADS_BUCKET: 'b2', UPLOADS_PUBLIC_URL: '',
      },
    }));
    vi.resetModules();
    const { saveAvatar: s3SaveAvatar } = await import('../../src/services/upload.service.js');
    pipelineToBuffer.mockResolvedValueOnce(Buffer.from('x'));
    const url = await s3SaveAvatar(Buffer.from('x'), 'u-3');
    expect(url).toBe('https://b2.s3.eu-west-1.amazonaws.com/avatars/u-3.jpg');
  });

  it('throws when the s3 driver is selected without UPLOADS_BUCKET', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: {
        UPLOADS_DRIVER: 's3', UPLOADS_REGION: 'ca-central-1',
        UPLOADS_BUCKET: '', UPLOADS_PUBLIC_URL: '',
      },
    }));
    vi.resetModules();
    const { saveAvatar: s3SaveAvatar } = await import('../../src/services/upload.service.js');
    pipelineToBuffer.mockResolvedValueOnce(Buffer.from('x'));
    await expect(s3SaveAvatar(Buffer.from('x'), 'u-4')).rejects.toThrow(/UPLOADS_BUCKET/);
  });
});

// ── saveReportAttachment — both drivers ────────────────────────────────────

describe('saveReportAttachment', () => {
  it('writes the normalised JPEG to reports/<reportId>/<uuid>.jpg locally', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: { UPLOADS_DRIVER: 'local', UPLOADS_REGION: 'ca-central-1', UPLOADS_BUCKET: '' },
    }));
    vi.resetModules();
    const { saveReportAttachment: localSave } = await import('../../src/services/upload.service.js');
    pipelineToBufferWithInfo.mockResolvedValueOnce({
      data: Buffer.from('out'),
      info: { width: 1024, height: 768 },
    });
    const result = await localSave(Buffer.from('input'), 'report-1');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
    expect(result.byteSize).toBe(3); // 'out'
    expect(result.storageKey).toMatch(/^reports\/report-1\/[0-9a-f-]+\.jpg$/);
    expect(writeFileMock).toHaveBeenCalled();
  });

  it('uploads to S3 with private cache headers when driver=s3', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: { UPLOADS_DRIVER: 's3', UPLOADS_REGION: 'ca-central-1', UPLOADS_BUCKET: 'b' },
    }));
    vi.resetModules();
    const { saveReportAttachment: s3Save } = await import('../../src/services/upload.service.js');
    pipelineToBufferWithInfo.mockResolvedValueOnce({
      data: Buffer.from('out'),
      info: { width: 2048, height: 2048 },
    });
    await s3Save(Buffer.from('x'), 'report-2');
    const cmd = s3SendMock.mock.calls[0]![0] as { input: { CacheControl: string; Key: string } };
    expect(cmd.input.CacheControl).toMatch(/private/);
    expect(cmd.input.Key).toMatch(/^reports\/report-2\//);
  });
});

// ── readReportAttachment — both drivers ─────────────────────────────────────

describe('readReportAttachment', () => {
  it('reads from the local bind mount when driver=local', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: { UPLOADS_DRIVER: 'local', UPLOADS_REGION: 'ca-central-1', UPLOADS_BUCKET: '' },
    }));
    vi.resetModules();
    const { readReportAttachment: localRead } = await import('../../src/services/upload.service.js');
    readFileMock.mockResolvedValueOnce(Buffer.from('attachment-bytes'));
    const out = await localRead('reports/r/x.jpg');
    expect(readFileMock).toHaveBeenCalledWith('/app/uploads/reports/r/x.jpg');
    expect(out.equals(Buffer.from('attachment-bytes'))).toBe(true);
  });

  it('reads via GetObjectCommand when driver=s3 and converts the body to a Buffer', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: { UPLOADS_DRIVER: 's3', UPLOADS_REGION: 'ca-central-1', UPLOADS_BUCKET: 'b' },
    }));
    vi.resetModules();
    const { readReportAttachment: s3Read } = await import('../../src/services/upload.service.js');

    s3SendMock.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
    const out = await s3Read('reports/r/x.jpg');
    expect(out.equals(Buffer.from([1, 2, 3]))).toBe(true);
  });

  it('throws 404 when S3 returns no usable body', async () => {
    vi.doMock('../../src/env.js', () => ({
      env: { UPLOADS_DRIVER: 's3', UPLOADS_REGION: 'ca-central-1', UPLOADS_BUCKET: 'b' },
    }));
    vi.resetModules();
    const { readReportAttachment: s3Read } = await import('../../src/services/upload.service.js');
    s3SendMock.mockResolvedValueOnce({});
    await expect(s3Read('reports/r/x.jpg')).rejects.toMatchObject({ statusCode: 404 });
  });
});
