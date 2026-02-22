import { auth } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/db";
import { controlImplementations, controls, controlFamilies } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function AssessorDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return null;

  const impls = await db
    .select({
      id: controlImplementations.id,
      status: controlImplementations.status,
      implementationNarrative: controlImplementations.implementationNarrative,
      control: {
        controlId: controls.controlId,
        title: controls.title,
        familyCode: controlFamilies.code,
      },
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(controlImplementations.organizationId, orgId));

  const implemented = impls.filter((i) => i.status === "Implemented").length;
  const total = impls.length;
  const pct = total ? Math.round((implemented / total) * 100) : 0;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">Assessor — Control compliance</h1>
      <p className="mb-6 text-zinc-600">
        Read-only view. Trace controls to implementation narrative and evidence metadata.
      </p>
      <div className="mb-6 rounded border border-zinc-200 bg-white p-4">
        <p className="text-lg font-medium text-zinc-800">
          Overall: {implemented} / {total} implemented ({pct}%)
        </p>
      </div>
      <ul className="space-y-1">
        {impls.slice(0, 50).map((c) => (
          <li key={c.id}>
            <Link
              href={`/assessor/controls/${c.id}`}
              className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 text-sm hover:border-zinc-300"
            >
              <span className="font-mono text-zinc-700">{c.control?.controlId}</span>
              <span className="max-w-md truncate text-zinc-600">{c.control?.title}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  c.status === "Implemented" ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {c.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {impls.length > 50 && (
        <p className="mt-4 text-sm text-zinc-500">Showing first 50. Use Controls list for full view.</p>
      )}
    </div>
  );
}
