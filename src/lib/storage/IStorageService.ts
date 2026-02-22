/**
 * Storage abstraction for CMMC OS file handling.
 * All file operations go through this interface; no API route references a provider directly.
 */
export interface UploadMetadata {
  organizationId: string;
  controlId: string;
  fileName: string;
  mimeType: string;
}

export interface UploadResult {
  fileUrl: string;
  fileId: string;
}

export interface IStorageService {
  upload(
    file: Buffer,
    metadata: UploadMetadata
  ): Promise<UploadResult>;
  getDownloadUrl(fileId: string): Promise<string>;
  delete(fileId: string): Promise<void>;
}
