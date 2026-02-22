import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStorageService } from "./index";

describe("Storage Abstraction Layer", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("getStorageService returns an object implementing IStorageService", () => {
    process.env.STORAGE_PROVIDER = "pilot";
    const service = getStorageService();
    expect(service).toBeDefined();
    expect(typeof service.upload).toBe("function");
    expect(typeof service.getDownloadUrl).toBe("function");
    expect(typeof service.delete).toBe("function");
  });

  it("getStorageService returns PilotStorageService when STORAGE_PROVIDER is unset or pilot", () => {
    process.env.STORAGE_PROVIDER = "pilot";
    process.env.STORAGE_ENDPOINT = "http://localhost:9000";
    process.env.STORAGE_ACCESS_KEY = "key";
    process.env.STORAGE_SECRET_KEY = "secret";
    process.env.STORAGE_BUCKET = "bucket";

    const service = getStorageService();
    expect(service).toBeDefined();
    expect(service.upload).toBeDefined();
    expect(service.getDownloadUrl).toBeDefined();
    expect(service.delete).toBeDefined();
  });

  it("getStorageService returns AzureGovStorageService when STORAGE_PROVIDER is azure_gov", async () => {
    process.env.STORAGE_PROVIDER = "azure_gov";
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;

    const service = getStorageService();
    await expect(
      service.upload(Buffer.from("test"), {
        organizationId: "org-1",
        controlId: "3.1.1",
        fileName: "policy.pdf",
        mimeType: "application/pdf",
      })
    ).rejects.toThrow("Azure Gov storage requires");
  });
});
