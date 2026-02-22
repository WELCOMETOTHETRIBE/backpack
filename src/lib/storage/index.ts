import type { IStorageService } from "./IStorageService";
import { PilotStorageService } from "./PilotStorageService";
import { AzureGovStorageService } from "./AzureGovStorageService";

export type { IStorageService, UploadMetadata, UploadResult } from "./IStorageService";
export { PilotStorageService } from "./PilotStorageService";
export { AzureGovStorageService } from "./AzureGovStorageService";

export function getStorageService(): IStorageService {
  const provider = process.env.STORAGE_PROVIDER ?? "pilot";
  if (provider === "azure_gov") {
    return new AzureGovStorageService();
  }
  return new PilotStorageService();
}
