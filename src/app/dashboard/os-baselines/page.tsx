import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boundaries, osAssets } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { LayoutGrid, Server, Upload, Cloud, Settings2 } from "lucide-react";
import { CreateBoundaryButton } from "./CreateBoundaryButton";
import { BoundaryDiagramModal } from "./BoundaryDiagramModal";
import { DeleteBoundaryButton } from "./boundaries/[id]/DeleteBoundaryButton";
import { getScopeComponentLabels } from "./scope-labels";

const cardClass =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

function cloudProviderDisplay(cloudProvider: string | null, azureEnvironment: string | null): string {
  if (!cloudProvider || cloudProvider === "none") return "On-prem";
  if (cloudProvider === "azure" || cloudProvider === "microsoft") {
    return azureEnvironment === "gov" ? "Azure Government" : azureEnvironment === "commercial" ? "Azure Commercial" : "Azure";
  }
  if (cloudProvider === "google") return "Google Cloud";
  return cloudProvider;
}

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

  const singleBoundary = list.length === 1 ? withCounts[0]! : null;
  const scopeLabels = singleBoundary ? getScopeComponentLabels(singleBoundary.scopeComponents ?? null) : [];

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">
            System Boundary
          </h1>
          <p className="mt-2 text-[var(--color-gray-600)]">
            Your system boundary defines the in-scope systems and components for CUI. Evidence from endpoints in this boundary is used for technical control validation.
          </p>
        </div>

        {list.length === 0 && (
          <>
            <section className={cardClass}>
              <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">Workflow</h2>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-[var(--color-gray-600)]">
                <li>Create a boundary.</li>
                <li>Add endpoints (hostname, OS, role) to the boundary.</li>
                <li>Assign a baseline to each endpoint for scoring.</li>
                <li>Upload evidence in Technical.</li>
              </ol>
            </section>
            <section className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
                  Your system boundary
                </h2>
                <div className="flex items-center gap-2">
                  <BoundaryDiagramModal />
                  <CreateBoundaryButton disabled={false} />
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--color-gray-500)]">
                No boundary yet. Create one to add endpoints and assign baselines.
              </p>
            </section>
          </>
        )}

        {singleBoundary && (
          <>
            <section className={cardClass}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                Your system boundary
              </h2>
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--color-gray-900)]">
                    {singleBoundary.name}
                  </h3>
                  {singleBoundary.description && (
                    <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                      {singleBoundary.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-[var(--color-gray-600)]">
                    <Cloud className="h-4 w-4 text-[var(--color-gray-500)]" />
                    {cloudProviderDisplay(singleBoundary.cloudProvider, singleBoundary.azureEnvironment)}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-medium text-[var(--color-gray-700)]">OS &amp; endpoints</p>
                  <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                    {singleBoundary.assetCount} endpoint{singleBoundary.assetCount !== 1 ? "s" : ""} (VMs, servers)
                    {singleBoundary.assetsWithBaselineCount < singleBoundary.assetCount && (
                      <> · {singleBoundary.assetsWithBaselineCount} with baseline assigned</>
                    )}
                  </p>
                  <Link
                    href={`/dashboard/os-baselines/boundaries/${singleBoundary.id}`}
                    className="mt-1 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    Manage endpoints →
                  </Link>
                </div>

                {scopeLabels.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-[var(--color-gray-700)]">In-scope components</p>
                    <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                      {scopeLabels.join(", ")}
                    </p>
                  </div>
                )}

                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)]/50 p-3">
                  <p className="text-sm font-medium text-[var(--color-gray-700)]">Additional boundary items</p>
                  <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                    Networking devices, additional VMs, or bare metal can be added in the boundary detail page.
                  </p>
                  <Link
                    href={`/dashboard/os-baselines/boundaries/${singleBoundary.id}`}
                    className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    Manage boundary →
                  </Link>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href={`/dashboard/os-baselines/boundaries/${singleBoundary.id}`}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
                >
                  <Settings2 className="h-4 w-4" />
                  Manage boundary
                </Link>
                <Link
                  href="/dashboard/technical/upload"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
                >
                  <Upload className="h-4 w-4" />
                  Upload evidence for an endpoint
                </Link>
              </div>
            </section>
          </>
        )}

        {list.length > 1 && (
          <section className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
                Boundaries (CUI enclaves)
              </h2>
              <div className="flex items-center gap-2">
                <BoundaryDiagramModal />
                <CreateBoundaryButton disabled={list.length >= 1} />
              </div>
            </div>
            <ul className="mt-4 space-y-3">
              {withCounts.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-gray-50)]"
                >
                  <Link
                    href={`/dashboard/os-baselines/boundaries/${b.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
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
                        {b.assetCount} endpoint{b.assetCount !== 1 ? "s" : ""}
                        {b.assetsWithBaselineCount < b.assetCount && (
                          <> · {b.assetsWithBaselineCount} with baseline</>
                        )}
                      </p>
                    </div>
                  </Link>
                  <DeleteBoundaryButton boundaryId={b.id} boundaryName={b.name} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
