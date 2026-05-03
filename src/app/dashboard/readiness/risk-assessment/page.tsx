import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  controlRecords,
  governanceArtifactCompletions,
  artifacts,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileSignature,
  Upload,
  ListPlus,
  ArrowRight,
  Sparkles,
  Download,
  FileArchive,
} from "lucide-react";

/**
 * Annual Risk Assessment workflow (RA.L2-3.11.1).
 *
 * Phase 0 — what this page does today:
 *   - Surfaces current state of the risk-assessment program: signed
 *     attestation? annual report on file? risk register populated?
 *   - Two CTAs: sign the attestation (handed off to Outstanding Wizard
 *     bucket-C card for 3.11.1), and upload the annual report (handed
 *     off to /dashboard/artifacts where the user attaches a real file).
 *   - Snapshot of the org's risk_register: count of final entries +
 *     link to the live register for entry-by-entry editing.
 *
 * Phase 1 — what this page becomes (next sprint):
 *   - Guided wizard that walks the customer through boundary intake,
 *     asset criticality scoring, threat scenario library, AI-assisted
 *     scoring suggestions, treatment workflow, management sign-off,
 *     and PDF/ZIP evidence bundle export.
 *
 * Phase 0 keeps the surface honest: it does NOT pretend to author a
 * defensible 800-30 risk assessment. It documents the program and
 * makes the customer's existing report easy to attach.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cardClass =
  "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

function daysAgo(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function freshnessLabel(days: number | null, threshold: number): { label: string; tone: "good" | "warn" | "bad" | "neutral" } {
  if (days === null) return { label: "Never", tone: "bad" };
  if (days < threshold) return { label: `${days}d ago`, tone: "good" };
  if (days < threshold * 1.25) return { label: `${days}d ago — due soon`, tone: "warn" };
  return { label: `${days}d ago — overdue`, tone: "bad" };
}

export default async function RiskAssessmentPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // ── Resolve the 3.11.1 control record + program signals ──
  const [record] = await db
    .select({ id: controlRecords.id, status: controlRecords.implementationStatus })
    .from(controlRecords)
    .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, "3.11.1")))
    .limit(1);

  // Signed attestation?
  let signedAttestationAt: Date | null = null;
  let signedAttestationBy: string | null = null;
  if (record) {
    const [sig] = await db
      .select({
        attestedAt: governanceArtifactCompletions.attestedAt,
        attestedBy: governanceArtifactCompletions.attestedBy,
      })
      .from(governanceArtifactCompletions)
      .where(
        and(
          eq(governanceArtifactCompletions.controlRecordId, record.id),
          eq(governanceArtifactCompletions.artifactLabel, "risk_assessment_program"),
        ),
      )
      .limit(1);
    if (sig?.attestedAt) {
      signedAttestationAt = sig.attestedAt instanceof Date ? sig.attestedAt : new Date(sig.attestedAt);
      signedAttestationBy = sig.attestedBy;
    }
  }

  // Annual risk assessment report uploaded?
  let reportUploadedAt: Date | null = null;
  let reportFileName: string | null = null;
  if (record) {
    const [report] = await db
      .select({
        uploadedAt: artifacts.updatedAt,
        fileName: artifacts.fileName,
        status: artifacts.status,
        fileUrl: artifacts.fileUrl,
      })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.controlRecordId, record.id),
          eq(artifacts.milestoneKey, "RA.3.11.1.annual_risk_assessment"),
          sql`${artifacts.fileUrl} IS NOT NULL`,
        ),
      )
      .orderBy(desc(artifacts.updatedAt))
      .limit(1);
    if (report?.fileUrl) {
      reportUploadedAt = report.uploadedAt instanceof Date ? report.uploadedAt : new Date(report.uploadedAt);
      reportFileName = report.fileName;
    }
  }

  // Risk register snapshot
  const orgBoundaryRows = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const candidates = resolveRegisterKeyCandidates("risk_register");
  let riskRegisterEntryCount = 0;
  let riskRegisterFinalCount = 0;
  let riskRegisterId: string | null = null;
  if (orgBoundaryRows.length > 0 && candidates.length > 0) {
    const [reg] = await db
      .select({ id: governanceRegisters.id })
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          sql`${governanceRegisters.registerKey} IN (${sql.join(
            candidates.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ),
      )
      .limit(1);
    if (reg) {
      riskRegisterId = reg.id;
      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          finals: sql<number>`count(*) filter (where ${governanceRegisterEntries.status} = 'final')::int`,
        })
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.registerId, reg.id));
      riskRegisterEntryCount = counts?.total ?? 0;
      riskRegisterFinalCount = counts?.finals ?? 0;
    }
  }

  // ── Past assessments (Phase 3) ──
  // Query risk_register entries that carry an assessment_id in entryData
  // and group client-side. Mirrors what /api/risk-assessment/list does so
  // the page renders without an extra fetch hop.
  type PastAssessment = {
    assessmentId: string;
    riskCount: number;
    reviewPeriodEnd: string | null;
    preparer: string | null;
    approver: string | null;
    signOffDate: string | null;
    earliestAt: string | null;
  };
  const pastAssessments: PastAssessment[] = [];
  if (riskRegisterId) {
    const rows = await db
      .select({
        entryData: governanceRegisterEntries.entryData,
        finalizedAt: governanceRegisterEntries.finalizedAt,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, riskRegisterId),
          sql`${governanceRegisterEntries.entryData} ? 'assessment_id'`,
        ),
      );
    const map = new Map<string, PastAssessment>();
    for (const r of rows) {
      const d = (r.entryData ?? {}) as Record<string, unknown>;
      const id = String(d.assessment_id ?? "");
      if (!id) continue;
      const at = r.finalizedAt instanceof Date ? r.finalizedAt.toISOString() : null;
      const existing = map.get(id);
      if (existing) {
        existing.riskCount++;
        if (at && (!existing.earliestAt || at < existing.earliestAt)) existing.earliestAt = at;
      } else {
        map.set(id, {
          assessmentId: id,
          riskCount: 1,
          reviewPeriodEnd: d.review_period_end ? String(d.review_period_end) : null,
          preparer: d.preparer ? String(d.preparer) : null,
          approver: d.approver ? String(d.approver) : null,
          signOffDate: d.sign_off_date ? String(d.sign_off_date) : null,
          earliestAt: at,
        });
      }
    }
    pastAssessments.push(
      ...Array.from(map.values()).sort((a, b) => {
        const aDate = a.signOffDate ?? a.earliestAt ?? "";
        const bDate = b.signOffDate ?? b.earliestAt ?? "";
        return bDate.localeCompare(aDate);
      }),
    );
  }

  // ── Evidence sources ──
  // §3.11.1 evidence can come from EITHER (a) a completed wizard run that
  // produced final risk_register entries, OR (b) an externally-authored
  // report uploaded to Artifacts. Both shapes corroborate the program
  // attestation. The wizard is the primary path; upload is supplemental.
  const latestWizardAt = pastAssessments.reduce<Date | null>((acc, a) => {
    const at = a.signOffDate ?? a.earliestAt;
    if (!at) return acc;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return acc;
    if (!acc || d > acc) return d;
    return acc;
  }, null);
  const hasEvidence = pastAssessments.length > 0 || reportUploadedAt !== null;

  // Latest signal across all evidence shapes.
  const activityDates = [signedAttestationAt, reportUploadedAt, latestWizardAt].filter(
    (d): d is Date => d instanceof Date,
  );
  const lastActivityAt = activityDates.length > 0
    ? activityDates.reduce((a, b) => (a > b ? a : b))
    : null;
  const daysSinceLast = daysAgo(lastActivityAt);
  const overall = freshnessLabel(daysSinceLast, 365);

  const programState =
    signedAttestationAt && hasEvidence
      ? "complete"
      : signedAttestationAt
        ? "signed_no_evidence"
        : hasEvidence
          ? "evidence_no_signature"
          : "not_started";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header>
        <Link href="/dashboard/readiness" className="text-xs text-[var(--color-gray-500)] hover:underline">
          ← Readiness
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-[var(--color-blue-accent)]" aria-hidden />
          <h1 className="text-2xl font-bold text-[var(--color-navy-primary)]">Annual Risk Assessment</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-gray-700)]">
            RA.L2-3.11.1 · annual cadence
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--color-gray-600)]">
          NIST SP 800-171 §3.11.1 requires a periodic risk assessment of CUI operations.
          This page tracks the program: the signed customer attestation and at least
          one completed assessment cycle — either authored here in the guided wizard
          (recommended) or uploaded as an external report. Both feed the live Risk
          Register that drives POA&M creation.
        </p>
      </header>

      {/* ── Status banner ──────────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start gap-4">
          <StatusIcon state={programState} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-navy-primary)]">
              {programState === "complete" && "Program complete"}
              {programState === "signed_no_evidence" && "Attestation signed — assessment cycle missing"}
              {programState === "evidence_no_signature" && "Assessment on file — attestation missing"}
              {programState === "not_started" && "No risk assessment on file"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              {programState === "complete" &&
                `Last activity ${overall.label}. Renew the cycle within 365 days of the most recent signed attestation.`}
              {programState === "signed_no_evidence" &&
                "The customer signed the program attestation but no assessment cycle has been completed yet. Run the guided wizard or upload an external report to satisfy 3.11.1."}
              {programState === "evidence_no_signature" &&
                "An assessment is on file but the customer hasn't signed the program attestation yet — the assessment needs an explicit declaration that this is the org's risk-assessment program of record."}
              {programState === "not_started" &&
                "Sign the program attestation AND complete at least one assessment cycle (via the guided wizard) to satisfy 3.11.1."}
            </p>
          </div>
        </div>
      </section>

      {/* ── Two primary actions: attestation + wizard ──────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Attestation */}
        <div className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <FileSignature className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
            {signedAttestationAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                <CheckCircle2 className="h-3 w-3" /> Signed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                <AlertTriangle className="h-3 w-3" /> Required
              </span>
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-[var(--color-navy-primary)]">
            risk_assessment_program attestation
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
            {signedAttestationAt
              ? `Signed ${daysAgo(signedAttestationAt)}d ago. The signed declaration is the customer's commitment to operate the program.`
              : "Customer signs once per year. The signed declaration covers methodology, designated assessor, retention, register feed, and POA&M linkage."}
          </p>
          {signedAttestationAt ? (
            <Link
              href="/dashboard/artifacts"
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View receipt on Artifacts <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <Link
              href="/dashboard/readiness/outstanding?bucket=C"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Sign attestation <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Guided wizard — primary path for authoring the assessment */}
        <div className={`${cardClass} bg-gradient-to-br from-[var(--color-surface)] to-blue-50/30`}>
          <div className="flex items-start justify-between gap-3">
            <Sparkles className="h-5 w-5 text-[var(--color-blue-accent)]" aria-hidden />
            {pastAssessments.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                <CheckCircle2 className="h-3 w-3" /> {pastAssessments.length} on file
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-900">
                Recommended
              </span>
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-[var(--color-navy-primary)]">
            Guided assessment wizard
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
            {pastAssessments.length > 0
              ? `Last assessment ${latestWizardAt ? daysAgo(latestWizardAt) + "d ago" : "—"}. Run a new cycle when scope changes or annually at minimum.`
              : "Walks through scope, applicable threat scenarios (~20 CUI-Vault-relevant risks), treatment decisions, and management sign-off. Generates a complete C3PAO-reviewable evidence bundle."}
          </p>
          <Link
            href="/dashboard/readiness/risk-assessment/wizard"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            {pastAssessments.length > 0 ? "Run new cycle" : "Start guided assessment"} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* ── Risk register snapshot ────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ListPlus className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
                Risk Register
              </h2>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Live register of risks identified by the assessment program. Final entries
              feed POA&M closure and corroborate the signed attestation.
            </p>
          </div>
          {riskRegisterId && (
            <Link
              href={`/dashboard/evidence-engine/registers/${riskRegisterId}`}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              Open register <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Total entries
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-navy-primary)]">
              {riskRegisterEntryCount}
            </p>
          </div>
          <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
              Final entries (counted as evidence)
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-navy-primary)]">
              {riskRegisterFinalCount}
            </p>
          </div>
        </div>
        {riskRegisterEntryCount === 0 && (
          <p className="mt-3 text-xs italic text-[var(--color-gray-500)]">
            Empty register today. As the next assessment cycle runs, populate this with
            identified risks (one entry per risk, status=final once management has
            signed off on the treatment decision).
          </p>
        )}
      </section>

      {/* ── Past assessments (Phase 3) ────────────────────────────── */}
      {pastAssessments.length > 0 && (
        <section className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileArchive className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
                  Past assessments
                </h2>
              </div>
              <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                Each completed assessment can be downloaded as a single ZIP
                evidence bundle (cover PDF, CSV, JSON, posture snapshot) for
                offline C3PAO review.
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
              {pastAssessments.length}
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-muted)] text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
                  <th className="px-2 py-1.5 text-left font-semibold">Sign-off date</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Period end</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Risks</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Preparer</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Approver</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Bundle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-muted)]">
                {pastAssessments.map((a) => (
                  <tr key={a.assessmentId} className="text-[var(--color-gray-700)]">
                    <td className="px-2 py-1.5 font-medium text-[var(--color-navy-primary)]">
                      {a.signOffDate ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">{a.reviewPeriodEnd ?? "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{a.riskCount}</td>
                    <td className="px-2 py-1.5">{a.preparer ?? "—"}</td>
                    <td className="px-2 py-1.5">{a.approver ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      <a
                        href={`/api/risk-assessment/bundle/${a.assessmentId}`}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                      >
                        <Download className="h-3 w-3" /> ZIP
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] italic text-[var(--color-gray-500)]">
            Bundles are generated on demand and include the current org posture
            (signed attestations, cadence health, vuln counts) at the time of
            download.
          </p>
        </section>
      )}

      {/* ── Supplemental external-report upload (deprecated path) ──── */}
      <section className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)]/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Upload className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-gray-500)]" aria-hidden />
            <div>
              <p className="text-xs font-semibold text-[var(--color-gray-700)]">
                Already have a report from an external tool?
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--color-gray-500)]">
                {reportUploadedAt
                  ? `External report ${reportFileName ?? ""} on file (uploaded ${daysAgo(reportUploadedAt)}d ago). Counts as supplemental evidence alongside any wizard runs.`
                  : "Upload a consultant-authored or third-party-generated PDF/DOCX as supplemental evidence. The wizard above is the recommended path; this is for customers who already produced a report elsewhere."}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/artifacts"
            className="shrink-0 inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
          >
            {reportUploadedAt ? "View artifact" : "Upload external report"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* ── Footer note ───────────────────────────────────────────── */}
      <p className="text-xs text-[var(--color-gray-500)]">
        For the C3PAO assessor: the signed{" "}
        <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">
          risk_assessment_program
        </code>{" "}
        attestation is the customer&apos;s declaration; the wizard-generated bundle
        (or any uploaded external report) is the examined artifact; the Risk
        Register is the operational record of identified and treated risks.
        Together they satisfy 3.11.1.
      </p>
    </div>
  );
}

function StatusIcon({ state }: { state: "complete" | "signed_no_evidence" | "evidence_no_signature" | "not_started" }) {
  if (state === "complete") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden />
      </div>
    );
  }
  if (state === "not_started") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="h-5 w-5 text-red-700" aria-hidden />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
      <Clock className="h-5 w-5 text-amber-700" aria-hidden />
    </div>
  );
}
