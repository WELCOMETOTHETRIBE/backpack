import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { controlAdjudications, onboardingWizardState } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { calculateSprsScore } from "@/lib/sprs/sprs_calculator";
import { VAULT_CONTROL_MAP } from "@/data/vault-control-map";
import { auth } from "@/lib/auth";

const adjudicationSchema = z.object({
  controlId: z.string().min(3).max(20),
  tier: z.string().min(1).max(30),
  status: z.enum(["implemented", "inherited", "not_applicable", "planned", "mactech_portion_accepted"]),
  narrative: z.string().optional(),
  evidenceBlobKeys: z.array(z.string()).optional(),
  evidenceBlobHashes: z.record(z.string(), z.string()).optional(),
  poamTargetDate: z.string().optional(),
  poamNotes: z.string().optional(),
  needsReview: z.boolean().optional(),
  needsReviewReason: z.string().optional(),
});

const requestSchema = z.object({
  adjudications: z.array(adjudicationSchema),
});

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    const body = await requestSchema.parseAsync(await req.json());
    const now = new Date();

    // Bulk upsert adjudications
    for (const adj of body.adjudications) {
      const isAttested = adj.status === "implemented";

      await db
        .insert(controlAdjudications)
        .values({
          organizationId: orgId,
          controlId: adj.controlId,
          tier: adj.tier,
          status: adj.status,
          narrative: adj.narrative ?? null,
          attestedByUserId: isAttested ? (userId ?? undefined) : undefined,
          attestedAt: isAttested ? now : undefined,
          evidenceBlobKeys: adj.evidenceBlobKeys ?? [],
          evidenceBlobHashes: adj.evidenceBlobHashes ?? {},
          poamTargetDate: adj.poamTargetDate ?? null,
          poamNotes: adj.poamNotes ?? null,
          needsReview: adj.needsReview ?? false,
          needsReviewReason: adj.needsReviewReason ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [controlAdjudications.organizationId, controlAdjudications.controlId],
          set: {
            tier: adj.tier,
            status: adj.status,
            narrative: adj.narrative ?? null,
            attestedByUserId: isAttested ? (userId ?? undefined) : undefined,
            attestedAt: isAttested ? now : undefined,
            evidenceBlobKeys: adj.evidenceBlobKeys ?? [],
            evidenceBlobHashes: adj.evidenceBlobHashes ?? {},
            poamTargetDate: adj.poamTargetDate ?? null,
            poamNotes: adj.poamNotes ?? null,
            needsReview: adj.needsReview ?? false,
            needsReviewReason: adj.needsReviewReason ?? null,
            updatedAt: now,
          },
        });
    }

    // Compute live SPRS score from all adjudications for this org
    const allAdj = await db
      .select({ controlId: controlAdjudications.controlId, status: controlAdjudications.status })
      .from(controlAdjudications)
      .where(eq(controlAdjudications.organizationId, orgId));

    const implementations = VAULT_CONTROL_MAP.map((ctrl) => {
      const adjRecord = allAdj.find((a) => a.controlId === ctrl.controlId);
      return {
        controlId: ctrl.controlId,
        isImplemented:
          adjRecord?.status === "implemented" ||
          adjRecord?.status === "inherited" ||
          adjRecord?.status === "not_applicable",
      };
    });

    const sprsScore = calculateSprsScore(implementations);

    // Persist score snapshot
    await db
      .update(onboardingWizardState)
      .set({ sprsScoreSnapshot: sprsScore, updatedAt: now })
      .where(eq(onboardingWizardState.organizationId, orgId));

    // Build summary counts
    const statusCounts = allAdj.reduce<Record<string, number>>((acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      sprsScore,
      implemented: statusCounts["implemented"] ?? 0,
      inherited: statusCounts["inherited"] ?? 0,
      notApplicable: statusCounts["not_applicable"] ?? 0,
      planned: statusCounts["planned"] ?? 0,
      needsReview: allAdj.filter((a) => {
        const ctrl = VAULT_CONTROL_MAP.find((c) => c.controlId === a.controlId);
        return ctrl?.needsReview;
      }).length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
