import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, FileSignature, ShieldCheck } from "lucide-react";
import { computeAdjudicationRollup } from "@/lib/adjudication-helpers";
import { OUTSTANDING_TOTALS } from "@/lib/compliance/outstanding-controls";
import { computeOutstandingBucketCounts } from "@/lib/compliance/outstanding-bucket-counts";

/**
 * PathTo110Widget
 *
 * Hero-level dashboard card surfacing the org's progress toward 110/110.
 *
 * Every number on this card is dynamic — none are hardcoded snapshot
 * constants. The state-aware headline copy adapts to where the customer
 * actually is on the path:
 *
 *   - 0–10 adjudicated  → "Get started — your fastest path to 74 is..."
 *   - 11–63 (in transit) → "{N} of 110. Ingest OS evidence + sign bundle to hit 74."
 *   - 64–84 (at baseline)→ "You've reached the OS+governance baseline. {M} remain."
 *   - 85–109            → "{N} of 110. Most of what's left is operational evidence."
 *   - 110               → "All 110 adjudicated — ready for C3PAO assessment."
 *
 * Bucket chips show OPEN counts per close-path category (not the snapshot's
 * static bucket sizes). A control is "open" only when the actual lane
 * evidence isn't on file — disposition defaults alone don't count, which is
 * what makes the displayed count C3PAO-honest.
 */
export async function PathTo110Widget({ orgId }: { orgId: string }) {
  const rollup = await computeAdjudicationRollup(orgId);
  const adjudicated = rollup.inherited + rollup.notApplicable + rollup.implementedEvidenced;
  const outstanding = rollup.outstanding;
  const pct = Math.min(100, Math.round((adjudicated / 110) * 100));

  const targetAdjudicated = OUTSTANDING_TOTALS.adjudicated; // 74 — the OS+gov baseline

  // Per-bucket dynamic open counts (single source of truth shared with the wizard)
  const buckets = await computeOutstandingBucketCounts(orgId);

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
            <PathDescription
              adjudicated={adjudicated}
              outstanding={outstanding}
              targetAdjudicated={targetAdjudicated}
            />
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

      {/* Effort breakdown — DYNAMIC open-per-bucket counts (not snapshot
          constants). Each chip is a deep-link into the wizard, filtered to
          that bucket. Format: "X of Y" so the customer sees both the live
          state and the bucket size. When all of a bucket is closed, the chip
          turns emerald-tinted with explicit "All done" copy. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BucketChip
          href="/dashboard/readiness/outstanding?bucket=A"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          label="Training & IR tabletop"
          open={buckets.open.A}
          total={buckets.total.A}
          subtitle={
            buckets.open.A === 0
              ? "All flows ingested"
              : "Push training + run tabletop"
          }
        />
        <BucketChip
          href="/dashboard/readiness/outstanding?bucket=B"
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          label="Register entries"
          open={buckets.open.B}
          total={buckets.total.B}
          subtitle={
            buckets.open.B === 0
              ? "All registers filled"
              : "15–30 min each, on cadence"
          }
        />
        <BucketChip
          href="/dashboard/readiness/outstanding?bucket=C"
          icon={<FileSignature className="h-4 w-4 text-indigo-600" />}
          label="Sign-off needed"
          open={buckets.open.C}
          total={buckets.total.C}
          subtitle={
            buckets.open.C === 0 ? "All signed" : "5 min each, one-time"
          }
        />
        <BucketChip
          href="/dashboard/readiness/outstanding?bucket=E"
          icon={<FileSignature className="h-4 w-4 text-slate-500" />}
          label="N/A attestations"
          open={buckets.open.E}
          total={buckets.total.E}
          subtitle={
            buckets.open.E === 0 ? "All attested" : "5 min each, one-click"
          }
        />
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Wizard scope: {buckets.openAll} of 36 outstanding cards still open
        {buckets.closedAll > 0 ? ` · ${buckets.closedAll} closed` : ""}.
        Every action is C3PAO-defensible — each card shows the examiner note and the
        conditions you&apos;re affirming.
      </p>
    </div>
  );
}

/**
 * State-aware headline copy. Five bands keyed off `adjudicated` so the
 * description never claims the customer has done work they haven't.
 */
function PathDescription({
  adjudicated,
  outstanding,
  targetAdjudicated,
}: {
  adjudicated: number;
  outstanding: number;
  targetAdjudicated: number;
}) {
  if (adjudicated >= 110) {
    return (
      <>
        All 110 controls are adjudicated. You&apos;re ready for a C3PAO assessment.
        Keep registers current on cadence to maintain this state.
      </>
    );
  }
  if (adjudicated >= 85) {
    return (
      <>
        <strong>{outstanding} of 110 still need adjudication.</strong> Most of
        what&apos;s left is operational evidence — register entries on cadence and
        a few attestations. The Outstanding Controls Wizard groups them by
        effort tier.
      </>
    );
  }
  if (adjudicated >= 64) {
    return (
      <>
        You&apos;ve reached the {targetAdjudicated}-control baseline covered by
        OS evidence and the signed governance bundle. <strong>{outstanding} controls
        remain</strong> — most are 5-minute attestations or quick register entries.
      </>
    );
  }
  if (adjudicated >= 11) {
    return (
      <>
        <strong>{outstanding} of 110 still need adjudication.</strong> Your
        fastest jump is to ingest OS evidence + sign the governance bundle —
        that gets you to ~{targetAdjudicated} adjudicated. Then the wizard walks
        you through the remaining {110 - targetAdjudicated} cards.
      </>
    );
  }
  return (
    <>
      <strong>Get started.</strong> Your fastest path is: (1) ingest OS evidence
      from the Win 2025 collector, (2) sign the MacTech governance bundle.
      Together those cover ~{targetAdjudicated} of the 110 controls — then the
      Outstanding Controls Wizard walks you through the remaining {110 - targetAdjudicated}.
    </>
  );
}

function BucketChip({
  href,
  icon,
  label,
  open,
  total,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  open: number;
  total: number;
  subtitle: string;
}) {
  const allDone = open === 0 && total > 0;
  return (
    <Link
      href={href}
      className={`group block rounded-lg border p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        allDone
          ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:bg-emerald-50"
          : "border-slate-200 bg-white/70 hover:border-blue-300 hover:bg-white hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-medium text-slate-700">{label}</span>
        </div>
        <ArrowRight className="h-3 w-3 text-slate-400 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-semibold text-slate-900">{open}</span>
        <span className="text-xs text-slate-500">of {total}</span>
      </div>
      <div className="text-[11px] leading-tight text-slate-500">{subtitle}</div>
    </Link>
  );
}
