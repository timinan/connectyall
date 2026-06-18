import { describe, it, expect, vi } from 'vitest';

const { sendMock, PutObjectCommandMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({}),
  PutObjectCommandMock: vi.fn(function (this: { input: unknown }, input: unknown) { this.input = input; }),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function (this: { send: unknown }) { this.send = sendMock; }),
  PutObjectCommand: PutObjectCommandMock,
}));

vi.mock('../env', () => ({
  env: () => ({
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'k',
    R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKET_NAME: 'connectyall',
    R2_PUBLIC_URL_BASE: 'https://pub-test.r2.dev',
  }),
}));

import { uploadPhoto, uploadBytes } from './client';

describe('uploadPhoto', () => {
  it('uploads bytes to R2 and returns the same-origin proxy URL for profile keys', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const url = await uploadPhoto({ key: 'profiles/123.jpg', bytes, contentType: 'image/jpeg' });
    expect(url).toBe('/api/profile/photo/123');
    expect(PutObjectCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'connectyall',
        Key: 'profiles/123.jpg',
        ContentType: 'image/jpeg',
      })
    );
    expect(sendMock).toHaveBeenCalled();
  });
});

describe('uploadBytes', () => {
  it('uploadBytes is an alias for uploadPhoto', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const url = await uploadBytes({ key: 'captures/test.webm', bytes, contentType: 'audio/webm' });
    expect(url).toBe('https://pub-test.r2.dev/captures/test.webm');
  });
});
