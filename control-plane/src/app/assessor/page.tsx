import { auth } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/db";
import { controlRecords, controls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

export default async function AssessorDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return null;

  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      title: controls.title,
    })
    .from(controlRecords)
    .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .where(eq(controlRecords.organizationId, orgId));

  const byId: Record<string, (typeof records)[0]> = {};
  for (const r of records) byId[r.controlId] = r;

  const implemented = records.filter(
    (r) =>
      r.implementationStatus === "implemented" ||
      r.implementationStatus === "assessed" ||
      r.implementationStatus === "inherited"
  ).length;
  const total = ALL_CONTROL_IDS.length;
  const pct = total ? Math.round((implemented / total) * 100) : 0;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">Assessor — Control compliance</h1>
      <p className="mb-6 text-zinc-600">
        Read-only view. Full narratives, governance artifacts, technical evidence, and change history per control.
      </p>
      <div className="mb-6 rounded border border-zinc-200 bg-white p-4">
        <p className="text-lg font-medium text-zinc-800">
          Overall: {implemented} / {total} implemented ({pct}%)
        </p>
      </div>
      <ul className="space-y-1">
        {ALL_CONTROL_IDS.map((controlId) => {
          const r = byId[controlId];
          const status = r?.implementationStatus ?? "not_started";
          const title = r?.title ?? controlId;
          return (
            <li key={controlId}>
              <Link
                href={`/assessor/controls/${controlId}`}
                className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 text-sm hover:border-zinc-300"
              >
                <span className="font-mono text-zinc-700">{controlId}</span>
                <span className="max-w-md truncate text-zinc-600">{title}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    status === "implemented" || status === "assessed" || status === "inherited"
                      ? "bg-green-100 text-green-800"
                      : status === "in_progress"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {status}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
