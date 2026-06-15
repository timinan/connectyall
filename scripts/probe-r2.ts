import { config } from 'dotenv';
config({ path: '.env.local' });
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function main() {
  const e = process.env;
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${e.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: e.R2_ACCESS_KEY_ID!,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY!,
    },
  });

  const listed = await s3.send(new ListObjectsV2Command({ Bucket: e.R2_BUCKET_NAME!, MaxKeys: 50 }));
  console.log('Objects in bucket (up to 50):');
  console.log(listed.Contents?.map(o => o.Key) ?? 'none');

  await s3.send(new PutObjectCommand({
    Bucket: e.R2_BUCKET_NAME!,
    Key: 'test/probe.txt',
    Body: 'hello',
    ContentType: 'text/plain',
  }));
  console.log('\nProbe uploaded to test/probe.txt');
}
main().catch(err => { console.error(err); process.exit(1); });
