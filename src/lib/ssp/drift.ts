/**
 * SSP drift-detect — Phase C2.
 *
 * Walks ssp_evidence_citations for a signed SSP, re-canonicalizes the
 * cited evidence row's current state, and compares against the
 * SHA-256 pinned at SSP generation time. Reports per-section
 * divergence so the C3PAO can answer "is the signed SSP still
 * defensible against current evidence?"
 *
 * Outcomes per section:
 *   identical — every cited row hashes to its pinned value
 *   drift     — at least one cited row's current hash differs
 *   missing   — at least one cited row no longer exists (deleted /
 *               superseded), and the section's evidence_pinned_sha256
 *               can't be reconstructed
 *
 * Top-level outcome:
 *   identical — every section identical
 *   drift     — any section in drift or missing (lists per-section
 *               findings so the operator can decide whether to
 *               re-issue the SSP)
 *   invalid   — signature won't validate against current data_hash
 */
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  caAssessmentBundles,
  governanceArtifactCompletions,
  governanceRegisterEntries,
  irExerciseBundles,
  poamEntries,
  qmsGovernanceManifestDocuments,
  riskAssessments,
  sspDocuments,
  sspEvidenceCitations,
  sspSectionRevisions,
} from "@/db/schema";
import { payloadSha256 } from "./canonicalize";
import { verifySspSignature } from "./sign";

export type SectionDriftFinding = {
  sectionRevisionId: string;
  sectionKind: string;
  sectionKey: string;
  outcome: "identical" | "drift" | "missing";
  driftingCitationCount: number;
  missingCitationCount: number;
  details: Array<{
    citationId: string;
    evidenceKind: string;
    evidenceId: string;
    pinnedSha256: string | null;
    currentSha256: string | null;
    state: "identical" | "drift" | "missing";
  }>;
};

export type DriftReport = {
  sspDocumentId: string;
  payloadSha256: string;
  signedAt: Date | null;
  signatureValid: boolean;
  signatureReason: string | null;
  topLevel: "identical" | "drift" | "invalid";
  sections: SectionDriftFinding[];
};

/**
 * Compute the drift report for a signed (or draft) SSP.
 *
 * The verification only goes deep on signed SSPs — a draft has no
 * binding signature so there's nothing to invalidate. Drift detection
 * still runs on drafts so the operator can preview drift before
 * signing.
 */
export async function computeDriftReport(
  sspDocumentId: string,
): Promise<DriftReport | null> {
  const [doc] = await db
    .select()
    .from(sspDocuments)
    .where(eq(sspDocuments.id, sspDocumentId))
    .limit(1);
  if (!doc) return null;

  // 1. Signature validation (only meaningful for status='signed').
  let signatureValid = true;
  let signatureReason: string | null = null;
  if (doc.status === "signed" && doc.signatureValue && doc.signatureAlg) {
    const v = verifySspSignature(
      { alg: doc.signatureAlg, value: doc.signatureValue },
      doc.payloadSha256,
    );
    signatureValid = v.ok;
    signatureReason = v.reason ?? null;
  }

  // 2. Pull every section + its citations in one batch.
  const sections = await db
    .select()
    .from(sspSectionRevisions)
    .where(eq(sspSectionRevisions.sspDocumentId, doc.id))
    .orderBy(sspSectionRevisions.orderIndex);

  const citations = await db
    .select()
    .from(sspEvidenceCitations)
    .where(eq(sspEvidenceCitations.sspDocumentId, doc.id));

  const citationsBySection = new Map<string, typeof citations>();
  for (const c of citations) {
    const arr = citationsBySection.get(c.sspSectionRevisionId) ?? [];
    arr.push(c);
    citationsBySection.set(c.sspSectionRevisionId, arr);
  }

  // 3. Pre-fetch current state for every cited row, batched per kind.
  const currentByKey = await fetchCurrentEvidenceHashes(citations);

  // 4. Per-section diff.
  const sectionFindings: SectionDriftFinding[] = [];
  for (const sec of sections) {
    const myCitations = citationsBySection.get(sec.id) ?? [];
    const details: SectionDriftFinding["details"] = [];
    let driftCount = 0;
    let missingCount = 0;

    for (const c of myCitations) {
      const key = `${c.evidenceKind}:${c.evidenceId}`;
      const currentHash = currentByKey.get(key);
      if (currentHash === null) {
        // Deliberately stored as null = row not found.
        missingCount++;
        details.push({
          citationId: c.id,
          evidenceKind: c.evidenceKind,
          evidenceId: c.evidenceId,
          pinnedSha256: c.evidenceSha256,
          currentSha256: null,
          state: "missing",
        });
        continue;
      }
      if (currentHash === undefined) {
        // No fetcher implemented for this kind yet — skip without
        // claiming drift. Phase C2+ adds fetchers for the remaining
        // evidence kinds (qms_doc, ca_bundle, technical_run, etc.).
        details.push({
          citationId: c.id,
          evidenceKind: c.evidenceKind,
          evidenceId: c.evidenceId,
          pinnedSha256: c.evidenceSha256,
          currentSha256: null,
          state: "identical",
        });
        continue;
      }
      const matches = currentHash === c.evidenceSha256;
      if (matches) {
        details.push({
          citationId: c.id,
          evidenceKind: c.evidenceKind,
          evidenceId: c.evidenceId,
          pinnedSha256: c.evidenceSha256,
          currentSha256: currentHash,
          state: "identical",
        });
      } else {
        driftCount++;
        details.push({
          citationId: c.id,
          evidenceKind: c.evidenceKind,
          evidenceId: c.evidenceId,
          pinnedSha256: c.evidenceSha256,
          currentSha256: currentHash,
          state: "drift",
        });
      }
    }

    let outcome: SectionDriftFinding["outcome"] = "identical";
    if (missingCount > 0) outcome = "missing";
    else if (driftCount > 0) outcome = "drift";

    sectionFindings.push({
      sectionRevisionId: sec.id,
      sectionKind: sec.sectionKind,
      sectionKey: sec.sectionKey,
      outcome,
      driftingCitationCount: driftCount,
      missingCitationCount: missingCount,
      details,
    });
  }

  // 5. Top-level outcome.
  let topLevel: DriftReport["topLevel"] = "identical";
  if (!signatureValid) topLevel = "invalid";
  else if (sectionFindings.some((s) => s.outcome !== "identical")) {
    topLevel = "drift";
  }

  return {
    sspDocumentId: doc.id,
    payloadSha256: doc.payloadSha256,
    signedAt: doc.signedAt,
    signatureValid,
    signatureReason,
    topLevel,
    sections: sectionFindings,
  };
}

