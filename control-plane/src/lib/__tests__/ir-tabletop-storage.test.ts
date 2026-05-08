import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  _resetIrTabletopStorageForTests,
  getIrTabletopStorage,
} from "../ir-tabletop-storage"

describe("ir-tabletop-storage — LocalFileStorage round-trip", () => {
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "ir-tabletop-test-"))
    process.env.IR_TABLETOP_STORAGE_DRIVER = "local"
    process.env.IR_TABLETOP_LOCAL_STORAGE_DIR = tmpDir
    _resetIrTabletopStorageForTests()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    process.env = { ...originalEnv }
    _resetIrTabletopStorageForTests()
  })

  it("writes bundle bytes and reads them back identical", async () => {
    const storage = getIrTabletopStorage()
    expect(storage.driverName).toBe("local")

    const bytes = Buffer.from("test-bundle-bytes-1234567890", "utf8")
    const { storageKey } = await storage.putBundle({
      organizationId: "00000000-0000-0000-0000-000000000aaa",
      exerciseId: "00000000-0000-0000-0000-000000000bbb",
      bundleVersion: 1,
      bytes,
    })

    expect(storageKey).toMatch(/^local:/)
    expect(storageKey).toContain("00000000-0000-0000-0000-000000000aaa")
    expect(storageKey).toContain("bundle-v1.zip")

    const fetched = await storage.getBundle(storageKey)
    expect(fetched).toBeTruthy()
    expect(fetched?.equals(bytes)).toBe(true)
  })

  it("returns null for missing storage keys", async () => {
    const storage = getIrTabletopStorage()
    const result = await storage.getBundle("local:nonexistent/key/bundle-v1.zip")
    expect(result).toBeNull()
  })

  it("returns null for storage keys from other drivers", async () => {
    const storage = getIrTabletopStorage()
    const result = await storage.getBundle("azure:some-container/some-blob")
    expect(result).toBeNull()
  })

  it("rejects path-traversal attempts in the storage key", async () => {
    const storage = getIrTabletopStorage()
    const result = await storage.getBundle("local:../../../etc/passwd")
    expect(result).toBeNull()
  })

  it("supports multiple versions for the same exercise", async () => {
    const storage = getIrTabletopStorage()
    const v1Bytes = Buffer.from("v1-content", "utf8")
    const v2Bytes = Buffer.from("v2-content-different", "utf8")
    const orgId = "00000000-0000-0000-0000-000000000aaa"
    const exerciseId = "00000000-0000-0000-0000-000000000bbb"

    const v1 = await storage.putBundle({
      organizationId: orgId,
      exerciseId,
      bundleVersion: 1,
      bytes: v1Bytes,
    })
    const v2 = await storage.putBundle({
      organizationId: orgId,
      exerciseId,
      bundleVersion: 2,
      bytes: v2Bytes,
    })

    expect(v1.storageKey).not.toBe(v2.storageKey)
    expect(await storage.getBundle(v1.storageKey)).toEqual(v1Bytes)
    expect(await storage.getBundle(v2.storageKey)).toEqual(v2Bytes)
  })
})

describe("ir-tabletop-storage — driver factory", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    _resetIrTabletopStorageForTests()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    _resetIrTabletopStorageForTests()
  })

  it("defaults to local driver when env var is unset", () => {
    delete process.env.IR_TABLETOP_STORAGE_DRIVER
    const storage = getIrTabletopStorage()
    expect(storage.driverName).toBe("local")
  })

  it("throws on unknown driver", () => {
    process.env.IR_TABLETOP_STORAGE_DRIVER = "ftp"
    expect(() => getIrTabletopStorage()).toThrow(/Unknown.*ftp/)
  })

  it("throws when azure-blob driver is requested without connection string", () => {
    process.env.IR_TABLETOP_STORAGE_DRIVER = "azure-blob"
    delete process.env.IR_TABLETOP_AZURE_STORAGE_CONNECTION
    expect(() => getIrTabletopStorage()).toThrow(
      /IR_TABLETOP_AZURE_STORAGE_CONNECTION/
    )
  })

  it("throws when s3 driver is requested without bucket", () => {
    process.env.IR_TABLETOP_STORAGE_DRIVER = "s3"
    delete process.env.IR_TABLETOP_S3_BUCKET
    process.env.IR_TABLETOP_AWS_REGION = "us-gov-west-1"
    expect(() => getIrTabletopStorage()).toThrow(/IR_TABLETOP_S3_BUCKET/)
  })

  it("throws when s3 driver is requested without region", () => {
    process.env.IR_TABLETOP_STORAGE_DRIVER = "s3"
    process.env.IR_TABLETOP_S3_BUCKET = "my-bucket"
    delete process.env.IR_TABLETOP_AWS_REGION
    expect(() => getIrTabletopStorage()).toThrow(/IR_TABLETOP_AWS_REGION/)
  })
})
