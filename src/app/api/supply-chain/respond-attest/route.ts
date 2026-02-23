import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { subcontractorFlowdownResponses } from "@/db/schema";
import { eq } from "drizzle-orm";

const requestSchema = z.object({
  token: z.string().length(64),
  attestationData: z.record(z.string(), z.unknown()).optional().default({}),
  sspDocumentUrl: z.string().url().optional(),
  poamDocumentUrl: z.string().url().optional(),
});

/**
 * POST /api/supply-chain/respond-attest
 * Unauthenticated. Validates token and stores manual attestation response.
 */
export async function POST(req: Request) {
  try {
    const body = await requestSchema.parseAsync(await req.json());
    const { token, attestationData, sspDocumentUrl, poamDocumentUrl } = body;

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
      .update(subcontractorFlowdownResponses)
      .set({
        responseType: "manual_attestation",
        attestationData: attestationData ?? {},
        sspDocumentUrl: sspDocumentUrl ?? null,
        poamDocumentUrl: poamDocumentUrl ?? null,
        respondedAt: new Date(),
      })
      .where(eq(subcontractorFlowdownResponses.id, responseRow.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
