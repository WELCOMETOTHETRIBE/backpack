import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controls, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

/**
 * GET /api/ssp/document — full SSP in Markdown, including org metadata and all 110 control narratives.
 *
 * ?format=md  (default) → text/markdown download
 * ?format=inline        → text/markdown, Content-Disposition: inline (preview)
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") ?? "md";

    const [org, records] = await Promise.all([
      db
        .select({
          name: organizations.name,
          systemName: organizations.systemName,
          systemDescription: organizations.systemDescription,
          authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
          systemOwnerName: organizations.systemOwnerName,
          systemOwnerEmail: organizations.systemOwnerEmail,
          issoName: organizations.issoName,
          issoEmail: organizations.issoEmail,
          boundaryNarrative: organizations.boundaryNarrative,
          cuiCategories: organizations.cuiCategories,
          externalServiceProviders: organizations.externalServiceProviders,
          boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1),

      db
        .select({
          controlId: controlRecords.controlId,
          title: controls.title,
          governanceNarrative: controlRecords.governanceNarrative,
          technicalNarrative: controlRecords.technicalNarrative,
          implementationStatus: controlRecords.implementationStatus,
        })
        .from(controlRecords)
        .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
        .where(eq(controlRecords.organizationId, orgId)),
    ]);

    const orgMeta = org[0];
    const byId: Record<string, (typeof records)[0]> = {};
    for (const r of records) byId[r.controlId] = r;

    type ExtProvider = { name: string; serviceType: string; inheritedControls: string[]; website?: string };
    const providers = (orgMeta?.externalServiceProviders ?? []) as ExtProvider[];
    const cuiCategories = (orgMeta?.cuiCategories ?? []) as string[];

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const authoredCount = records.filter((r) => r.governanceNarrative || r.technicalNarrative).length;

    const lines: string[] = [
      "# System Security Plan",
      `## NIST SP 800-171 Rev 2 — CMMC Level 2`,
      "",
      `**Document Date:** ${today}`,
      `**Organization:** ${orgMeta?.name ?? "—"}`,
      `**System Name:** ${orgMeta?.systemName ?? "—"}`,
      `**Completion:** ${authoredCount} / ${ALL_CONTROL_IDS.length} controls with narratives`,
      "",
      "---",
      "",
      "## Part I — System Identification",
      "",
      `**Organization Name:** ${orgMeta?.name ?? "—"}`,
      `**System Name:** ${orgMeta?.systemName ?? "—"}`,
      "",
      orgMeta?.systemDescription
        ? `**System Description:**\n\n${orgMeta.systemDescription}\n`
        : "**System Description:** *Not yet authored.*\n",
      "",
      "## Part II — Personnel",
      "",
      `**System Owner:** ${orgMeta?.systemOwnerName ?? "—"}${orgMeta?.systemOwnerEmail ? ` <${orgMeta.systemOwnerEmail}>` : ""}`,
      `**ISSO:** ${orgMeta?.issoName ?? "—"}${orgMeta?.issoEmail ? ` <${orgMeta.issoEmail}>` : ""}`,
      "",
      "## Part III — Authorization Boundary",
      "",
      orgMeta?.authorizationBoundaryStatement
        ? `**Authorization Boundary Statement:**\n\n${orgMeta.authorizationBoundaryStatement}\n`
        : "**Authorization Boundary Statement:** *Not yet authored. Complete boundary scoping wizard.*\n",
      "",
      orgMeta?.boundaryNarrative
        ? `**Network & Boundary Narrative:**\n\n${orgMeta.boundaryNarrative}\n`
        : "",
    ];

    if (cuiCategories.length > 0) {
      lines.push("## Part IV — CUI Categories In Scope");
      lines.push("");
      for (const cat of cuiCategories) lines.push(`- ${cat}`);
      lines.push("");
    }

    if (providers.length > 0) {
      lines.push("## Part V — External Service Providers");
      lines.push("");
      for (const p of providers) {
        lines.push(`### ${p.name}`);
        lines.push(`- **Service type:** ${p.serviceType}`);
        if (p.website) lines.push(`- **Website:** ${p.website}`);
        if (p.inheritedControls.length > 0)
          lines.push(`- **Inherited controls:** ${p.inheritedControls.join(", ")}`);
        lines.push("");
      }
    }

    lines.push("## Part VI — Control Implementation Statements");
    lines.push("");
    lines.push(
      "The following statements document how this organization implements each NIST SP 800-171 Rev 2 requirement."
    );
    lines.push("");
    lines.push("---");
    lines.push("");

    for (const controlId of ALL_CONTROL_IDS) {
      const r = byId[controlId];
      const title = r?.title ?? controlId;
      const gov = r?.governanceNarrative?.trim() ?? "";
      const tech = r?.technicalNarrative?.trim() ?? "";
      const status = r?.implementationStatus ?? "not_started";

      lines.push(`### ${controlId} — ${title}`);
      lines.push("");
      lines.push(`**Implementation Status:** ${status.replace(/_/g, " ")}`);
      lines.push("");

      if (gov) {
        lines.push("**Policy / Governance Statement:**");
        lines.push("");
        lines.push(gov);
        lines.push("");
      }
      if (tech) {
        lines.push("**Technical Implementation:**");
        lines.push("");
        lines.push(tech);
        lines.push("");
      }
      if (!gov && !tech) {
        lines.push("*Implementation statement not yet authored.*");
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }

    const markdown = lines.join("\n");
    const disposition =
      format === "inline"
        ? 'inline; filename="SSP_Document.md"'
        : `attachment; filename="SSP_${(orgMeta?.systemName ?? orgMeta?.name ?? "Document").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.md"`;

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": disposition,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
