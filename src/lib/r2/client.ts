import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env';

let cached: S3Client | undefined;

function s3() {
  if (cached) return cached;
  const e = env();
  cached = new S3Client({
    region: 'auto',
    endpoint: `https://${e.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: e.R2_ACCESS_KEY_ID,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

export async function uploadPhoto(input: {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  const e = env();
  await s3().send(
    new PutObjectCommand({
      Bucket: e.R2_BUCKET_NAME,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
    })
  );
  return `${e.R2_PUBLIC_URL_BASE}/${input.key}`;
}

export const uploadBytes = uploadPhoto;
