import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agentRuns, feedback, users } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { verifyAgentShimSecret } from "@/lib/agent-shim-auth";

// ────────────────────────────────────────────────────────────────────────────
// GET /api/agent/run/:runId
//
// Used by the Claude Code incorporate-feedback routine to load its context
// over HTTPS (the sandbox blocks direct Postgres TCP).
//
// Auth: x-agent-secret: <AGENT_SHIM_SECRET>
// Returns: { runId, orgId, feedback: [...] }
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = verifyAgentShimSecret(req);
  if (!auth.ok) return auth.response;

  const { runId } = await params;

  const [run] = await db
    .select({ id: agentRuns.id, organizationId: agentRuns.organizationId, status: agentRuns.status })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: feedback.id,
      content: feedback.content,
      category: feedback.category,
      status: feedback.status,
      pageUrl: feedback.pageUrl,
      elementSelector: feedback.elementSelector,
      elementText: feedback.elementText,
      elementType: feedback.elementType,
      createdAt: feedback.createdAt,
      submittedBy: users.name,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(
      and(
        eq(feedback.organizationId, run.organizationId),
        inArray(feedback.status, ["pending", "reviewed"]),
      ),
    )
    .orderBy(asc(feedback.createdAt));

  return NextResponse.json({
    runId: run.id,
    orgId: run.organizationId,
    runStatus: run.status,
    feedback: rows,
  });
}
