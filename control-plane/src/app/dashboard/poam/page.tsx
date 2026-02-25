import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  poamItems,
  poamEntries,
  controlRecords,
  controlImplementations,
  controls,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { PoamTableClient, type PoamRow } from "./PoamTableClient";

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
  const overdueCount = items.filter(
    (i) => i.status !== "Closed" && new Date(i.targetCompletionDate) < now
  ).length;

  const rows: PoamRow[] = [
    ...entries.map((e) => ({
      id: `wizard-${e.id}`,
      source: "Wizard",
      controlId: e.controlId ?? "—",
      description: e.weaknessDescription ?? "No description",
      status: e.status,
      date: e.scheduledCompletionDate
        ? new Date(e.scheduledCompletionDate).toLocaleDateString()
        : "—",
      link: `/dashboard/poam/entry/${e.id}`,
    })),
    ...items.map((i) => ({
      id: `impl-${i.id}`,
      source: "Control implementation",
      controlId: i.controlId ?? "—",
      description: i.title ?? "—",
      status: i.status,
      date: i.targetCompletionDate
        ? new Date(i.targetCompletionDate).toLocaleDateString()
        : "—",
      link: `/dashboard/poam/${i.id}`,
    })),
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">POA&M</h1>
        <p className="mt-2 text-gray-600">
          Plans of Action and Milestones. Dual sign-off required for closure.
        </p>
      </div>
      <PoamTableClient rows={rows} overdueCount={overdueCount} />
    </div>
  );
}
