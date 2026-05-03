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

  // Latest signal — the more recent of attestation / report
  const lastActivityAt =
    signedAttestationAt && reportUploadedAt
      ? signedAttestationAt > reportUploadedAt
        ? signedAttestationAt
        : reportUploadedAt
      : signedAttestationAt ?? reportUploadedAt;
  const daysSinceLast = daysAgo(lastActivityAt);
  const overall = freshnessLabel(daysSinceLast, 365);

  const programState =
    signedAttestationAt && reportUploadedAt
      ? "complete"
      : signedAttestationAt
        ? "signed_no_report"
        : reportUploadedAt
          ? "report_no_signature"
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
          This page tracks the program: the signed customer attestation, the most recent
          assessment report on file, and the live Risk Register that feeds POA&M creation.
        </p>
      </header>

      {/* ── Status banner ──────────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-start gap-4">
          <StatusIcon state={programState} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-navy-primary)]">
              {programState === "complete" && "Program complete"}
              {programState === "signed_no_report" && "Attestation signed — report missing"}
              {programState === "report_no_signature" && "Report on file — attestation missing"}
              {programState === "not_started" && "No risk assessment on file"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              {programState === "complete" &&
                `Last activity ${overall.label}. Renew the cycle within 365 days of the most recent signed attestation.`}
              {programState === "signed_no_report" &&
                "The customer signed the program attestation but no annual report PDF has been uploaded. The C3PAO will ask for the report directly."}
              {programState === "report_no_signature" &&
                "A report is on file but the customer hasn't signed the program attestation yet — the report needs an explicit declaration that this is the org's risk-assessment program of record."}
              {programState === "not_started" &&
                "Sign the program attestation AND upload the most recent annual risk-assessment report to satisfy 3.11.1."}
            </p>
          </div>
        </div>
      </section>

      {/* ── Two CTA cards ─────────────────────────────────────────── */}
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

        {/* Report upload */}
        <div className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <Upload className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
            {reportUploadedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                <CheckCircle2 className="h-3 w-3" /> Uploaded
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                <AlertTriangle className="h-3 w-3" /> Required
              </span>
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-[var(--color-navy-primary)]">
            Annual assessment report
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
            {reportUploadedAt
              ? `${reportFileName ?? "Report"} uploaded ${daysAgo(reportUploadedAt)}d ago. C3PAO will examine this directly.`
              : "Upload the formal annual report (PDF or DOCX). Should cover scope, threat sources, vulnerabilities, likelihood/impact, and treatment per NIST SP 800-30."}
          </p>
          <Link
            href="/dashboard/artifacts"
            className={`mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${reportUploadedAt ? "border border-[var(--color-border)] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]" : "bg-[var(--color-blue-accent)] text-white hover:opacity-90"}`}
          >
            {reportUploadedAt ? "View artifact" : "Upload report"} <ArrowRight className="h-3 w-3" />
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

      {/* ── Guided wizard CTA ──────────────────────────────────────── */}
      <section className="rounded-xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] to-blue-50/30 p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-blue-accent)]" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--color-navy-primary)]">
                Guided risk assessment wizard
              </p>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-900">
                NEW · Phase 1
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-gray-600)]">
              Walk through scope, applicable threat scenarios (preloaded with
              ~20 CUI-Vault-relevant risks), treatment decisions, and management
              sign-off. Each completed assessment writes final entries to the
              live risk_register — operational evidence for 3.11.1 alongside the
              signed attestation and uploaded report.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/dashboard/readiness/risk-assessment/wizard"
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Start guided assessment <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {riskRegisterId && (
                <Link
                  href={`/dashboard/evidence-engine/registers/${riskRegisterId}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                >
                  View live register
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer note ───────────────────────────────────────────── */}
      <p className="text-xs text-[var(--color-gray-500)]">
        For the C3PAO assessor: the signed{" "}
        <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">
          risk_assessment_program
        </code>{" "}
        attestation is the customer&apos;s declaration; the uploaded report is the
        examined artifact; the Risk Register is the operational record of identified
        and treated risks. Together they satisfy 3.11.1.
      </p>
    </div>
  );
}

function StatusIcon({ state }: { state: "complete" | "signed_no_report" | "report_no_signature" | "not_started" }) {
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
