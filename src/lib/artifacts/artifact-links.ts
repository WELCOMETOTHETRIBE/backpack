import { db } from "@/db";
import { artifactLinks, artifacts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type ArtifactLinkType =
  | "control"
  | "register_entry"
  | "poam_entry"
  | "poam_milestone";

export type ArtifactLinkRow = typeof artifactLinks.$inferSelect;

/**
 * Idempotently create an artifact link. If a link already exists for
 * (artifactId, linkType, linkTargetId), returns the existing row.
 *
 * Scope: caller is responsible for verifying the artifact and the target both
 * belong to `orgId` before calling this helper — this helper only guarantees
 * the link row is tagged with the correct organizationId.
 */
export async function createArtifactLink(params: {
  orgId: string;
  artifactId: string;
  linkType: ArtifactLinkType;
  linkTargetId: string;
  userId?: string | null;
}): Promise<ArtifactLinkRow> {
  const { orgId, artifactId, linkType, linkTargetId, userId } = params;

  // Uses ON CONFLICT against the (artifact_id, link_type, link_target_id)
  // unique index to stay idempotent under races.
  const [inserted] = await db
    .insert(artifactLinks)
    .values({
      organizationId: orgId,
      artifactId,
      linkType,
      linkTargetId,
      createdBy: userId ?? null,
    })
    .onConflictDoNothing({
      target: [artifactLinks.artifactId, artifactLinks.linkType, artifactLinks.linkTargetId],
    })
    .returning();

  if (inserted) return inserted;

  // Conflict hit — fetch the existing row so callers have a stable return.
  const [existing] = await db
    .select()
    .from(artifactLinks)
    .where(
      and(
        eq(artifactLinks.artifactId, artifactId),
        eq(artifactLinks.linkType, linkType),
        eq(artifactLinks.linkTargetId, linkTargetId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error("Failed to create or locate artifact link");
  }
  return existing;
}

/** All links pointing from a single artifact. */
export async function findLinksForArtifact(artifactId: string): Promise<ArtifactLinkRow[]> {
  return db
    .select()
    .from(artifactLinks)
    .where(eq(artifactLinks.artifactId, artifactId));
}

/** All artifacts satisfying a given target (control / register entry / POAM / milestone). */
export async function findArtifactsForTarget(params: {
  orgId: string;
  linkType: ArtifactLinkType;
  linkTargetId: string;
}) {
  const { orgId, linkType, linkTargetId } = params;
  return db
    .select({
      artifact: artifacts,
      link: artifactLinks,
    })
    .from(artifactLinks)
    .innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
    .where(
      and(
        eq(artifactLinks.organizationId, orgId),
        eq(artifactLinks.linkType, linkType),
        eq(artifactLinks.linkTargetId, linkTargetId)
      )
    );
}

/** Delete a link by its id (scoped to org). Returns true if a row was removed. */
export async function deleteArtifactLink(params: {
  orgId: string;
  linkId: string;
}): Promise<boolean> {
  const { orgId, linkId } = params;
  const result = await db
    .delete(artifactLinks)
    .where(
      and(eq(artifactLinks.id, linkId), eq(artifactLinks.organizationId, orgId))
    )
    .returning({ id: artifactLinks.id });
  return result.length > 0;
}

/**
 * Count links per artifact, grouped by linkType. Returns a map of
 * artifactId -> { control, register_entry, poam_entry, poam_milestone }.
 * Used by the Artifacts library page to render badge counts.
 */
export async function countLinksForArtifacts(
  orgId: string,
  artifactIds: string[]
): Promise<Map<string, Record<ArtifactLinkType, number>>> {
  if (artifactIds.length === 0) return new Map();

  const rows = await db
    .select({
      artifactId: artifactLinks.artifactId,
      linkType: artifactLinks.linkType,
      count: sql<number>`count(*)::int`,
    })
    .from(artifactLinks)
    .where(
      and(
        eq(artifactLinks.organizationId, orgId),
        sql`${artifactLinks.artifactId} = ANY(${sql.raw(`ARRAY[${artifactIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`
      )
    )
    .groupBy(artifactLinks.artifactId, artifactLinks.linkType);

  const out = new Map<string, Record<ArtifactLinkType, number>>();
  for (const id of artifactIds) {
    out.set(id, {
      control: 0,
      register_entry: 0,
      poam_entry: 0,
      poam_milestone: 0,
    });
  }
  for (const r of rows) {
    const entry = out.get(r.artifactId);
    if (entry) entry[r.linkType as ArtifactLinkType] = Number(r.count);
  }
  return out;
}
