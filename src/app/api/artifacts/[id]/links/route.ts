import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  artifacts,
  artifactLinks,
  controlRecords,
  governanceRegisterEntries,
  poamEntries,
  poamEntryMilestones,
  boundaries,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  createArtifactLink,
  deleteArtifactLink,
  findLinksForArtifact,
  type ArtifactLinkType,
} from "@/lib/artifacts/artifact-links";

const LINK_TYPES: ArtifactLinkType[] = [
  "control",
  "register_entry",
  "poam_entry",
  "poam_milestone",
];

async function verifyTargetOwnership(params: {
  orgId: string;
  linkType: ArtifactLinkType;
  linkTargetId: string;
}): Promise<boolean> {
  const { orgId, linkType, linkTargetId } = params;
  switch (linkType) {
    case "control": {
      const [row] = await db
        .select({ id: controlRecords.id })
        .from(controlRecords)
        .where(
          and(eq(controlRecords.id, linkTargetId), eq(controlRecords.organizationId, orgId))
        )
        .limit(1);
      return Boolean(row);
    }
    case "register_entry": {
      const [row] = await db
        .select({ id: governanceRegisterEntries.id })
        .from(governanceRegisterEntries)
        .innerJoin(boundaries, eq(governanceRegisterEntries.boundaryId, boundaries.id))
        .where(
          and(
            eq(governanceRegisterEntries.id, linkTargetId),
            eq(boundaries.organizationId, orgId)
          )
        )
        .limit(1);
      return Boolean(row);
    }
    case "poam_entry": {
      const [row] = await db
        .select({ id: poamEntries.id })
        .from(poamEntries)
        .where(and(eq(poamEntries.id, linkTargetId), eq(poamEntries.organizationId, orgId)))
        .limit(1);
      return Boolean(row);
    }
    case "poam_milestone": {
      const [row] = await db
        .select({ id: poamEntryMilestones.id })
        .from(poamEntryMilestones)
        .innerJoin(poamEntries, eq(poamEntryMilestones.poamEntryId, poamEntries.id))
        .where(
          and(
            eq(poamEntryMilestones.id, linkTargetId),
            eq(poamEntries.organizationId, orgId)
          )
        )
        .limit(1);
      return Boolean(row);
    }
  }
}

/**
 * GET /api/artifacts/:id/links — list all links for this artifact.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [artifact] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.organizationId, orgId)))
      .limit(1);
    if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const links = await findLinksForArtifact(id);
    return NextResponse.json(links);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * POST /api/artifacts/:id/links
 * Body: { linkType, linkTargetId }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const body = (await req.json()) as {
      linkType?: string;
      linkTargetId?: string;
    };
    if (!body.linkType || !body.linkTargetId) {
      return NextResponse.json(
        { error: "linkType and linkTargetId are required" },
        { status: 400 }
      );
    }
    if (!LINK_TYPES.includes(body.linkType as ArtifactLinkType)) {
      return NextResponse.json({ error: "Invalid linkType" }, { status: 400 });
    }
    const linkType = body.linkType as ArtifactLinkType;

    // Verify the artifact is in this org.
    const [artifact] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.organizationId, orgId)))
      .limit(1);
    if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const targetOk = await verifyTargetOwnership({
      orgId,
      linkType,
      linkTargetId: body.linkTargetId,
    });
    if (!targetOk) {
      return NextResponse.json(
        { error: "Link target not found in this organization" },
        { status: 404 }
      );
    }

    const link = await createArtifactLink({
      orgId,
      artifactId: id,
      linkType,
      linkTargetId: body.linkTargetId,
      userId: user.id,
    });

    return NextResponse.json(link);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/artifacts/:id/links?linkId=...
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const { searchParams } = new URL(req.url);
    const linkId = searchParams.get("linkId");
    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }

    // Verify the link actually belongs to this artifact (cross-check org).
    const [link] = await db
      .select()
      .from(artifactLinks)
      .where(
        and(
          eq(artifactLinks.id, linkId),
          eq(artifactLinks.organizationId, orgId),
          eq(artifactLinks.artifactId, id)
        )
      )
      .limit(1);
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const removed = await deleteArtifactLink({ orgId, linkId });
    return NextResponse.json({ deleted: removed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
