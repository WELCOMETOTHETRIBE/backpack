import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { trustCodexAcceptances, onboardingWizardState } from "@/db/schema";
import { eq } from "drizzle-orm";

const requestSchema = z.object({
  signatoryName: z.string().min(1).max(255),
  signatoryTitle: z.string().min(1).max(255),
  cageCode: z.string().max(10).optional(),
  primeContractNumber: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();

    // Idempotency: if already accepted, return the existing record
    const [existing] = await db
      .select({ id: trustCodexAcceptances.id, acceptedAt: trustCodexAcceptances.acceptedAt })
      .from(trustCodexAcceptances)
      .where(eq(trustCodexAcceptances.organizationId, orgId))
      .limit(1);

    if (existing) {
      return NextResponse.json({
        accepted: true,
        acceptedAt: existing.acceptedAt.toISOString(),
        alreadyAccepted: true,
      });
    }

    const body = await requestSchema.parseAsync(await req.json());

    // Extract IP — respects x-forwarded-for for proxy environments
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // SHA-256 of user agent (never store raw UA; hash provides audit fingerprint)
    const rawUA = req.headers.get("user-agent") ?? "";
    const userAgentHash = rawUA
      ? createHash("sha256").update(rawUA).digest("hex")
      : null;

    // Auth: get accepting user ID
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    const acceptingUserId = (session?.user as { id?: string } | undefined)?.id;
    if (!acceptingUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!body.cageCode) {
      // Log absence of CAGE code — audit trail, not a blocking error
      console.warn(
        `[trust-codex] Organization ${orgId} accepted Trust Codex without CAGE code.`
      );
    }

    // Insert acceptance record
    const [acceptance] = await db
      .insert(trustCodexAcceptances)
      .values({
        organizationId: orgId,
        version: "1.0",
        acceptedByUserId: acceptingUserId,
        signatoryName: body.signatoryName,
        signatoryTitle: body.signatoryTitle,
        cageCode: body.cageCode ?? null,
        primeContractNumber: body.primeContractNumber ?? null,
        ipAddress,
        userAgentHash,
      })
      .returning({ id: trustCodexAcceptances.id, acceptedAt: trustCodexAcceptances.acceptedAt });

    // Initialize wizard state at phase 0 (or reset if somehow exists)
    await db
      .insert(onboardingWizardState)
      .values({
        organizationId: orgId,
        currentPhase: 0,
        completedPhases: [],
        phaseData: {},
      })
      .onConflictDoNothing();

    return NextResponse.json({
      accepted: true,
      acceptedAt: acceptance.acceptedAt.toISOString(),
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
