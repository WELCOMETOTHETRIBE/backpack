import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IStorageService, UploadMetadata, UploadResult } from "./IStorageService";

const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT;
const STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;
const STORAGE_SECRET_KEY = process.env.STORAGE_SECRET_KEY;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET;

function getClient(): S3Client {
  if (!STORAGE_ENDPOINT || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY || !STORAGE_BUCKET) {
    throw new Error(
      "Pilot storage requires STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, and STORAGE_BUCKET"
    );
  }
  const isLocalStack = STORAGE_ENDPOINT.includes("localhost") || STORAGE_ENDPOINT.includes("127.0.0.1");
  return new S3Client({
    endpoint: STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
    },
    ...(isLocalStack && { forcePathStyle: true }),
  });
}

/**
 * Build object key: org/control/fileId so we can map fileId back to key.
 * We use a random UUID for the file segment to avoid collisions.
 */
function buildKey(organizationId: string, controlId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${organizationId}/${controlId}/${unique}-${safeName}`;
}

export class PilotStorageService implements IStorageService {
  private client: S3Client | null = null;
  private bucket: string | null = null;

  private ensureClient(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      this.client = getClient();
      this.bucket = STORAGE_BUCKET!;
    }
    return { client: this.client, bucket: this.bucket };
  }

  async upload(file: Buffer, metadata: UploadMetadata): Promise<UploadResult> {
    const { client, bucket } = this.ensureClient();
    const key = buildKey(
      metadata.organizationId,
      metadata.controlId,
      metadata.fileName
    );
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file,
        ContentType: metadata.mimeType,
      })
    );
    const fileUrl = `${STORAGE_ENDPOINT}/${bucket}/${key}`;
    return { fileUrl, fileId: key };
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    const { client, bucket } = this.ensureClient();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: fileId,
    });
    return getSignedUrl(client, command, { expiresIn: 3600 });
  }

  async delete(fileId: string): Promise<void> {
    const { client, bucket } = this.ensureClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: fileId,
      })
    );
  }
}
