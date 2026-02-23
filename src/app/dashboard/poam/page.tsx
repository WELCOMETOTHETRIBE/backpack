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
import { SyncPoamFromControlsButton } from "./SyncPoamFromControlsButton";
import { AddPoamButton } from "./AddPoamButton";

const cardClass = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">POA&M</h1>
        <p className="mt-2 text-gray-600">
          Plans of Action and Milestones. Dual sign-off required for closure.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className={cardClass}>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">From compliance wizard</h2>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SyncPoamFromControlsButton />
            <AddPoamButton />
          </div>
          {overdue.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <h3 className="text-sm font-medium text-amber-800">Overdue ({overdue.length})</h3>
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
          {entries.length > 0 ? (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/poam/entry/${e.id}`}
                    className="flex items-center justify-between rounded border border-slate-200 bg-slate-50/50 px-3 py-2 hover:border-slate-300"
                  >
                    <span className="font-mono text-slate-700">{e.controlId}</span>
                    <span className="max-w-md truncate text-slate-600">
                      {e.weaknessDescription || "No description"}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        e.status === "closed"
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {e.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No wizard POA&M entries yet. Use the button above to create entries from controls marked Not started or In progress.
            </p>
          )}
        </div>

        <div className={cardClass}>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">From control implementations</h2>
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/dashboard/poam/${i.id}`}
                  className="flex items-center justify-between rounded border border-slate-200 bg-slate-50/50 px-3 py-2 hover:border-slate-300"
                >
                  <span className="font-mono text-slate-700">{i.poamId}</span>
                  <span className="max-w-md truncate text-slate-600">{i.title}</span>
                  <span className="text-sm text-slate-500">{i.controlId}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      i.status === "Closed"
                        ? "bg-green-100 text-green-800"
                        : i.riskSeverity === "High" || i.riskSeverity === "Critical"
                          ? "bg-red-100 text-red-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {i.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {items.length === 0 && entries.length === 0 && (
            <p className="text-slate-500">
              No POA&M items yet. Use &quot;Create POA&M for incomplete controls&quot; above or add from the Compliance Hub.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
