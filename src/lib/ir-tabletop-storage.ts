/**
 * IR Tabletop bundle byte storage — driver abstraction.
 *
 * Stores the actual ZIP bytes of an archived bundle for byte-level evidence
 * defensibility. Without this, the manifest's per-file hash chain works but
 * the bytes themselves are recomputed at download time (which can drift if
 * generators are non-deterministic).
 *
 * Driver selection via env var IR_TABLETOP_STORAGE_DRIVER:
 *   - "local"      → filesystem under IR_TABLETOP_LOCAL_STORAGE_DIR (default ./var/ir-tabletop-bundles).
 *                    DEV ONLY — ephemeral container filesystems WILL lose bundles on restart.
 *   - "azure-blob" → Azure Blob Storage. Requires IR_TABLETOP_AZURE_STORAGE_CONNECTION
 *                    (connection string) + IR_TABLETOP_AZURE_CONTAINER (default "ir-tabletop-bundles").
 *                    Production target for Azure Government deployments.
 *
 * Storage key format is driver-prefixed so a single deployment can read
 * legacy entries written under one driver after switching to another:
 *   - "local:<orgId>/<exerciseId>/<filename>"
 *   - "azure:<container>/<blobPath>"
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { BlobServiceClient } from "@azure/storage-blob"

export interface IrTabletopStorage {
  putBundle(opts: PutBundleOpts): Promise<{ storageKey: string }>
  getBundle(storageKey: string): Promise<Buffer | null>
  readonly driverName: string
}

export type PutBundleOpts = {
  organizationId: string
  exerciseId: string
  bundleVersion: number
  bytes: Buffer
  contentType?: string
}

class LocalFileStorage implements IrTabletopStorage {
  readonly driverName = "local"
  constructor(private readonly baseDir: string) {}

  async putBundle(opts: PutBundleOpts): Promise<{ storageKey: string }> {
    const filename = `bundle-v${opts.bundleVersion}.zip`
    const dir = path.join(this.baseDir, opts.organizationId, opts.exerciseId)
    await fs.mkdir(dir, { recursive: true })
    const fullPath = path.join(dir, filename)
    await fs.writeFile(fullPath, opts.bytes)
    return {
      storageKey: `local:${opts.organizationId}/${opts.exerciseId}/${filename}`,
    }
  }

  async getBundle(storageKey: string): Promise<Buffer | null> {
    if (!storageKey.startsWith("local:")) return null
    const rel = storageKey.slice("local:".length)
    const fullPath = path.join(this.baseDir, rel)
    // Defense in depth: ensure resolved path stays inside baseDir.
    const resolved = path.resolve(fullPath)
    if (!resolved.startsWith(path.resolve(this.baseDir) + path.sep)) {
      return null
    }
    try {
      return await fs.readFile(resolved)
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException
      if (err.code === "ENOENT") return null
      throw e
    }
  }
}

class AzureBlobStorage implements IrTabletopStorage {
  readonly driverName = "azure-blob"
  private client: BlobServiceClient
  constructor(
    connectionString: string,
    private readonly defaultContainer: string
  ) {
    this.client = BlobServiceClient.fromConnectionString(connectionString)
  }

  async putBundle(opts: PutBundleOpts): Promise<{ storageKey: string }> {
    const container = this.client.getContainerClient(this.defaultContainer)
    // Private container by default (no public access argument).
    await container.createIfNotExists()
    const blobName = `${opts.organizationId}/${opts.exerciseId}/bundle-v${opts.bundleVersion}.zip`
    const blob = container.getBlockBlobClient(blobName)
    await blob.uploadData(opts.bytes, {
      blobHTTPHeaders: {
        blobContentType: opts.contentType ?? "application/zip",
      },
    })
    return { storageKey: `azure:${this.defaultContainer}/${blobName}` }
  }

  async getBundle(storageKey: string): Promise<Buffer | null> {
    if (!storageKey.startsWith("azure:")) return null
    const rest = storageKey.slice("azure:".length)
    const slashIdx = rest.indexOf("/")
    if (slashIdx === -1) return null
    const containerName = rest.slice(0, slashIdx)
    const blobName = rest.slice(slashIdx + 1)
    const container = this.client.getContainerClient(containerName)
    const blob = container.getBlockBlobClient(blobName)
    try {
      const buf = await blob.downloadToBuffer()
      return buf
    } catch (e: unknown) {
      const err = e as { statusCode?: number }
      if (err?.statusCode === 404) return null
      throw e
    }
  }
}

let cached: IrTabletopStorage | null = null

export function getIrTabletopStorage(): IrTabletopStorage {
  if (cached) return cached

  const driver = (process.env.IR_TABLETOP_STORAGE_DRIVER ?? "local").toLowerCase()
  if (driver === "azure-blob") {
    const conn = process.env.IR_TABLETOP_AZURE_STORAGE_CONNECTION
    if (!conn) {
      throw new Error(
        "IR_TABLETOP_STORAGE_DRIVER=azure-blob but IR_TABLETOP_AZURE_STORAGE_CONNECTION is not set"
      )
    }
    const container =
      process.env.IR_TABLETOP_AZURE_CONTAINER ?? "ir-tabletop-bundles"
    cached = new AzureBlobStorage(conn, container)
  } else if (driver === "local") {
    const baseDir = path.resolve(
      process.env.IR_TABLETOP_LOCAL_STORAGE_DIR ?? "./var/ir-tabletop-bundles"
    )
    cached = new LocalFileStorage(baseDir)
  } else {
    throw new Error(
      `Unknown IR_TABLETOP_STORAGE_DRIVER value: "${driver}" (expected "local" or "azure-blob")`
    )
  }

  return cached
}

/** Test seam — primarily for vitest. */
export function _resetIrTabletopStorageForTests(): void {
  cached = null
}
