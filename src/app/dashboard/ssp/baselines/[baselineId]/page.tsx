import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";

import { db } from "@/db";
import {
  boundaries,
  sspBaselineDriftEvents,
  sspDocuments,
  sspReleaseBaselines,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { AdjudicateDriftEvent } from "../AdjudicateDriftEvent";
import { RunDriftCheckButton } from "../RunDriftCheckButton";
import { TriggerSspRedraftButton } from "../TriggerSspRedraftButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SignoffSnapshotEntry {
  signoff_id: string;
  signoff_kind: string;
  signer_user_id: string | null;
  signer_display_name: string;
  signer_title: string;
  data_hash: string;
  signed_at: string;
  signature_alg: string | null;
}

const SEVERITY_ORDER: Record<string, number> = {
  material: 0,
  moderate: 1,
  minor: 2,
};

const STATUS_ORDER: Record<string, number> = {
  open: 0,
  acknowledged: 1,
  resolved: 2,
  dismissed: 3,
};

export default async function BaselineDetailPage({
  params,
}: {
  params: Promise<{ baselineId: string }>;
}) {
  const session = await auth();
  const user = session?.user as
    | { organizationId?: string; role?: string }
    | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/sign-in");

  const canAdjudicate =
    user?.role === "Admin" || user?.role === "Compliance";
  // Redraft hits /api/ssp/generate which is Admin-only — keep the
  // button hidden for Compliance reviewers to avoid surfacing a 401
  // they can't act on.
  const canRedraft = user?.role === "Admin";

  const { baselineId } = await params;

  const [baseline] = await db
    .select({
      id: sspReleaseBaselines.id,
      status: sspReleaseBaselines.status,
      sspDocumentId: sspReleaseBaselines.sspDocumentId,
      sspVersionNumber: sspReleaseBaselines.sspVersionNumber,
      payloadSha256: sspReleaseBaselines.payloadSha256,
      qmsDocumentNumber: sspReleaseBaselines.qmsDocumentNumber,
      qmsSha256: sspReleaseBaselines.qmsSha256,
      qmsManifestRunId: sspReleaseBaselines.qmsManifestRunId,
      releasedAt: sspReleaseBaselines.releasedAt,
      finalizedAt: sspReleaseBaselines.finalizedAt,
      supersededAt: sspReleaseBaselines.supersededAt,
      releaseNotes: sspReleaseBaselines.releaseNotes,
      signoffsJson: sspReleaseBaselines.signoffsJson,
      boundaryId: sspReleaseBaselines.boundaryId,
      boundaryName: boundaries.name,
    })
    .from(sspReleaseBaselines)
    .leftJoin(boundaries, eq(boundaries.id, sspReleaseBaselines.boundaryId))
    .where(
      and(
        eq(sspReleaseBaselines.id, baselineId),
        eq(sspReleaseBaselines.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!baseline) notFound();

  const signoffs = (baseline.signoffsJson ?? []) as SignoffSnapshotEntry[];

  // Pull all drift events for this baseline. Sorting in-memory by
  // (status, severity, detected_at desc) so OPEN events show first
  // and within OPEN, material events float to the top.
  const events = await db
    .select({
      id: sspBaselineDriftEvents.id,
      severity: sspBaselineDriftEvents.severity,
      driftType: sspBaselineDriftEvents.driftType,
      status: sspBaselineDriftEvents.status,
      controlId: sspBaselineDriftEvents.controlId,
      sourceTable: sspBaselineDriftEvents.sourceTable,
      previousHash: sspBaselineDriftEvents.previousHash,
      currentHash: sspBaselineDriftEvents.currentHash,
      summary: sspBaselineDriftEvents.summary,
      recommendation: sspBaselineDriftEvents.recommendation,
      requiresSspRedraft: sspBaselineDriftEvents.requiresSspRedraft,
      requiresPoamReview: sspBaselineDriftEvents.requiresPoamReview,
      requiresDocumentControlReview:
        sspBaselineDriftEvents.requiresDocumentControlReview,
      detectedAt: sspBaselineDriftEvents.detectedAt,
      firstDetectedAt: sspBaselineDriftEvents.firstDetectedAt,
      adjudicationNotes: sspBaselineDriftEvents.adjudicationNotes,
      adjudicatedAt: sspBaselineDriftEvents.adjudicatedAt,
      adjudicatedByUserId: sspBaselineDriftEvents.adjudicatedByUserId,
      adjudicatorEmail: users.email,
    })
    .from(sspBaselineDriftEvents)
    .leftJoin(
      users,
      eq(users.id, sspBaselineDriftEvents.adjudicatedByUserId),
    )
    .where(
      and(
        eq(sspBaselineDriftEvents.organizationId, orgId),
        eq(sspBaselineDriftEvents.baselineId, baselineId),
      ),
    )
    .orderBy(desc(sspBaselineDriftEvents.detectedAt));

  const sortedEvents = [...events].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    const va = SEVERITY_ORDER[a.severity] ?? 99;
    const vb = SEVERITY_ORDER[b.severity] ?? 99;
    if (va !== vb) return va - vb;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });

  // SSP doc for the "View SSP" link.
  const [doc] = await db
    .select({ id: sspDocuments.id, versionNumber: sspDocuments.versionNumber })
    .from(sspDocuments)
    .where(eq(sspDocuments.id, baseline.sspDocumentId))
    .limit(1);

  const openMaterialCount = events.filter(
    (e) => e.status === "open" && e.severity === "material",
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <Link
        href="/dashboard/ssp/baselines"
        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to baselines
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Release baseline · {baseline.boundaryName ?? "—"} · v
            {baseline.sspVersionNumber}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
            {baseline.qmsDocumentNumber ?? "Baseline"} ·{" "}
            <span className="font-mono text-base text-gray-700">
              sha256:{baseline.payloadSha256.slice(0, 16)}…
            </span>
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Released{" "}
            {new Date(baseline.releasedAt).toISOString().slice(0, 19)}Z ·
            status{" "}
            <span className="font-medium text-gray-900">
              {baseline.status}
            </span>
            {baseline.supersededAt && (
              <>
                {" "}
                · superseded{" "}
                {new Date(baseline.supersededAt).toISOString().slice(0, 10)}
              </>
            )}
          </p>
          {baseline.releaseNotes && (
            <p className="mt-2 text-xs text-gray-700">
              <span className="font-semibold">Release notes:</span>{" "}
              {baseline.releaseNotes}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <RunDriftCheckButton baselineId={baseline.id} />
          {doc && (
            <Link
              href={`/dashboard/ssp`}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <FileText className="h-3 w-3" />
              View SSP v{doc.versionNumber}
            </Link>
          )}
          {canRedraft && (
            <TriggerSspRedraftButton
              boundaryId={baseline.boundaryId}
              materialDriftCount={openMaterialCount}
            />
          )}
        </div>
      </header>

      {/* ── Baseline metadata grid ───────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          Baseline metadata
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-[12px] sm:grid-cols-2">
          <Field label="Boundary" value={baseline.boundaryName ?? "—"} />
          <Field
            label="SSP version"
            value={`v${baseline.sspVersionNumber}`}
          />
          <Field
            label="Codex payload SHA-256"
            value={baseline.payloadSha256}
            mono
          />
          <Field
            label="QMS document"
            value={baseline.qmsDocumentNumber ?? "—"}
          />
          <Field
            label="QMS SHA-256"
            value={baseline.qmsSha256}
            mono
          />
          <Field
            label="QMS manifest run"
            value={baseline.qmsManifestRunId ?? "—"}
            mono={!!baseline.qmsManifestRunId}
          />
          <Field
            label="Released at"
            value={new Date(baseline.releasedAt).toISOString()}
          />
          <Field
            label="Finalized at"
            value={new Date(baseline.finalizedAt).toISOString()}
          />
        </dl>
      </section>

      {/* ── Signoffs ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          Signoffs frozen at release
        </h2>
        {signoffs.length === 0 ? (
          <p className="mt-2 text-[12px] text-gray-500">
            No signoffs recorded for this baseline.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {signoffs.map((s) => (
              <li
                key={s.signoff_id}
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-gray-900">
                      {s.signer_display_name}
                    </span>{" "}
                    · {s.signer_title}{" "}
                    <span className="text-gray-500">({s.signoff_kind})</span>
                  </div>
                  <span className="font-mono text-[10px] text-gray-500">
                    {s.data_hash.slice(0, 16)}… ·{" "}
                    {s.signed_at.slice(0, 10)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Drift events ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Drift events ({events.length})
          </h2>
        </div>
        {sortedEvents.length === 0 ? (
          <p className="mt-3 text-[12px] text-gray-500">
            No drift events. Run a drift check to compare current state
            against this baseline.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sortedEvents.map((e) => (
              <DriftEventRow
                key={e.id}
                event={e}
                canAdjudicate={canAdjudicate}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-all text-gray-900 ${
          mono ? "font-mono text-[11px]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function DriftEventRow({
  event,
  canAdjudicate,
}: {
  event: {
    id: string;
    severity: string;
    driftType: string;
    status: string;
    controlId: string | null;
    sourceTable: string | null;
    previousHash: string | null;
    currentHash: string | null;
    summary: string;
    recommendation: string | null;
    requiresSspRedraft: boolean;
    requiresPoamReview: boolean;
    requiresDocumentControlReview: boolean;
    detectedAt: Date;
    firstDetectedAt: Date;
    adjudicationNotes: string | null;
    adjudicatedAt: Date | null;
    adjudicatorEmail: string | null;
  };
  canAdjudicate: boolean;
}) {
  const sevColor =
    event.severity === "material"
      ? "border-rose-300 bg-rose-50"
      : event.severity === "moderate"
        ? "border-amber-300 bg-amber-50"
        : "border-gray-200 bg-gray-50";
  const sevBadge =
    event.severity === "material"
      ? "bg-rose-200 text-rose-900"
      : event.severity === "moderate"
        ? "bg-amber-200 text-amber-900"
        : "bg-gray-200 text-gray-800";
  const statusBadge =
    event.status === "open"
      ? "bg-white text-gray-800 ring-1 ring-gray-300"
      : event.status === "acknowledged"
        ? "bg-sky-100 text-sky-800"
        : event.status === "resolved"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-gray-200 text-gray-700";

  return (
    <li className={`rounded-lg border p-3 ${sevColor}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sevBadge}`}
            >
              {event.severity}
            </span>
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusBadge}`}
            >
              {event.status}
            </span>
            <span className="font-mono text-[11px] text-gray-700">
              {event.driftType}
            </span>
            {event.controlId && (
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-300">
                {event.controlId}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-gray-900">{event.summary}</p>
          {event.recommendation && (
            <p className="mt-1 text-[11px] text-gray-700">
              <span className="font-semibold">Recommended:</span>{" "}
              {event.recommendation}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
            {event.sourceTable && <span>{event.sourceTable}</span>}
            {event.previousHash && event.currentHash && (
              <span className="font-mono">
                {event.previousHash.slice(0, 8)}… →{" "}
                {event.currentHash.slice(0, 8)}…
              </span>
            )}
            <span>
              detected{" "}
              {new Date(event.detectedAt).toISOString().slice(0, 19)}Z
            </span>
            {event.firstDetectedAt.getTime() !==
              event.detectedAt.getTime() && (
              <span>
                first seen{" "}
                {new Date(event.firstDetectedAt).toISOString().slice(0, 10)}
              </span>
            )}
          </div>
          {(event.requiresSspRedraft ||
            event.requiresPoamReview ||
            event.requiresDocumentControlReview) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {event.requiresSspRedraft && (
                <span className="rounded-md bg-rose-200 px-1.5 py-0.5 text-[10px] font-medium text-rose-900">
                  SSP redraft
                </span>
              )}
              {event.requiresPoamReview && (
                <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                  POA&amp;M review
                </span>
              )}
              {event.requiresDocumentControlReview && (
                <span className="rounded-md bg-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                  Doc control review
                </span>
              )}
            </div>
          )}
          {event.adjudicationNotes && event.adjudicatedAt && (
            <div className="mt-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px]">
              <span className="font-semibold">Adjudicated</span>
              {event.adjudicatorEmail && ` by ${event.adjudicatorEmail}`} ·{" "}
              {new Date(event.adjudicatedAt).toISOString().slice(0, 10)}
              <p className="mt-0.5 text-gray-700">
                {event.adjudicationNotes}
              </p>
            </div>
          )}
        </div>
        {event.status === "open" && (
          <AdjudicateDriftEvent
            eventId={event.id}
            canAdjudicate={canAdjudicate}
          />
        )}
      </div>
    </li>
  );
}

