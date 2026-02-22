import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { controlImplementations, controls, controlFamilies, flowdownRequirements, contracts, subcontractorRelationships } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { Network } from "lucide-react";

export default async function ControlsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const impls = await db
    .select({
      id: controlImplementations.id,
      status: controlImplementations.status,
      control: {
        controlId: controls.controlId,
        title: controls.title,
        familyCode: controlFamilies.code,
        controlUuid: controls.id,
      },
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(controlImplementations.organizationId, orgId));

  // Fetch flow-down requirements for this subcontractor
  const subContracts = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.subOrganizationId, orgId));

  const contractIds = subContracts.map((c) => c.id);
  let flowdownControlUuids: string[] = [];

  if (contractIds.length > 0) {
    const flowdowns = await db
      .select({ controlId: flowdownRequirements.controlId })
      .from(flowdownRequirements)
      .where(inArray(flowdownRequirements.contractId, contractIds));

    flowdownControlUuids = flowdowns.map((f) => f.controlId);
  }

  const byFamily = impls.reduce(
    (acc: Record<string, typeof impls>, c) => {
      const code = c.control?.familyCode ?? "Other";
      if (!acc[code]) acc[code] = [];
      acc[code].push(c);
      return acc;
    },
    {}
  );

  const familyOrder = ["AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP", "PE", "PL", "PS", "RA", "SA", "SC", "SI"];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">Controls</h1>
      <p className="mb-6 text-zinc-600">
        NIST SP 800-171 Rev 2 — 110 controls. Click a control to view or edit implementation.
      </p>
      <div className="space-y-6">
        {familyOrder.filter((code) => byFamily[code]?.length).map((code) => (
          <div key={code}>
            <h2 className="mb-2 text-lg font-medium text-zinc-800">{code}</h2>
            <ul className="space-y-1">
              {(byFamily[code] ?? []).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/controls/${c.id}`}
                    className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 text-sm hover:border-zinc-300"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-zinc-700">{c.control?.controlId}</span>
                      {c.control?.controlUuid && flowdownControlUuids.includes(c.control.controlUuid) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#3B82F6]/10 px-2 py-0.5 text-xs font-medium text-[#3B82F6]">
                          <Network className="h-3 w-3" />
                          Flow-Down
                        </span>
                      )}
                    </div>
                    <span className="max-w-md truncate text-zinc-600">{c.control?.title}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        c.status === "Implemented"
                          ? "bg-green-100 text-green-800"
                          : c.status === "POA&M"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {c.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
