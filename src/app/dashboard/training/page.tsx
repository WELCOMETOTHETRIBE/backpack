import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { trainingRecords } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import TrainingClient from "./TrainingClient";
import { getIrTabletopSummaryForOrg } from "@/lib/ir-tabletop/get-summary-for-org";

export default async function TrainingRecordsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const records = await db
    .select({
      id: trainingRecords.id,
      personnelName: trainingRecords.personnelName,
      personnelEmail: trainingRecords.personnelEmail,
      trainingType: trainingRecords.trainingType,
      courseTitle: trainingRecords.courseTitle,
      deliveryMethod: trainingRecords.deliveryMethod,
      completedAt: trainingRecords.completedAt,
      expiresAt: trainingRecords.expiresAt,
      evidenceUrl: trainingRecords.evidenceUrl,
      notes: trainingRecords.notes,
      createdAt: trainingRecords.createdAt,
    })
    .from(trainingRecords)
    .where(eq(trainingRecords.organizationId, orgId))
    .orderBy(desc(trainingRecords.completedAt));

  // IR tabletop summary — surfaces alongside awareness training so the
  // customer sees both "people did the AT training" AND "we tested the
  // IR plan" on one operator-facing page. Both are "people did the
  // thing" evidence that the C3PAO's interview/examine objectives ask
  // for; pairing them here keeps the IR.L2-3.6.x close to where its
  // satisfying activity is run from.
  const irTabletopSummary = await getIrTabletopSummaryForOrg(orgId);

  return (
    <TrainingClient
      initialRecords={records.map((r) => ({
        ...r,
        personnelEmail: r.personnelEmail ?? null,
        deliveryMethod: r.deliveryMethod ?? null,
        expiresAt: r.expiresAt ?? null,
        evidenceUrl: r.evidenceUrl ?? null,
        notes: r.notes ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))}
      irTabletopSummary={irTabletopSummary}
    />
  );
}
