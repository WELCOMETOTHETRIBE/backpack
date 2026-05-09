import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, FileSignature, Plus, ShieldCheck, Sparkles } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  organizations,
  qmsGovernanceManifestDocuments,
  qmsGovernanceManifests,
  sspDocControlSubmissions,
  sspDocuments,
  sspSectionRevisions,
  sspSignoffs,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { validateSspCompleteness } from "@/lib/ssp/completeness";
import { GenerateSspButton } from "./GenerateSspButton";
import { SubmitToDocControlButton } from "./SubmitToDocControlButton";
import { DocControlSignatureModal, type QmsSignatureRef } from "./DocControlSignatureModal";

const REQUIRED_SIGNOFF_KINDS = [
  "authorizing_official",
  "system_owner",
  "isso",
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /dashboard/ssp — SSP Versions page (Phase C).
 *
 * Replaces the legacy "authoring progress" page that read raw
 * implementation_status. Now reads from ssp_documents (Phase C0
 * schema) and renders one row per generated SSP version with:
 *
 *   - version number + lifecycle badge (draft / signed / superseded /
 *     revoked)
 *   - cryptographic provenance (payload_sha256 short form +
 *     copy-to-clipboard via the page's data attributes)
 *   - generation tally (MET / NOT MET / N/A) — these match the SCTM
 *     and dashboard counts because they all read the canonical helper
 *   - sign-off chain (which AO/system_owner/ISSO rows are bound to
 *     this version's payload_sha256)
 *   - drift status link to GET /api/ssp/[id]/verify
 *
 * Plus a "Generate new version" CTA — Admin-only — that POSTs to
 * /api/ssp/generate. After the new version is issued the page revalidates.
 */
export default async function SspPage() {
  const session = await auth();
  const user = session?.user as
    | { organizationId?: string; role?: string }
    | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/sign-in");

  const isAdmin = user?.role === "Admin";

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const versions = await db
    .select({
      id: sspDocuments.id,
      versionNumber: sspDocuments.versionNumber,
      status: sspDocuments.status,
      generatedAt: sspDocuments.generatedAt,
      generatedFromSnapshotAt: sspDocuments.generatedFromSnapshotAt,
      payloadSha256: sspDocuments.payloadSha256,
      signatureAlg: sspDocuments.signatureAlg,
      signedAt: sspDocuments.signedAt,
      controlsCovered: sspDocuments.controlsCovered,
      controlsMet: sspDocuments.controlsMet,
      controlsNotMet: sspDocuments.controlsNotMet,
      controlsNa: sspDocuments.controlsNa,
      controlsMetViaEvidence: sspDocuments.controlsMetViaEvidence,
      controlsMetViaEsp: sspDocuments.controlsMetViaEsp,
      controlsMetViaEnduringException: sspDocuments.controlsMetViaEnduringException,
      controlsMetViaDodCio: sspDocuments.controlsMetViaDodCio,
      controlsMetViaOpPlan: sspDocuments.controlsMetViaOpPlan,
    })
    .from(sspDocuments)
    .where(eq(sspDocuments.organizationId, orgId))
    .orderBy(desc(sspDocuments.versionNumber));

  // Sign-off counts per version.
  const signoffs = await db
    .select({
      sspDocumentId: sspSignoffs.sspDocumentId,
      signoffKind: sspSignoffs.signoffKind,
      signerDisplayName: sspSignoffs.signerDisplayName,
      signedAt: sspSignoffs.signedAt,
      dataHash: sspSignoffs.dataHash,
    })
    .from(sspSignoffs)
    .where(eq(sspSignoffs.organizationId, orgId));
  const signoffsByDoc = new Map<string, typeof signoffs>();
  for (const s of signoffs) {
    if (!s.sspDocumentId) continue;
    const arr = signoffsByDoc.get(s.sspDocumentId) ?? [];
    arr.push(s);
    signoffsByDoc.set(s.sspDocumentId, arr);
  }

  // Doc Control submission state per version. Latest row per
  // ssp_document_id wins; status + bridge transmission state drive the
  // badge + button gating.
  const versionIds = versions.map((v) => v.id);
  const submissions =
    versionIds.length > 0
      ? await db
          .select({
            id: sspDocControlSubmissions.id,
            sspDocumentId: sspDocControlSubmissions.sspDocumentId,
            status: sspDocControlSubmissions.status,
            submittedAt: sspDocControlSubmissions.submittedAt,
            qmsDocumentNumber: sspDocControlSubmissions.qmsDocumentNumber,
            qmsSubmissionId: sspDocControlSubmissions.qmsSubmissionId,
            releasedAt: sspDocControlSubmissions.releasedAt,
            rejectedAt: sspDocControlSubmissions.rejectedAt,
            rejectedReason: sspDocControlSubmissions.rejectedReason,
            outboundAttemptCount:
              sspDocControlSubmissions.outboundAttemptCount,
            lastOutboundError: sspDocControlSubmissions.lastOutboundError,
            lastOutboundAttemptAt:
              sspDocControlSubmissions.lastOutboundAttemptAt,
          })
          .from(sspDocControlSubmissions)
          .where(
            and(
              eq(sspDocControlSubmissions.organizationId, orgId),
              inArray(sspDocControlSubmissions.sspDocumentId, versionIds),
            ),
          )
          .orderBy(desc(sspDocControlSubmissions.submittedAt))
      : [];
  // Latest submission per doc (orderBy is desc so first occurrence wins).
  const latestSubmissionByDoc = new Map<
    string,
    (typeof submissions)[number]
  >();
  for (const s of submissions) {
    if (!latestSubmissionByDoc.has(s.sspDocumentId)) {
      latestSubmissionByDoc.set(s.sspDocumentId, s);
    }
  }

  // For released submissions, pull the QMS-side e-signatures from the
  // most-recent ingested manifest's per-doc row. Powers the
  // "Open in Doc Control" modal — auditor-ready signature ledger with
  // full hash provenance, no extra round-trip on click.
  const releasedDocNumbers = Array.from(latestSubmissionByDoc.values())
    .filter((s) => s.status === "released" && s.qmsDocumentNumber)
    .map((s) => s.qmsDocumentNumber as string);
  const qmsSignaturesByDocNumber = new Map<string, QmsSignatureRef[]>();
  if (releasedDocNumbers.length > 0) {
    // postgres-js binds a JS array as a string ("SSP-017") rather than a
    // Postgres array literal ('{SSP-017}'), so `= ANY($n)` 22P02s with
    // `malformed array literal`. Use an explicit IN list joined via
    // sql.join — each element becomes its own bound parameter, no array
    // marshalling needed.
    const rows = await db.execute<{
      document_number: string;
      signatures: unknown;
    }>(sql`
      SELECT DISTINCT ON (document_number)
        document_number,
        signatures
      FROM ${qmsGovernanceManifestDocuments}
      WHERE organization_id = ${orgId}
        AND document_number IN (${sql.join(
          releasedDocNumbers.map((n) => sql`${n}`),
          sql`, `,
        )})
      ORDER BY document_number,
               (SELECT received_at FROM ${qmsGovernanceManifests} WHERE run_id = ${qmsGovernanceManifestDocuments}.run_id) DESC
    `);
    for (const r of rows) {
      const raw = (r.signatures as Array<Record<string, unknown>> | null) ?? [];
      const refs: QmsSignatureRef[] = raw.map((s) => ({
        signerName: (s.signer_name as string | null) ?? null,
        signerEmail: (s.signer_email as string | null) ?? null,
        signedAt: (s.signed_at as string | null) ?? null,
        signatureMeaning: (s.signature_meaning as string | null) ?? null,
        documentHash: (s.document_hash as string | null) ?? null,
        signatureHash: (s.signature_hash as string | null) ?? null,
      }));
      qmsSignaturesByDocNumber.set(r.document_number, refs);
    }
  }

  // Completeness per version — Tier 2 #7. Walk every version's
  // sspSectionRevisions and run validateSspCompleteness so the page
  // shows "8/8" or "Missing: [b], [d]" inline before the operator
  // clicks Submit.
  const completenessByDoc = new Map<
    string,
    ReturnType<typeof validateSspCompleteness>
  >();
  if (versionIds.length > 0) {
    const allSections = await db
      .select({
        sspDocumentId: sspSectionRevisions.sspDocumentId,
        sectionKind: sspSectionRevisions.sectionKind,
        sectionKey: sspSectionRevisions.sectionKey,
        bodyMd: sspSectionRevisions.bodyMd,
        bodyJson: sspSectionRevisions.bodyJson,
        aggregateFinding: sspSectionRevisions.aggregateFinding,
        metVia: sspSectionRevisions.metVia,
      })
      .from(sspSectionRevisions)
      .where(inArray(sspSectionRevisions.sspDocumentId, versionIds));
    const sectionsByDoc = new Map<string, typeof allSections>();
    for (const s of allSections) {
      const arr = sectionsByDoc.get(s.sspDocumentId) ?? [];
      arr.push(s);
      sectionsByDoc.set(s.sspDocumentId, arr);
    }
    // First-version detection: across all versions for this org, the
    // earliest is "first." A version is first iff it's the only one OR
    // its versionNumber is the minimum.
    const minVersionNumber = Math.min(...versions.map((v) => v.versionNumber));
    for (const v of versions) {
      const sections = sectionsByDoc.get(v.id) ?? [];
      completenessByDoc.set(
        v.id,
        validateSspCompleteness({
          sections: sections.map((s) => ({
            sectionKind: s.sectionKind,
            sectionKey: s.sectionKey,
            bodyMd: s.bodyMd,
            bodyJson: s.bodyJson,
            aggregateFinding: s.aggregateFinding,
            metVia: s.metVia,
          })),
          generation: {
            isFirstVersion:
              versions.length === 1 || v.versionNumber === minVersionNumber,
          },
        }),
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            CA.L2-3.12.4 — System Security Plan
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
            System Security Plan — {org?.name ?? org?.slug ?? "Your organization"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            One row per generated SSP version. Each version carries a
            deterministic <code>payload_sha256</code> over the canonical
            JSON and binds every cited evidence row by SHA-256.
            The <em>verify</em> action re-derives current evidence
            hashes and reports per-section drift — the C3PAO walkthrough
            asks "is this signed SSP still defensible against current
            state?" with one click.
          </p>
        </div>
        {isAdmin && <GenerateSspButton />}
      </header>

      {versions.length === 0 ? (
        <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <FileSignature className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 text-sm text-gray-700">
            No SSP versions generated yet.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {isAdmin
              ? "Click “Generate new version” above to issue the first draft from current canonical state."
              : "Ask an Admin to issue the first draft from current canonical state."}
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {versions.map((v) => {
            const signs = signoffsByDoc.get(v.id) ?? [];
            const defensible = v.controlsMet + v.controlsNa;
            const submission = latestSubmissionByDoc.get(v.id) ?? null;
            const completeness = completenessByDoc.get(v.id) ?? null;

            // Pre-flight gates for the Submit-to-Doc-Control button —
            // mirror the server-side checks so the disabled tooltip
            // tells the operator exactly what's missing.
            const presentSignoffKinds = new Set(
              signs
                .filter((s) => s.dataHash === v.payloadSha256)
                .map((s) => s.signoffKind),
            );
            const missingSignoffs = REQUIRED_SIGNOFF_KINDS.filter(
              (k) => !presentSignoffKinds.has(k),
            );
            const inFlight = submission?.status === "submitted";
            const released = submission?.status === "released";
            let blockedReason: string | null = null;
            if (v.status !== "signed") {
              blockedReason =
                `Only signed SSP versions can be submitted (this version is '${v.status}').`;
            } else if (missingSignoffs.length > 0) {
              blockedReason =
                `Missing sign-off(s): ${missingSignoffs.join(", ")}. Collect them on the version detail page first.`;
            } else if (inFlight) {
              blockedReason = `A submission for this version is already in flight (since ${
                submission?.submittedAt
                  ? new Date(submission.submittedAt).toISOString().slice(0, 10)
                  : "—"
              }).`;
            } else if (released) {
              blockedReason = `Already released by Doc Control as ${
                submission?.qmsDocumentNumber ?? "(QMS doc)"
              }.`;
            } else if (completeness && !completeness.ok) {
              // Tier 2 #7 — block submit if CA.L2-3.12.4 [a]–[h] check
              // fails. Server-side gate also enforces this; surfacing
              // here means the operator never clicks a doomed button.
              blockedReason = `SSP incomplete (${completeness.satisfiedCount}/${completeness.totalCount} CA.L2-3.12.4 objectives). Missing: ${completeness.missing
                .map((o) => `[${o}]`)
                .join(
                  ", ",
                )}. Per v2.13 page 209, an incomplete SSP is a terminal-failure event — generate a new version that addresses the gaps.`;
            }
            const canSubmit = blockedReason === null;
            return (
              <li
                key={v.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Version {v.versionNumber}
                    </h2>
                    <StatusBadge status={v.status} />
                    {completeness && (
                      <CompletenessBadge completeness={completeness} />
                    )}
                    <span
                      className="font-mono text-xs text-gray-500"
                      title={`payload_sha256: ${v.payloadSha256}`}
                    >
                      sha256:{v.payloadSha256.slice(0, 12)}…
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Generated {new Date(v.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <Stat label="MET" value={v.controlsMet} tone="emerald" />
                  <Stat label="NOT MET" value={v.controlsNotMet} tone="rose" />
                  <Stat label="N/A" value={v.controlsNa} tone="gray" />
                  <Stat label="Defensible" value={defensible} tone="sky" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-600 sm:grid-cols-5">
                  <MetViaPill label="evidence" n={v.controlsMetViaEvidence} />
                  <MetViaPill label="ESP" n={v.controlsMetViaEsp} />
                  <MetViaPill label="enduring" n={v.controlsMetViaEnduringException} />
                  <MetViaPill label="DoD CIO" n={v.controlsMetViaDodCio} />
                  <MetViaPill label="op plan" n={v.controlsMetViaOpPlan} />
                </div>

                {v.status === "signed" && (
                  <div className="mt-4 border-t border-gray-100 pt-3 text-xs">
                    <span className="font-medium text-gray-700">Signed:</span>{" "}
                    <span className="text-gray-600">
                      {v.signedAt
                        ? new Date(v.signedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC"
                        : "—"}
                      {" · "}
                      alg <code className="rounded bg-gray-100 px-1">{v.signatureAlg}</code>
                    </span>
                  </div>
                )}

                {signs.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium text-gray-700">Sign-offs</p>
                    <ul className="mt-1 space-y-1 text-xs text-gray-600">
                      {signs.map((s, i) => (
                        <li key={i}>
                          <span className="font-medium">{s.signoffKind.replace(/_/g, " ")}</span>{" — "}
                          {s.signerDisplayName} ·{" "}
                          {s.signedAt ? new Date(s.signedAt).toISOString().slice(0, 10) : "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/*
                  Doc Control release-flow traceability panel. End state:
                  this collapses into "Released by QMS — SSP-001 (sha256:…)"
                  with an Open in QMS link once Phase 3 wires the inbound
                  linker. For now (Phase 1) we surface the submission
                  state machine + the action.
                */}
                <DocControlPanel
                  submission={submission}
                  isAdmin={isAdmin}
                  sspDocumentId={v.id}
                  canSubmit={canSubmit}
                  blockedReason={blockedReason}
                  qmsSignatures={
                    submission?.qmsDocumentNumber
                      ? qmsSignaturesByDocNumber.get(submission.qmsDocumentNumber) ?? []
                      : []
                  }
                  qmsSha256={v.payloadSha256}
                />

                <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs">
                  <a
                    href={`/api/ssp/${v.id}/pdf`}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-700"
                  >
                    Download PDF
                  </a>
                  <a
                    href={`/api/ssp/${v.id}?format=md`}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2.5 py-1 font-medium text-sky-700 hover:bg-sky-100"
                  >
                    Markdown
                  </a>
                  <a
                    href={`/api/ssp/${v.id}?format=raw`}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    JSON payload
                  </a>
                  <Link
                    href={`/api/ssp/${v.id}/verify`}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Verify against current evidence
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        <Sparkles className="mr-1 inline h-3 w-3" />
        Per CA.L2-3.12.4 [a]–[h] (CMMC L2 Assessment Guide v2.13), the SSP
        is updated annually and on material change. Click <em>verify</em>
        on any signed version to confirm it&rsquo;s still defensible
        against current evidence; if drift is reported, generate a new
        version to supersede.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "signed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "draft"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : status === "superseded"
          ? "bg-gray-100 text-gray-600 ring-gray-200"
          : "bg-rose-50 text-rose-700 ring-rose-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${cls}`}
    >
      {status}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "gray" | "sky";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/40 text-emerald-900"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50/40 text-rose-900"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50/40 text-sky-900"
          : "border-gray-200 bg-gray-50/40 text-gray-700";
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

/**
 * Per-version Doc Control state panel. Reads the latest submission
 * row and renders one of four states:
 *
 *   not_submitted → CTA visible (Admin only). Tooltip explains gates.
 *   submitted     → "In flight with Doc Control" badge + submitted-at.
 *   released      → "Released by Doc Control as SSP-001" + sha256 +
 *                   click-through to /dashboard/documents (Phase 3
 *                   wires the QMS document_number → URL mapping).
 *   rejected      → "Doc Control rejected" badge + reason. Resubmit
 *                   becomes available again because rejection clears
 *                   the in-flight constraint.
 */
function DocControlPanel({
  submission,
  isAdmin,
  sspDocumentId,
  canSubmit,
  blockedReason,
  qmsSignatures,
  qmsSha256,
}: {
  submission: {
    id: string;
    status: string;
    submittedAt: Date | string;
    qmsDocumentNumber: string | null;
    qmsSubmissionId: string | null;
    releasedAt: Date | string | null;
    rejectedAt: Date | string | null;
    rejectedReason: string | null;
    outboundAttemptCount: number;
    lastOutboundError: string | null;
    lastOutboundAttemptAt: Date | string | null;
  } | null;
  isAdmin: boolean;
  sspDocumentId: string;
  canSubmit: boolean;
  blockedReason: string | null;
  /** QMS-side signatures for the released doc; populated only when status === 'released'. */
  qmsSignatures: QmsSignatureRef[];
  qmsSha256: string | null;
}) {
  return (
    <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-900">
            Doc Control
          </p>
          {!submission && (
            <p className="mt-1 text-xs text-violet-900/80">
              Not yet submitted to MacTech Quality.{" "}
              {isAdmin
                ? "Submitting routes the SSP through Reviewer / Approver / Quality Release for formal release alongside every other authorized doc."
                : "Ask an Admin to submit this signed version for release."}
            </p>
          )}
          {submission?.status === "submitted" && (
            <div className="mt-1 space-y-1">
              {submission.qmsSubmissionId ? (
                <p className="text-xs text-violet-900/80">
                  <span className="font-medium">In flight with Doc Control</span>{" "}
                  since{" "}
                  {new Date(submission.submittedAt).toISOString().slice(0, 10)} —
                  awaiting Reviewer / Approver / Quality Release sign-off
                  (QMS submission{" "}
                  <code className="rounded bg-violet-100 px-1 font-mono text-[10px]">
                    {submission.qmsSubmissionId.slice(0, 12)}…
                  </code>
                  ).
                </p>
              ) : (
                <p className="text-xs text-amber-800">
                  <span className="font-medium">Submitted (queued)</span> —
                  Codex recorded the submission but the QMS bridge POST{" "}
                  {submission.outboundAttemptCount > 0
                    ? `failed on attempt ${submission.outboundAttemptCount}`
                    : "has not run"}
                  .{" "}
                  {submission.lastOutboundError && (
                    <span className="block mt-0.5 font-mono text-[10px] text-amber-900">
                      {submission.lastOutboundError.slice(0, 200)}
                    </span>
                  )}
                  Click <em>Submit to Doc Control</em> again to retry —
                  the QMS endpoint is idempotent.
                </p>
              )}
            </div>
          )}
          {submission?.status === "released" && (
            <div className="mt-1 space-y-2">
              <p className="text-xs text-emerald-900">
                <span className="font-medium">Released by Doc Control</span>
                {submission.qmsDocumentNumber
                  ? ` as ${submission.qmsDocumentNumber}`
                  : ""}
                {submission.releasedAt
                  ? ` on ${new Date(submission.releasedAt)
                      .toISOString()
                      .slice(0, 10)}`
                  : ""}
                .
              </p>
              {submission.qmsDocumentNumber && (
                <DocControlSignatureModal
                  qmsDocumentNumber={submission.qmsDocumentNumber}
                  qmsSubmissionId={submission.qmsSubmissionId}
                  releasedAt={
                    submission.releasedAt
                      ? new Date(submission.releasedAt).toISOString()
                      : null
                  }
                  qmsSha256={qmsSha256}
                  signatures={qmsSignatures}
                />
              )}
            </div>
          )}
          {submission?.status === "rejected" && (
            <p className="mt-1 text-xs text-rose-900">
              <span className="font-medium">Rejected by Doc Control</span>
              {submission.rejectedAt
                ? ` on ${new Date(submission.rejectedAt)
                    .toISOString()
                    .slice(0, 10)}`
                : ""}
              {submission.rejectedReason
                ? ` — ${submission.rejectedReason}`
                : ""}
              .
            </p>
          )}
          {submission?.status === "superseded" && (
            <p className="mt-1 text-xs text-gray-700">
              <span className="font-medium">Superseded</span> — a newer SSP
              version has been released by Doc Control.
            </p>
          )}
        </div>
        {isAdmin &&
          (!submission ||
            submission.status === "rejected" ||
            submission.status === "superseded" ||
            // Queued-but-not-transmitted: bridge POST failed; allow retry.
            (submission.status === "submitted" &&
              !submission.qmsSubmissionId)) && (
            <SubmitToDocControlButton
              sspDocumentId={sspDocumentId}
              canSubmit={canSubmit}
              blockedReason={blockedReason}
            />
          )}
      </div>
    </div>
  );
}

/**
 * Per-version CA.L2-3.12.4 [a]–[h] completeness badge. v2.13 page 209
 * makes this a terminal-failure event when missing — show it before
 * the operator clicks Submit to Doc Control. The full per-objective
 * detail is on hover.
 */
function CompletenessBadge({
  completeness,
}: {
  completeness: ReturnType<typeof validateSspCompleteness>;
}) {
  const ok = completeness.ok;
  const tone = ok
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-rose-50 text-rose-700 ring-rose-200";
  const detail = completeness.objectives
    .map(
      (o) =>
        `${o.satisfied ? "✓" : "✗"} [${o.objective}] ${o.text} — ${o.rationale}`,
    )
    .join("\n");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${tone}`}
      title={detail}
    >
      CA.L2-3.12.4: {completeness.satisfiedCount}/{completeness.totalCount}
      {!ok && ` · missing ${completeness.missing.map((o) => `[${o}]`).join(", ")}`}
    </span>
  );
}

function MetViaPill({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5">
      <span className="font-medium text-gray-700">{n}</span>
      <span className="opacity-70">via {label}</span>
    </span>
  );
}
