import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const client = process.env.S3_ENDPOINT ? new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION ?? "auto", forcePathStyle: true, credentials: process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } : undefined }) : null;

export async function uploadCourseFile(key: string, file: File) {
  if (!client || !process.env.S3_BUCKET) return null;
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }));
  return `s3://${process.env.S3_BUCKET}/${key}`;
}

export async function checkStorage() {
  if (!client || !process.env.S3_BUCKET) return { configured: false, reachable: false };
  try { await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET })); return { configured: true, reachable: true }; } catch { return { configured: true, reachable: false }; }
}
