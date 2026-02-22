import {
  BlobServiceClient,
  ContainerClient,
  BlockBlobClient,
  BlobSASPermissions,
} from "@azure/storage-blob";
import type { IStorageService, UploadMetadata, UploadResult } from "./IStorageService";

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER ?? "cmmc-artifacts";

/**
 * Azure Government blob endpoint suffix.
 * Use Azure Gov connection string in env for production.
 */
function getContainerClient(): ContainerClient {
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error(
      "Azure Gov storage requires AZURE_STORAGE_CONNECTION_STRING"
    );
  }
  const client = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  return client.getContainerClient(AZURE_STORAGE_CONTAINER);
}

function buildBlobName(organizationId: string, controlId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${organizationId}/${controlId}/${unique}-${safeName}`;
}

export class AzureGovStorageService implements IStorageService {
  private container: ContainerClient | null = null;

  private ensureContainer(): ContainerClient {
    if (!this.container) {
      this.container = getContainerClient();
    }
    return this.container;
  }

  async upload(file: Buffer, metadata: UploadMetadata): Promise<UploadResult> {
    const container = this.ensureContainer();
    const blobName = buildBlobName(
      metadata.organizationId,
      metadata.controlId,
      metadata.fileName
    );
    const blockBlob: BlockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlob.uploadData(file, {
      blobHTTPHeaders: { blobContentType: metadata.mimeType },
    });
    const fileUrl = blockBlob.url;
    return { fileUrl, fileId: blobName };
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    const blob = this.ensureContainer().getBlockBlobClient(fileId);
    const expiresOn = new Date(Date.now() + 3600 * 1000);
    return blob.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn,
    });
  }

  async delete(fileId: string): Promise<void> {
    const blob = this.ensureContainer().getBlockBlobClient(fileId);
    await blob.deleteIfExists();
  }
}
