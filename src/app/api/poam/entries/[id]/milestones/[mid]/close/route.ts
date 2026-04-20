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
 * Enforces closure shape based on the placeholder artifact's
 * expectedClosureType (mirrored from the client-required-artifacts catalog):
 *
 *   upload             → artifactId REQUIRED, artifact must have a file
 *                        (status != 'awaiting_upload'); auto-links milestone.
 *   attestation        → artifactId with file OR non-empty attestationText
 *   register_pointer   → requires ≥1 finalized entry in the milestone's
 *                        registerKey register (artifactId optional, linked if
 *                        provided)
 *   system_pointer     → requires systemPointerTarget (free-text reference to
 *                        the in-app target, e.g. an SSP section id)
 *
 * On success sets milestone.completedAt. Does NOT close the parent POAM entry;
 * whole-entry closure still flows through /api/poam/entries/:id/closure.
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
    const [placeholder] = await db
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

    const expectedClosureType =
      placeholder?.artifacts.expectedClosureType ??
      (placeholder?.artifacts.milestoneKey
        ? MILESTONES_BY_KEY.get(placeholder.artifacts.milestoneKey)?.closureType
        : undefined) ??
      // Fallback to the catalog via the placeholder's milestoneKey, else treat
      // as "upload" (strictest) if we truly have no metadata.
      "upload";

    // Resolve artifactId (if provided) and confirm ownership + file presence.
    let chosenArtifact:
      | (typeof artifacts.$inferSelect)
      | null = null;
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

    // ---- Enforcement per closure type ----------------------------------------
    switch (expectedClosureType) {
      case "upload": {
        if (!chosenArtifact) {
          return NextResponse.json(
            { error: "artifactId is required to close an 'upload' milestone" },
            { status: 400 }
          );
        }
        if (chosenArtifact.status === "awaiting_upload" || !chosenArtifact.fileUrl) {
          return NextResponse.json(
            { error: "The referenced artifact has no file uploaded yet" },
            { status: 400 }
          );
        }
        break;
      }
      case "attestation": {
        const hasFile =
          chosenArtifact &&
          chosenArtifact.status !== "awaiting_upload" &&
          chosenArtifact.fileUrl;
        const hasText = Boolean(body.attestationText?.trim());
        if (!hasFile && !hasText) {
          return NextResponse.json(
            { error: "Attestation milestones require an uploaded artifact or attestationText" },
            { status: 400 }
          );
        }
        break;
      }
      case "register_pointer": {
        // Look up the milestone's expected registerKey from catalog.
        const milestoneKey = placeholder?.artifacts.milestoneKey ?? null;
        const catalogEntry = milestoneKey ? MILESTONES_BY_KEY.get(milestoneKey) : undefined;
        const registerKey = catalogEntry?.registerKey;
        if (!registerKey) {
          return NextResponse.json(
            { error: "register_pointer milestone is missing its registerKey" },
            { status: 500 }
          );
        }
        // Find the register for this org, count finalized entries.
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
        if (!register) {
          return NextResponse.json(
            { error: `Register "${registerKey}" not configured for this organization` },
            { status: 400 }
          );
        }
        const orgBoundaries = await db
          .select({ id: boundaries.id })
          .from(boundaries)
          .where(eq(boundaries.organizationId, orgId));
        const boundaryIds = orgBoundaries.map((b) => b.id);
        if (boundaryIds.length === 0) {
          return NextResponse.json(
            { error: "No boundary configured for this organization" },
            { status: 400 }
          );
        }
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
        const finalCount = row?.cnt ?? 0;
        if (finalCount < 1) {
          return NextResponse.json(
            {
              error: `Register "${registerKey}" has no finalized entries yet`,
            },
            { status: 400 }
          );
        }
        break;
      }
      case "system_pointer": {
        if (!body.systemPointerTarget?.trim()) {
          return NextResponse.json(
            { error: "systemPointerTarget is required to close a 'system_pointer' milestone" },
            { status: 400 }
          );
        }
        break;
      }
      default: {
        return NextResponse.json(
          { error: `Unknown expectedClosureType: ${expectedClosureType}` },
          { status: 500 }
        );
      }
    }

    // ---- Link artifact → milestone (if artifact provided & not yet linked) ---
    if (chosenArtifact) {
      await createArtifactLink({
        orgId,
        artifactId: chosenArtifact.id,
        linkType: "poam_milestone",
        linkTargetId: mid,
        userId: user.id,
      });
    }

    // ---- Mark milestone complete --------------------------------------------
    const [updated] = await db
      .update(poamEntryMilestones)
      .set({ completedAt: new Date() })
      .where(eq(poamEntryMilestones.id, mid))
      .returning();

    return NextResponse.json({
      milestone: updated,
      closureType: expectedClosureType,
      artifactLinked: Boolean(chosenArtifact),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Close failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
