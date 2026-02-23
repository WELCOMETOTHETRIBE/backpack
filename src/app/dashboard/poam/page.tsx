import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  poamItems,
  poamEntries,
  controlRecords,
  controlImplementations,
  controls,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function PoamPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const items = await db
    .select({
      id: poamItems.id,
      poamId: poamItems.poamId,
      title: poamItems.title,
      status: poamItems.status,
      riskSeverity: poamItems.riskSeverity,
      targetCompletionDate: poamItems.targetCompletionDate,
      controlId: controls.controlId,
    })
    .from(poamItems)
    .innerJoin(controlImplementations, eq(poamItems.controlImplementationId, controlImplementations.id))
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .where(eq(poamItems.organizationId, orgId));

  const entries = await db
    .select({
      id: poamEntries.id,
      controlRecordId: poamEntries.controlRecordId,
      controlId: controlRecords.controlId,
      status: poamEntries.status,
      weaknessDescription: poamEntries.weaknessDescription,
      scheduledCompletionDate: poamEntries.scheduledCompletionDate,
    })
    .from(poamEntries)
    .innerJoin(controlRecords, eq(poamEntries.controlRecordId, controlRecords.id))
    .where(eq(poamEntries.organizationId, orgId));

  const now = new Date();
  const overdue = items.filter(
    (i) => i.status !== "Closed" && new Date(i.targetCompletionDate) < now
  );

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">POA&M</h1>
      <p className="mb-6 text-zinc-600">
        Plans of Action and Milestones. Dual sign-off required for closure.
      </p>

      {entries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium text-zinc-800">From compliance wizard</h2>
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/dashboard/poam/entry/${e.id}`}
                  className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 hover:border-zinc-300"
                >
                  <span className="font-mono text-zinc-700">{e.controlId}</span>
                  <span className="max-w-md truncate text-zinc-600">
                    {e.weaknessDescription || "No description"}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      e.status === "closed"
                        ? "bg-green-100 text-green-800"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {e.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overdue.length > 0 && (
        <div className="mb-6 rounded border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-medium text-amber-800">Overdue ({overdue.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-700">
            {overdue.map((i) => (
              <li key={i.id}>
                <Link href={`/dashboard/poam/${i.id}`} className="hover:underline">
                  {i.poamId} — {i.title} (due {new Date(i.targetCompletionDate).toLocaleDateString()})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <section>
        <h2 className="mb-3 text-lg font-medium text-zinc-800">Legacy POA&M items</h2>
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={`/dashboard/poam/${i.id}`}
                className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 hover:border-zinc-300"
              >
                <span className="font-mono text-zinc-700">{i.poamId}</span>
                <span className="max-w-md truncate text-zinc-600">{i.title}</span>
                <span className="text-sm text-zinc-500">{i.controlId}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    i.status === "Closed"
                      ? "bg-green-100 text-green-800"
                      : i.riskSeverity === "High" || i.riskSeverity === "Critical"
                        ? "bg-red-100 text-red-800"
                        : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {i.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {items.length === 0 && entries.length === 0 && (
        <p className="text-zinc-500">No POA&M items yet. Add one from the Governance Wizard (Add to POA&M).</p>
      )}
    </div>
  );
}
