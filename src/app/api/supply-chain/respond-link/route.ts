import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import {
  subcontractorRelationships,
  subcontractorFlowdownResponses,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

const requestSchema = z.object({
  token: z.string().length(64),
});

/**
 * POST /api/supply-chain/respond-link
 * Authenticated. Links the current user's organization to the relationship and marks the flow-down response as linked_workspace.
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const body = await requestSchema.parseAsync(await req.json());
    const { token } = body;

    const [responseRow] = await db
      .select({
        id: subcontractorFlowdownResponses.id,
        subcontractorRelationshipId: subcontractorFlowdownResponses.subcontractorRelationshipId,
        respondedAt: subcontractorFlowdownResponses.respondedAt,
      })
      .from(subcontractorFlowdownResponses)
      .where(eq(subcontractorFlowdownResponses.token, token))
      .limit(1);

    if (!responseRow) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }
    if (responseRow.respondedAt) {
      return NextResponse.json({ error: "This link has already been used" }, { status: 400 });
    }

    await db
      .update(subcontractorRelationships)
      .set({
        subOrganizationId: orgId,
        status: "Active",
        updatedAt: new Date(),
      })
      .where(eq(subcontractorRelationships.id, responseRow.subcontractorRelationshipId));

    await db
      .update(subcontractorFlowdownResponses)
      .set({
        responseType: "linked_workspace",
        linkedOrganizationId: orgId,
        respondedAt: new Date(),
      })
      .where(eq(subcontractorFlowdownResponses.id, responseRow.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
