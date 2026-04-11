import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { trainingRecords } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import TrainingClient from "./TrainingClient";

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
    />
  );
}
