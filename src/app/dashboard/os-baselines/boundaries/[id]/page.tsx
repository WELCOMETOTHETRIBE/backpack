import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { boundaries, osAssets, osBaselineProfiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";
import { Server, ChevronRight, Upload } from "lucide-react";
import { AddAssetForm } from "../../AddAssetForm";
import { EditBoundaryForm } from "./EditBoundaryForm";
import { CloudHostingCard } from "./CloudHostingCard";
import { DeleteBoundaryButton } from "./DeleteBoundaryButton";
import { DeleteAssetButton } from "./DeleteAssetButton";
import { AzureEntraEvidenceCard } from "./AzureEntraEvidenceCard";

export default async function BoundaryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { id } = await params;
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, id), eq(boundaries.organizationId, orgId)));
  if (!boundary) notFound();

  const assets = await db
    .select({
      id: osAssets.id,
      hostname: osAssets.hostname,
      osFamily: osAssets.osFamily,
      osVersion: osAssets.osVersion,
      role: osAssets.role,
      baselineProfileId: osAssets.baselineProfileId,
    })
    .from(osAssets)
    .where(eq(osAssets.boundaryId, id));

  const profileIds = [...new Set(assets.map((a) => a.baselineProfileId).filter(Boolean))] as string[];
  let profileMap: Record<string, string> = {};
  if (profileIds.length > 0) {
    const profiles = await db
      .select({ id: osBaselineProfiles.id, name: osBaselineProfiles.name })
      .from(osBaselineProfiles);
    profileMap = Object.fromEntries(profiles.filter((p) => profileIds.includes(p.id)).map((p) => [p.id, p.name]));
  }

  const singleSystemEnclave =
    assets.length === 1 && assets[0].baselineProfileId != null;

  const cardClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-[var(--color-gray-500)]">
          <Link href="/dashboard/os-baselines" className="hover:underline">
            System Boundary
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-[var(--color-gray-700)]">{boundary.name}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">
              {boundary.name}
            </h1>
            {boundary.description && (
              <p className="mt-2 text-[var(--color-gray-600)]">
                {boundary.description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <EditBoundaryForm
              boundaryId={id}
              initialName={boundary.name}
              initialDescription={boundary.description}
              initialCloudProvider={boundary.cloudProvider}
              initialAzureEnvironment={boundary.azureEnvironment}
            />
            <DeleteBoundaryButton boundaryId={id} boundaryName={boundary.name} />
          </div>
        </div>

        {singleSystemEnclave && (
          <section className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-navy-primary)]">
              Single-system enclave
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
              Evidence from the listed system drives full technical control adjudication here.
            </p>
            <Link
              href={`/dashboard/technical/upload?assetId=${assets[0].id}`}
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              <Upload className="h-4 w-4" />
              Upload evidence for this system
            </Link>
          </section>
        )}

        <CloudHostingCard
          boundaryId={id}
          cloudProvider={boundary.cloudProvider}
          azureEnvironment={boundary.azureEnvironment}
        />

        {(boundary.cloudProvider === "microsoft" || boundary.cloudProvider === "azure") && (
          <AzureEntraEvidenceCard boundaryId={id} />
        )}

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
            OS assets
          </h2>
          <AddAssetForm boundaryId={id} />
          {assets.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-gray-500)]">
              No assets yet. Add a host (hostname, OS, role, baseline) above.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {assets.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-gray-50)]"
                >
                  <Link
                    href={`/dashboard/os-baselines/assets/${a.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Server className="h-5 w-5 shrink-0 text-[var(--color-gray-500)]" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-[var(--color-gray-900)]">
                        {a.hostname}
                      </span>
                      <span className="ml-2 text-sm text-[var(--color-gray-500)]">
                        {a.osFamily} {a.osVersion} · {a.role}
                      </span>
                      {a.baselineProfileId && (
                        <p className="mt-1 text-xs text-[var(--color-gray-500)]">
                          Baseline: {profileMap[a.baselineProfileId] ?? a.baselineProfileId}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-gray-400)]" />
                  </Link>
                  <DeleteAssetButton assetId={a.id} hostname={a.hostname} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
