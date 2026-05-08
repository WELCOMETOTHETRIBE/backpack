/**
 * Zod schemas for the `mactech-governance-manifest.v1.1` envelope, as
 * received from QMS via POST /api/integrations/qms-manifest/ingest.
 *
 * Shape locked in docs/specs/qms-governance-manifest-ingest-brief.md
 * (commit cb43414+). This file is the inbound contract guard — any drift
 * fails the parse before the row hits the DB.
 *
 * Mirrors the Quality side's outbound builder (server/src/lib/
 * buildQmsGovernanceManifest.js once Quality publishes v1.1).
 */

import { z } from "zod";

// Permissive ISO timestamp accepting `Z` and offset variants. QMS emits
// UTC `Z` today; the optional-offset form preserves forward compatibility.
const isoTimestamp = z.string().datetime({ offset: true });

export const manifestIssuerSchema = z.object({
  service: z.string().min(1),
  url: z.string().url(),
  client_id: z.string().min(1),
  git_sha: z.string().optional(),
});

export const manifestSignatureSchema = z.object({
  alg: z.literal("HMAC-SHA256"),
  kid: z.string().min(1),
  value: z.string().min(1), // base64url of HMAC-SHA256(secret, signing_hash)
});

// Date field accepted as ISO timestamp, bare YYYY-MM-DD, null, or
// undefined. KEPT AS STRING (or null) — does NOT coerce to Date here.
// Reason: the canonicalization that drives content_hash must produce
// the SAME string on both sides. If we coerced strings to Date here,
// computeContentHash would emit different bytes than the QMS-side
// builder which sees the same string. Coercion to Date happens at DB
// insert time only (route handler).
const dateStringOrNull = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v == null) return null;
    if (v === "") return null;
    // Validate parseability without mutating value.
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return v;
  });

// v1.2 — per-doc signature row. Mirrors QMS DocumentSignature with the
// password_hash field intentionally omitted (re-auth artifact, not part of
// the audit chain). The chain proves who approved the doc and when, with
// the document_hash anchoring the doc state at signing time.
export const manifestSignatureSchema_perDoc = z.object({
  signer_name: z.string().nullable(),
  signer_email: z.string().nullable(),
  signature_meaning: z.string().nullable(),
  signed_at: z.string().datetime({ offset: true }).nullable(),
  document_hash: z.string().nullable(),
  signature_hash: z.string().nullable(),
});

export const manifestDocumentSchema = z.object({
  document_number: z.string().min(1),
  document_name: z.string().min(1),
  document_type: z.string().nullable().optional(),
  file_path: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  effective_date: dateStringOrNull,
  next_review_date: dateStringOrNull,
  sha256: z.string().regex(/^[0-9a-f]{64}$/i, "must be 64-char hex SHA-256"),
  file_size_bytes: z.number().int().nonnegative().nullable().optional(),
  controls_mapped: z.array(z.string()).default([]),
  // v1.2 — release state + per-doc signature chain. Optional for backward
  // compat with v1.1 envelopes (older builders don't emit these).
  released: z.boolean().optional(),
  released_at: dateStringOrNull.optional(),
  signatures: z.array(manifestSignatureSchema_perDoc).default([]).optional(),
});

export const releaseSummarySchema = z.object({
  released_docs: z.number().int().nonnegative(),
  unreleased_docs: z.number().int().nonnegative(),
});

export const manifestEnvelopeSchema = z
  .object({
    schema: z.string().regex(/^mactech-governance-manifest\.v1(\.\d+)?$/),
    generated_at: isoTimestamp,
    generated_by: z.string().optional(),
    tool_version: z.string().optional(),
    run_id: z.string().regex(/^GOV-[A-Za-z0-9-]+$/, "run_id must be GOV-prefixed"),
    base_path: z.string().optional(),
    source: z.string().min(1),

    review_period_start: isoTimestamp.optional(),
    review_period_end: isoTimestamp.optional(),

    issuer: manifestIssuerSchema,

    documents: z.array(manifestDocumentSchema),

    controls_touched: z.array(z.string()),
    doc_count: z.number().int().nonnegative(),

    // v1.2 — top-level lifecycle rollup. Optional for backward compat.
    release_summary: releaseSummarySchema.optional(),

    content_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
    signing_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
    signature: manifestSignatureSchema,
  })
  .superRefine((v, ctx) => {
    // doc_count must match documents.length
    if (v.doc_count !== v.documents.length) {
      ctx.addIssue({
        code: "custom",
        message: `doc_count (${v.doc_count}) does not match documents.length (${v.documents.length})`,
        path: ["doc_count"],
      });
    }
    // controls_touched must be a superset of every documents[].controls_mapped
    const touched = new Set(v.controls_touched);
    for (let i = 0; i < v.documents.length; i++) {
      const mapped = v.documents[i]?.controls_mapped ?? [];
      for (const cid of mapped) {
        if (!touched.has(cid)) {
          ctx.addIssue({
            code: "custom",
            message: `documents[${i}].controls_mapped contains "${cid}" not present in controls_touched`,
            path: ["controls_touched"],
          });
          return;
        }
      }
    }
  });

export type ManifestDocument = z.infer<typeof manifestDocumentSchema>;
export type ManifestEnvelope = z.infer<typeof manifestEnvelopeSchema>;
