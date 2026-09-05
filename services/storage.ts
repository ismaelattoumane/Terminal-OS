import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function createClient(): S3Client | null {
  if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY || !process.env.S3_BUCKET) return null;
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  });
}

const client = createClient();

export async function uploadCourseFile(key: string, file: File) {
  if (!client || !process.env.S3_BUCKET) return null;
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }));
  return `s3://${process.env.S3_BUCKET}/${key}`;
}

export async function deleteCourseFile(fileUrl: string | null) {
  if (!client || !process.env.S3_BUCKET || !fileUrl) return false;
  const prefix = `s3://${process.env.S3_BUCKET}/`;
  if (!fileUrl.startsWith(prefix)) return false;
  const key = fileUrl.slice(prefix.length);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function downloadCourseFile(fileUrl: string | null): Promise<Buffer | null> {
  if (!client || !process.env.S3_BUCKET || !fileUrl) return null;
  const prefix = `s3://${process.env.S3_BUCKET}/`;
  if (!fileUrl.startsWith(prefix)) return null;
  const key = fileUrl.slice(prefix.length);
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    if (!result.Body) return null;
    return Buffer.from(await result.Body.transformToByteArray());
  } catch {
    return null;
  }
}

export async function fileExists(key: string) {
  if (!client || !process.env.S3_BUCKET) return false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export function publicFileUrl(key: string) {
  if (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET) return null;
  const base = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT;
  return `${base.replace(/\/$/, "")}/${process.env.S3_BUCKET}/${key}`;
}

export async function checkStorage(): Promise<{ configured: boolean; reachable: boolean; bucket: string | null; region: string | null; error: string | null; lastChecked: string }> {
  if (!client || !process.env.S3_BUCKET) return { configured: false, reachable: false, bucket: null, region: null, error: null, lastChecked: new Date().toISOString() };
  try {
    await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
    return { configured: true, reachable: true, bucket: process.env.S3_BUCKET, region: process.env.S3_REGION ?? "auto", error: null, lastChecked: new Date().toISOString() };
  } catch (error) {
    return { configured: true, reachable: false, bucket: process.env.S3_BUCKET, region: process.env.S3_REGION ?? "auto", error: error instanceof Error ? error.message : "Bucket inaccessible", lastChecked: new Date().toISOString() };
  }
}
