import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
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
  // Profile photos: serve via the same-origin proxy so the bucket can stay private.
  // For other uploads (cards), keep returning the public URL — those are served
  // via /api/cards/[id]/image, which works regardless of what's stored here.
  if (input.key.startsWith('profiles/')) {
    const filename = input.key.slice('profiles/'.length).split('.')[0]; // userId
    // ?v=<timestamp> busts browser + edge cache so a new upload is visible
    // instantly. Unchanged photos still hit the 24h cache on the proxy.
    return `/api/profile/photo/${filename}?v=${Date.now()}`;
  }
  return `${e.R2_PUBLIC_URL_BASE}/${input.key}`;
}

export const uploadBytes = uploadPhoto;

export async function downloadObject(key: string): Promise<Uint8Array> {
  const e = env();
  const res = await s3().send(new GetObjectCommand({ Bucket: e.R2_BUCKET_NAME, Key: key }));
  if (!res.Body) throw new Error(`R2: empty body for ${key}`);
  const bytes = await res.Body.transformToByteArray();
  return bytes;
}

export async function deleteObject(key: string): Promise<void> {
  const e = env();
  await s3().send(new DeleteObjectCommand({ Bucket: e.R2_BUCKET_NAME, Key: key }));
}

export async function listObjects(prefix: string): Promise<string[]> {
  const e = env();
  const out: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({ Bucket: e.R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) if (obj.Key) out.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}
