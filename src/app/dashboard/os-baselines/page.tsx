import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boundaries, osAssets } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { PlusCircle, LayoutGrid, Server, Upload } from "lucide-react";
import { CreateBoundaryButton } from "./CreateBoundaryButton";

const cardClass =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

export default async function OSBaselinesPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const list = await db
    .select()
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));

  let withCounts: Array<{
    id: string;
    name: string;
    description: string | null;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
    assetCount: number;
    assetsWithBaselineCount: number;
  }> = list.map((b) => ({ ...b, assetCount: 0, assetsWithBaselineCount: 0 }));

  if (list.length > 0) {
    const boundaryIds = list.map((b) => b.id);
    const assets = await db
      .select({
        boundaryId: osAssets.boundaryId,
        baselineProfileId: osAssets.baselineProfileId,
      })
      .from(osAssets)
      .where(inArray(osAssets.boundaryId, boundaryIds));
    const countByBoundary = new Map<string, { assetCount: number; assetsWithBaselineCount: number }>();
    for (const b of list) {
      countByBoundary.set(b.id, { assetCount: 0, assetsWithBaselineCount: 0 });
    }
    for (const a of assets) {
      const c = countByBoundary.get(a.boundaryId)!;
      c.assetCount++;
      if (a.baselineProfileId) c.assetsWithBaselineCount++;
    }
    withCounts = list.map((b) => ({
      ...b,
      assetCount: countByBoundary.get(b.id)?.assetCount ?? 0,
      assetsWithBaselineCount: countByBoundary.get(b.id)?.assetsWithBaselineCount ?? 0,
    }));
  }

  const totalAssets = withCounts.reduce((s, b) => s + b.assetCount, 0);
  const totalWithBaseline = withCounts.reduce((s, b) => s + b.assetsWithBaselineCount, 0);
  const singleSystemEnclave =
    list.length === 1 &&
    withCounts[0].assetCount === 1 &&
    withCounts[0].assetsWithBaselineCount === 1;

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">
            OS Baselines
          </h1>
          <p className="mt-2 text-[var(--color-gray-600)]">
            Define CUI boundaries and OS assets; assign baseline templates and
            track technical control status from evidence runs.
          </p>
        </div>

        {/* Enclave summary */}
        <section className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Your enclave
          </h2>
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">
            {list.length} {list.length === 1 ? "boundary" : "boundaries"}, {totalAssets} system{totalAssets !== 1 ? "s" : ""} (OS assets), {totalWithBaseline} with baseline assigned. Evidence from these systems drives technical control adjudication.
          </p>
          {singleSystemEnclave && (
            <div className="mt-3 rounded-lg border border-[var(--color-blue-accent)]/30 bg-[var(--color-blue-accent)]/5 p-3">
              <p className="text-sm font-medium text-[var(--color-navy-primary)]">
                Single-system enclave
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                Evidence from this system is used to fully adjudicate technical controls for this boundary.
              </p>
            </div>
          )}
          <Link
            href="/dashboard/technical/upload"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            <Upload className="h-4 w-4" />
            Upload evidence for a system
          </Link>
        </section>

        {/* Workflow when empty */}
        {(list.length === 0 || totalAssets === 0) && (
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">Workflow</h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-[var(--color-gray-600)]">
              <li>Create a boundary (CUI enclave).</li>
              <li>Add OS assets to it (hostname, OS family, version, role).</li>
              <li>Assign a baseline profile to each asset so evidence can be scored.</li>
              <li>Upload evidence per system in Technical onboarding.</li>
            </ol>
          </section>
        )}

        <section className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
              Boundaries (CUI enclaves)
            </h2>
            <CreateBoundaryButton />
          </div>
          {list.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-gray-500)]">
              No boundaries yet. Create one to add OS assets and assign
              baselines.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {withCounts.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/dashboard/os-baselines/boundaries/${b.id}`}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-gray-50)]"
                  >
                    <LayoutGrid className="h-5 w-5 shrink-0 text-[var(--color-gray-500)]" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-[var(--color-gray-900)]">
                        {b.name}
                      </span>
                      {b.description && (
                        <p className="text-sm text-[var(--color-gray-500)]">
                          {b.description}
                        </p>
                      )}
                      <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-gray-500)]">
                        <Server className="h-3.5 w-3.5" />
                        {b.assetCount} system{b.assetCount !== 1 ? "s" : ""}
                        {b.assetsWithBaselineCount < b.assetCount && (
                          <> · {b.assetsWithBaselineCount} with baseline</>
                        )}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
