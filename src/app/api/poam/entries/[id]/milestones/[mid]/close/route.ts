import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  poamEntries,
  poamEntryMilestones,
  artifacts,
  artifactLinks,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { createArtifactLink } from "@/lib/artifacts/artifact-links";
import { MILESTONES_BY_KEY } from "@/data/cmmc/client-required-artifacts";

/**
 * POST /api/poam/entries/:id/milestones/:mid/close
 *
 * Body: { artifactId?: string; attestationText?: string; systemPointerTarget?: string }
 *
 * Closure logic: ANY of the following evidence shapes satisfies the
 * milestone. The catalog's `expectedClosureType` is a hint for the UI,
 * not a gate:
 *
 *   • artifactId pointing at an artifact with a file attached
 *   • attestationText (non-empty)
 *   • systemPointerTarget (non-empty)
 *   • the milestone's register (via catalog registerKey) has ≥1 finalized entry
 *
 * If at least one signal is present, the milestone closes and we record the
 * artifact link (if any). If none are present we return 400 with a helpful
 * message describing the accepted shapes and the register key when applicable.
 *
 * This route does NOT auto-close the parent POAM entry; whole-entry closure
 * still flows through /api/poam/entries/:id/closure.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id, mid } = await params;

    const [entry] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) return NextResponse.json({ error: "POAM entry not found" }, { status: 404 });

    const [milestone] = await db
      .select()
      .from(poamEntryMilestones)
      .where(
        and(
          eq(poamEntryMilestones.id, mid),
          eq(poamEntryMilestones.poamEntryId, id)
        )
      )
      .limit(1);
    if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    if (milestone.completedAt) {
      return NextResponse.json(milestone); // already closed — idempotent success
    }

    const body = (await req.json().catch(() => ({}))) as {
      artifactId?: string;
      attestationText?: string;
      systemPointerTarget?: string;
    };

    // Locate the placeholder artifact for this milestone (seeded at onboarding).
    const [placeholderRow] = await db
      .select()
      .from(artifacts)
      .innerJoin(artifactLinks, eq(artifactLinks.artifactId, artifacts.id))
      .where(
        and(
          eq(artifacts.organizationId, orgId),
          eq(artifactLinks.linkType, "poam_milestone"),
          eq(artifactLinks.linkTargetId, mid)
        )
      )
      .limit(1);
    const placeholder = placeholderRow?.artifacts ?? null;

    const milestoneKey = placeholder?.milestoneKey ?? null;
    const catalogMilestone = milestoneKey ? MILESTONES_BY_KEY.get(milestoneKey) : undefined;
    const expectedClosureType = catalogMilestone?.closureType ?? placeholder?.expectedClosureType ?? null;
    const registerKey = catalogMilestone?.registerKey ?? null;

    // ── Resolve artifact (if supplied) ────────────────────────────────────────
    let chosenArtifact: typeof artifacts.$inferSelect | null = null;
    if (body.artifactId) {
      const [a] = await db
        .select()
        .from(artifacts)
        .where(
          and(
            eq(artifacts.id, body.artifactId),
            eq(artifacts.organizationId, orgId)
          )
        )
        .limit(1);
      if (!a) {
        return NextResponse.json({ error: "artifactId not found in this org" }, { status: 404 });
      }
      chosenArtifact = a;
    }

    // ── Gather evidence signals ───────────────────────────────────────────────
    const hasFile = Boolean(
      chosenArtifact &&
        chosenArtifact.status !== "awaiting_upload" &&
        chosenArtifact.fileUrl
    );
    const hasText = Boolean(body.attestationText?.trim());
    const hasSystemPointer = Boolean(body.systemPointerTarget?.trim());
    const hasRegister = registerKey
      ? await registerHasFinalEntries(orgId, registerKey)
      : false;

    if (!hasFile && !hasText && !hasSystemPointer && !hasRegister) {
      const accepted: string[] = [];
      accepted.push("upload a file and pass artifactId");
      accepted.push("submit attestationText");
      if (registerKey) {
        accepted.push(
          `finalize at least one entry in the "${registerKey}" register (preferred)`
        );
      }
      if (expectedClosureType === "system_pointer") {
        accepted.push("pass systemPointerTarget");
      }
      return NextResponse.json(
        {
          error: "No evidence present. Accepted closure paths: " + accepted.join("; ") + ".",
          expectedClosureType,
          registerKey,
        },
        { status: 400 }
      );
    }

    // ── Link artifact → milestone (if artifact provided & not yet linked) ─────
    if (chosenArtifact) {
      await createArtifactLink({
        orgId,
        artifactId: chosenArtifact.id,
        linkType: "poam_milestone",
        linkTargetId: mid,
        userId: user.id,
      });
    }

    // ── Mark milestone complete ──────────────────────────────────────────────
    const [updated] = await db
      .update(poamEntryMilestones)
      .set({ completedAt: new Date() })
      .where(eq(poamEntryMilestones.id, mid))
      .returning();

    return NextResponse.json({
      milestone: updated,
      expectedClosureType,
      closedBy: {
        artifact: hasFile,
        attestation: hasText,
        systemPointer: hasSystemPointer,
        register: hasRegister,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Close failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Does the given org have ≥1 finalized entry in the register with this key? */
async function registerHasFinalEntries(
  orgId: string,
  registerKey: string
): Promise<boolean> {
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisters.registerKey, registerKey)
      )
    )
    .limit(1);
  if (!register) return false;

  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const boundaryIds = orgBoundaries.map((b) => b.id);
  if (boundaryIds.length === 0) return false;

  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        inArray(governanceRegisterEntries.boundaryId, boundaryIds),
        eq(governanceRegisterEntries.status, "final")
      )
    );
  return (row?.cnt ?? 0) > 0;
}
