import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { db } from "@/db";
import {
  boundaries,
  sspBaselineDriftEvents,
  sspReleaseBaselines,
} from "@/db/schema";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /dashboard/ssp/baselines — controlled SSP baselines list.
 *
 * One row per release baseline (status = active, superseded, or
 * retired), grouped: actives first, then supersededs. Each row shows
 * the boundary, version, payload SHA, QMS doc number, signed-and-
 * released-at, and severity counts of OPEN drift events. Click into
 * the row for adjudication.
 */
export default async function BaselinesPage() {
  const session = await auth();
  const user = session?.user as
    | { organizationId?: string; role?: string }
    | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/sign-in");

  const baselines = await db
    .select({
      id: sspReleaseBaselines.id,
      status: sspReleaseBaselines.status,
      sspVersionNumber: sspReleaseBaselines.sspVersionNumber,
      payloadSha256: sspReleaseBaselines.payloadSha256,
      qmsDocumentNumber: sspReleaseBaselines.qmsDocumentNumber,
      qmsSha256: sspReleaseBaselines.qmsSha256,
      releasedAt: sspReleaseBaselines.releasedAt,
      finalizedAt: sspReleaseBaselines.finalizedAt,
      supersededAt: sspReleaseBaselines.supersededAt,
      boundaryId: sspReleaseBaselines.boundaryId,
      boundaryName: boundaries.name,
    })
    .from(sspReleaseBaselines)
    .leftJoin(boundaries, eq(boundaries.id, sspReleaseBaselines.boundaryId))
    .where(eq(sspReleaseBaselines.organizationId, orgId))
    .orderBy(
      // active first, then by released_at desc
      sql`case when ${sspReleaseBaselines.status} = 'active' then 0 else 1 end`,
      desc(sspReleaseBaselines.releasedAt),
    );

  // Severity counts per baseline (open events only). One grouped read.
  const driftCounts = await db
    .select({
      baselineId: sspBaselineDriftEvents.baselineId,
      severity: sspBaselineDriftEvents.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(sspBaselineDriftEvents)
    .where(
      and(
        eq(sspBaselineDriftEvents.organizationId, orgId),
        eq(sspBaselineDriftEvents.status, "open"),
      ),
    )
    .groupBy(sspBaselineDriftEvents.baselineId, sspBaselineDriftEvents.severity);

  const countsByBaseline = new Map<
    string,
    { minor: number; moderate: number; material: number }
  >();
  for (const row of driftCounts) {
    const existing = countsByBaseline.get(row.baselineId) ?? {
      minor: 0,
      moderate: 0,
      material: 0,
    };
    if (row.severity === "minor") existing.minor = row.count;
    if (row.severity === "moderate") existing.moderate = row.count;
    if (row.severity === "material") existing.material = row.count;
    countsByBaseline.set(row.baselineId, existing);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          SSP Release Baselines
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
          Controlled baselines &amp; drift
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Each released SSP version anchors a controlled baseline. Drift
          detection compares current evidence, control findings, boundary
          inventory, and POA&amp;M state against the baseline and classifies
          divergence as minor (log-only), moderate (review required), or
          material (SSP redraft trigger).
        </p>
      </header>

      {baselines.length === 0 ? (
        <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <p className="text-sm text-gray-700">
            No release baselines yet. A baseline is created automatically when
            an SSP version is released through Doc Control.
          </p>
          <Link
            href="/dashboard/ssp"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
          >
            View SSP versions <ArrowRight className="h-3 w-3" />
          </Link>
        </section>
      ) : (
        <ul className="space-y-3">
          {baselines.map((b) => {
            const counts =
              countsByBaseline.get(b.id) ?? {
                minor: 0,
                moderate: 0,
                material: 0,
              };
            const isActive = b.status === "active";
            return (
              <li
                key={b.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  isActive ? "border-emerald-200" : "border-gray-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : b.status === "superseded"
                              ? "bg-gray-100 text-gray-700"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {b.status}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {b.boundaryName ?? "—"} · v{b.sspVersionNumber}
                      </span>
                      {b.qmsDocumentNumber && (
                        <span className="text-xs text-gray-500">
                          {b.qmsDocumentNumber}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
                      <span>
                        Released{" "}
                        {new Date(b.releasedAt).toISOString().slice(0, 10)}
                      </span>
                      <span className="font-mono">
                        sha256:{b.payloadSha256.slice(0, 12)}…
                      </span>
                      {b.supersededAt && (
                        <span>
                          Superseded{" "}
                          {new Date(b.supersededAt).toISOString().slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {counts.material > 0 && (
                      <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-800">
                        {counts.material} material
                      </span>
                    )}
                    {counts.moderate > 0 && (
                      <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
                        {counts.moderate} moderate
                      </span>
                    )}
                    {counts.minor > 0 && (
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700">
                        {counts.minor} minor
                      </span>
                    )}
                    {counts.material === 0 &&
                      counts.moderate === 0 &&
                      counts.minor === 0 && (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                          No open drift
                        </span>
                      )}
                    <Link
                      href={`/dashboard/ssp/baselines/${b.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
