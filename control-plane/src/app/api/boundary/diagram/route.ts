import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import type { BoundaryInput } from "@/boundary-engine";
import { generateDiagramSpec } from "@/lib/boundary-diagram/generateSpec";
import { renderMermaid } from "@/lib/boundary-diagram/renderMermaid";
import type { DiagramMode } from "@/lib/boundary-diagram/types";

function normalizeEnvironmentKey(environment: string | undefined): "government" | "commercial" {
  const env = (environment ?? "").toLowerCase();
  if (env.includes("gov") || env.includes("government")) return "government";
  return "commercial";
}

function buildDiagramResponse(
  boundary: BoundaryInput,
  mode: DiagramMode,
  overlay: boolean
): { spec: ReturnType<typeof generateDiagramSpec>; mermaid: string } {
  const environment = normalizeEnvironmentKey(boundary.environment);
  const spec = generateDiagramSpec({
    boundary,
    environment,
    mode,
    overlay,
  });
  const mermaid = renderMermaid(spec);
  return { spec, mermaid };
}

/**
 * GET /api/boundary/diagram?mode=executive|assessor
 * Returns diagram spec and Mermaid source from the account's BoundaryInput.
 * Client renders with mermaid package (no server-side SVG).
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(request.url);
    const modeParam = searchParams.get("mode") ?? "executive";
    const mode: DiagramMode =
      modeParam === "assessor" ? "assessor" : "executive";
    const overlay = searchParams.get("overlay") === "on";
    const [row] = await db
      .select({ boundaryInputJson: accountBoundary.boundaryInputJson })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, orgId))
      .limit(1);

    if (!row) {
      return NextResponse.json({
        spec: null,
        mermaid: "",
        error: "No boundary defined",
      });
    }

    const boundary = row.boundaryInputJson as unknown as BoundaryInput;
    const { spec, mermaid } = buildDiagramResponse(boundary, mode, overlay);

    return NextResponse.json({ spec, mermaid });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get diagram";
    const status = e instanceof Error && "code" in e ? 400 : 401;
    return NextResponse.json({ error: message, spec: null, mermaid: "" }, { status });
  }
}

/**
 * POST /api/boundary/diagram
 * Body: { boundary?: BoundaryInput, mode?: "executive"|"assessor", overlay?: boolean }
 * Returns diagram for the provided boundary (e.g. preset or modified). If boundary is omitted, uses account boundary.
 * Allows building full-stack diagram from preset or custom boundary without saving.
 */
export async function POST(request: NextRequest) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await request.json().catch(() => ({}));
    const mode: DiagramMode =
      body.mode === "assessor" ? "assessor" : "executive";
    const overlay = body.overlay === true;

    let boundary: BoundaryInput;
    if (body.boundary && typeof body.boundary === "object") {
      boundary = body.boundary as BoundaryInput;
    } else {
      const [row] = await db
        .select({ boundaryInputJson: accountBoundary.boundaryInputJson })
        .from(accountBoundary)
        .where(eq(accountBoundary.accountId, orgId))
        .limit(1);
      if (!row) {
        return NextResponse.json({
          spec: null,
          mermaid: "",
          error: "No boundary defined",
        });
      }
      boundary = row.boundaryInputJson as unknown as BoundaryInput;
    }

    const { spec, mermaid } = buildDiagramResponse(boundary, mode, overlay);
    return NextResponse.json({ spec, mermaid });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get diagram";
    const status = e instanceof Error && "code" in e ? 400 : 401;
    return NextResponse.json({ error: message, spec: null, mermaid: "" }, { status });
  }
}
