import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, FileSignature, ShieldCheck } from "lucide-react";
import { computeAdjudicationRollup } from "@/lib/adjudication-helpers";
import {
  OUTSTANDING_TOTALS,
  BUCKET_SUMMARY,
} from "@/lib/compliance/outstanding-controls";

/**
 * PathTo110Widget
 *
 * Hero-level dashboard card: surfaces the org's progress toward 110/110 adjudicated
 * controls, with a clear CTA into the Outstanding Controls Wizard.
 *
 * The widget compares the org's *live* adjudication rollup (from control_records)
 * against the canonical 74/36 snapshot. When the org is "fresh" (just signed
 * governance bundle + ingested OS evidence), the live rollup matches the snapshot's
 * 74. As the customer closes register entries / signs attestations, the live count
 * climbs toward 110.
 */
export async function PathTo110Widget({ orgId }: { orgId: string }) {
  const rollup = await computeAdjudicationRollup(orgId);
  const adjudicated = rollup.inherited + rollup.notApplicable + rollup.implementedEvidenced;
  const outstanding = rollup.outstanding;
  const pct = Math.min(100, Math.round((adjudicated / 110) * 100));

  const targetAdjudicated = OUTSTANDING_TOTALS.adjudicated; // 74
  const targetOutstanding = OUTSTANDING_TOTALS.outstanding; // 36

  // Effort tiers — these are derived from the snapshot's bucket_summary
  const tierA = BUCKET_SUMMARY.A_existing_flow.count;
  const tierB = BUCKET_SUMMARY.B_existing_register.count;
  const tierC = BUCKET_SUMMARY.C_new_template_or_attestation.count;
  const tierE = BUCKET_SUMMARY.E_na_attestation.count;

  const isAtBaseline = adjudicated <= targetAdjudicated + 1;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/40 to-indigo-50/30 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Path to 110
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">
            {adjudicated} of 110 controls adjudicated
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {isAtBaseline ? (
              <>
                You&apos;ve adjudicated the {targetAdjudicated} controls covered by your hardened OS evidence
                and signed MacTech governance bundle. <strong>{outstanding} controls remain</strong> — and most
                are 5-minute attestations or quick register entries.
              </>
            ) : (
              <>
                <strong>{outstanding} controls remain.</strong> Keep going — most of what&apos;s left is
                operational evidence: register entries on a cadence and a few attestations.
              </>
            )}
          </p>
        </div>
        <Link
          href="/dashboard/readiness/outstanding"
          className="group inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Close outstanding controls
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>{pct}% of 110</span>
          <span>
            {adjudicated} adjudicated · {outstanding} outstanding
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Effort breakdown */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BucketChip
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          label="Already running"
          count={tierA}
          subtitle="Just confirm evidence is flowing"
        />
        <BucketChip
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          label="Register entries"
          count={tierB}
          subtitle="15–30 min each, on cadence"
        />
        <BucketChip
          icon={<FileSignature className="h-4 w-4 text-indigo-600" />}
          label="Sign-off needed"
          count={tierC}
          subtitle="5 min each, one-time"
        />
        <BucketChip
          icon={<FileSignature className="h-4 w-4 text-slate-500" />}
          label="N/A attestations"
          count={tierE}
          subtitle="5 min each, one-click"
        />
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Target: {targetAdjudicated} adjudicated / {targetOutstanding} outstanding for a CUI Vault
        customer with OS evidence ingested + governance bundle signed.
        Every action is C3PAO-defensible — each card shows the examiner note and the conditions
        you&apos;re affirming.
      </p>
    </div>
  );
}

function BucketChip({
  icon,
  label,
  count,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium text-slate-700">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{count}</div>
      <div className="text-[11px] leading-tight text-slate-500">{subtitle}</div>
    </div>
  );
}