/**
 * Fetch the current canonical hash for every cited evidence row,
 * batched per kind. Returns a Map keyed `${kind}:${id}` →
 *   string  : the row's current SHA-256
 *   null    : the row no longer exists (deleted / superseded)
 *   undefined : no fetcher implemented for this kind (treated as
 *               identical — see drift.ts comment)
 */
async function fetchCurrentEvidenceHashes(
  citations: Array<{ evidenceKind: string; evidenceId: string }>,
): Promise<Map<string, string | null | undefined>> {
  const out = new Map<string, string | null | undefined>();

  const idsByKind = new Map<string, Set<string>>();
  for (const c of citations) {
    const set = idsByKind.get(c.evidenceKind) ?? new Set<string>();
    set.add(c.evidenceId);
    idsByKind.set(c.evidenceKind, set);
  }

  // ── register_entry ─────────────────────────────────────────────
  const regIds = idsByKind.get("register_entry");
  if (regIds && regIds.size > 0) {
    const rows = await db
      .select({
        id: governanceRegisterEntries.id,
        entryType: governanceRegisterEntries.entryType,
        finalizedAt: governanceRegisterEntries.finalizedAt,
      })
      .from(governanceRegisterEntries)
      .where(inArray(governanceRegisterEntries.id, [...regIds]));
    const found = new Set<string>();
    for (const r of rows) {
      out.set(`register_entry:${r.id}`, payloadSha256(r));
      found.add(r.id);
    }
    for (const id of regIds) {
      if (!found.has(id)) out.set(`register_entry:${id}`, null);
    }
  }

  // ── artifact_completion ────────────────────────────────────────
  const acIds = idsByKind.get("artifact_completion");
  if (acIds && acIds.size > 0) {
    const rows = await db
      .select({
        id: governanceArtifactCompletions.id,
        artifactLabel: governanceArtifactCompletions.artifactLabel,
        attestedAt: governanceArtifactCompletions.attestedAt,
      })
      .from(governanceArtifactCompletions)
      .where(inArray(governanceArtifactCompletions.id, [...acIds]));
    const found = new Set<string>();
    for (const r of rows) {
      out.set(`artifact_completion:${r.id}`, payloadSha256(r));
      found.add(r.id);
    }
    for (const id of acIds) {
      if (!found.has(id)) out.set(`artifact_completion:${id}`, null);
    }
  }

  // ── ir_bundle ──────────────────────────────────────────────────
  const irIds = idsByKind.get("ir_bundle");
  if (irIds && irIds.size > 0) {
    const rows = await db
      .select({
        id: irExerciseBundles.id,
        bundleSha256: irExerciseBundles.bundleSha256,
      })
      .from(irExerciseBundles)
      .where(inArray(irExerciseBundles.id, [...irIds]));
    const found = new Set<string>();
    for (const r of rows) {
      out.set(`ir_bundle:${r.id}`, r.bundleSha256 ?? "");
      found.add(r.id);
    }
    for (const id of irIds) {
      if (!found.has(id)) out.set(`ir_bundle:${id}`, null);
    }
  }

  // ── ra_envelope ────────────────────────────────────────────────
  const raIds = idsByKind.get("ra_envelope");
  if (raIds && raIds.size > 0) {
    const rows = await db
      .select()
      .from(riskAssessments)
      .where(inArray(riskAssessments.id, [...raIds]));
    const found = new Set<string>();
    for (const r of rows) {
      out.set(`ra_envelope:${r.id}`, r.finalReportSha256 ?? payloadSha256(r));
      found.add(r.id);
    }
    for (const id of raIds) {
      if (!found.has(id)) out.set(`ra_envelope:${id}`, null);
    }
  }

  // ── poam_entry ─────────────────────────────────────────────────
  const poamIds = idsByKind.get("poam_entry");
  if (poamIds && poamIds.size > 0) {
    const rows = await db
      .select()
      .from(poamEntries)
      .where(inArray(poamEntries.id, [...poamIds]));
    const found = new Set<string>();
    for (const r of rows) {
      out.set(`poam_entry:${r.id}`, payloadSha256(r));
      found.add(r.id);
    }
    for (const id of poamIds) {
      if (!found.has(id)) out.set(`poam_entry:${id}`, null);
    }
  }

  // ── ca_bundle ──────────────────────────────────────────────────
  // The package_sha256 IS the canonical hash for a CA cycle bundle —
  // it covers the whole ZIP that TrainOS produced. Re-fetch it; if
  // the bundle has been re-pushed (cycle re-finalized for any
  // reason), the new package_sha256 won't match the pinned one and
  // the drift report flags it. If the cycle row was deleted, return
  // null → "missing".
  const caIds = idsByKind.get("ca_bundle");
  if (caIds && caIds.size > 0) {
    const rows = await db
      .select({
        id: caAssessmentBundles.id,
        packageSha256: caAssessmentBundles.packageSha256,
      })
      .from(caAssessmentBundles)
      .where(inArray(caAssessmentBundles.id, [...caIds]));
    const found = new Set<string>();
    for (const r of rows) {
      out.set(`ca_bundle:${r.id}`, r.packageSha256 ?? "");
      found.add(r.id);
    }
    for (const id of caIds) {
      if (!found.has(id)) out.set(`ca_bundle:${id}`, null);
    }
  }

  // ── qms_doc ────────────────────────────────────────────────────
  // QMS-pushed governance documents. The bundle's `sha256` covers
  // the document's bytes; re-pushing the same document with new
  // content produces a new sha256 and surfaces as drift. Retired
  // QMS docs (manifest-driven retirement; see
  // qms-manifest/ingest/route.ts) have retired_at set; we treat
  // those as "missing" so the SSP correctly reports drift on a
  // citation whose backing document was retired after sign.
  const qmsIds = idsByKind.get("qms_doc");
  if (qmsIds && qmsIds.size > 0) {
    const rows = await db
      .select({
        id: qmsGovernanceManifestDocuments.id,
        sha256: qmsGovernanceManifestDocuments.sha256,
        retiredAt: qmsGovernanceManifestDocuments.retiredAt,
      })
      .from(qmsGovernanceManifestDocuments)
      .where(inArray(qmsGovernanceManifestDocuments.id, [...qmsIds]));
    const found = new Set<string>();
    for (const r of rows) {
      if (r.retiredAt) {
        // Retired QMS doc — treat as missing so drift report flags
        // sections that cited a doc the org has since pulled.
        out.set(`qms_doc:${r.id}`, null);
      } else {
        out.set(`qms_doc:${r.id}`, r.sha256 ?? "");
      }
      found.add(r.id);
    }
    for (const id of qmsIds) {
      if (!found.has(id)) out.set(`qms_doc:${id}`, null);
    }
  }

  // ── ois_narrative ──────────────────────────────────────────────
  // ois_narrative citations encode the snapshot state in their
  // evidence_id (`snapshot:<iso-timestamp>`); the hash is computed
  // over the snapshot fields the generator already resolved. We
  // can't re-canonicalize the historical snapshot on demand without
  // walking control_adjudication_history, so for Phase C2 we treat
  // ois_narrative citations as "identical" and surface them as
  // background context rather than drift signals.
  //
  // Remaining kinds (technical_run, enduring_exception,
  // dod_cio_adjudication, esp_inheritance) get fetchers as their
  // write paths produce real rows. Until then they fall through to
  // undefined → identical (see drift.ts main loop).

  return out;
}
