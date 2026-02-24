import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of a buffer (for governance document versions, register attachments, evidence files).
 * Returns hex string (64 chars).
 */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
