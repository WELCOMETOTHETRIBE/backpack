import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { agentRuns, agentRunEvents } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { verifyAgentShimSecret } from "@/lib/agent-shim-auth";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/agent/run/:runId/events
//
// Appends a progress event to agent_run_events. seq auto-increments per run.
// Called by the Claude Code routine over HTTPS as it works.
//
// Auth:  x-agent-secret: <AGENT_SHIM_SECRET>
// Body:  { "type": "log|thinking|tool|change|commit|error|done", ...payload }
//        The payload is stored verbatim in the JSONB column.
// ────────────────────────────────────────────────────────────────────────────

const eventSchema = z
  .object({
    type: z.enum(["log", "thinking", "tool", "change", "commit", "error", "done"]),
  })
  .passthrough();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = verifyAgentShimSecret(req);
  if (!auth.ok) return auth.response;

  const { runId } = await params;

  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid event payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Compute next seq atomically — look up current max and add 1
  const [maxRow] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(${agentRunEvents.seq}), -1)` })
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, runId));

  const nextSeq = (maxRow?.maxSeq ?? -1) + 1;

  await db.insert(agentRunEvents).values({
    runId,
    seq: nextSeq,
    payload: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ seq: nextSeq }, { status: 201 });
}
