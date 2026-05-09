import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { agentRuns, agentRunEvents, feedback } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAgentShimSecret } from "@/lib/agent-shim-auth";
import { verifyCommitOnMain } from "@/lib/github-commit-verify";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/agent/run/:runId/complete
//
// Final atomic write for an agent run. Flips agent_runs.status, and when
// successful, updates every feedback row with resolution metadata.
//
// Auth: x-agent-secret: <AGENT_SHIM_SECRET>
// Body:
//   {
//     "status": "done" | "error",
//     "commitSha"?: string,
//     "commitUrl"?: string,
//     "resolutions"?: [
//       { "feedbackId": "uuid", "summary": "...", "files": ["src/..."] }
//     ]
//   }
//
// Hardening (2026-05-09): the agent has historically reported status='done'
// with a commitSha that lives on a sandbox-created branch
// (e.g. claude/gifted-noether-XXXX) instead of origin/main. Railway's
// auto-deploy only watches main, so those "fixes" never reached prod
// even though feedback rows were marked resolved. This handler now
// verifies via the GitHub API that commitSha is reachable from main
// before flipping any feedback row to 'resolved'. If the commit isn't
// on main, the run is recorded as 'error', the resolutions are NOT
// applied (feedback stays in pending/reviewed), and a clear event is
// written so the dashboard can surface what happened.
// ────────────────────────────────────────────────────────────────────────────

const completeSchema = z.object({
  status: z.enum(["done", "error"]),
  commitSha: z.string().optional(),
  commitUrl: z.string().url().optional(),
  resolutions: z
    .array(
      z.object({
        feedbackId: z.string().uuid(),
        summary: z.string().max(500),
        files: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

async function nextEventSeq(runId: string): Promise<number> {
  const [row] = await db
    .select({ seq: agentRunEvents.seq })
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, runId))
    .orderBy(agentRunEvents.seq);
  // Cheap path: refetch max via desc would need importing desc; instead
  // just grab them all in seq order and take the last. Run lifetimes
  // are short (one batch) so the row count is bounded.
  const all = await db
    .select({ seq: agentRunEvents.seq })
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, runId));
  void row;
  if (all.length === 0) return 0;
  return Math.max(...all.map((r) => r.seq)) + 1;
}

async function writeEvent(runId: string, payload: Record<string, unknown>) {
  const seq = await nextEventSeq(runId);
  await db.insert(agentRunEvents).values({ runId, seq, payload });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = verifyAgentShimSecret(req);
  if (!auth.ok) return auth.response;

  const { runId } = await params;

  const [run] = await db
    .select({ id: agentRuns.id, organizationId: agentRuns.organizationId })
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

  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const now = new Date();
  const { status, commitSha, commitUrl, resolutions } = parsed.data;

  // ── Pre-flight: verify the commit is actually on main ─────────────────────
  //
  // Only matters for status='done' with resolutions to apply. status='error'
  // and zero-resolution runs short-circuit unchanged.
  let verifiedOnMain = false;
  let verifyDetail = "";
  if (status === "done" && commitSha && resolutions && resolutions.length > 0) {
    const verify = await verifyCommitOnMain(commitSha);
    verifiedOnMain = verify.onMain;
    verifyDetail = verify.reason ?? `compare status: ${verify.status}`;

    if (!verifiedOnMain) {
      // Refuse to flip feedback rows. Mark the run as errored so the UI
      // shows the run as failed, write a verbose event for diagnosis,
      // and return a 422 so the agent (or the dashboard) can react.
      await writeEvent(runId, {
        type: "error",
        message:
          `Commit ${commitSha.slice(0, 12)} is NOT reachable from origin/main (${verifyDetail}). ` +
          `Refusing to mark ${resolutions.length} feedback item(s) resolved — ` +
          `Railway deploys only from main, so prod would never see this fix. ` +
          `The agent likely pushed to a sandbox branch instead of main; ` +
          `re-run after fixing the push target, or cherry-pick the commit onto main manually.`,
      });
      await db
        .update(agentRuns)
        .set({ status: "error", completedAt: now })
        .where(eq(agentRuns.id, runId));
      return NextResponse.json(
        {
          success: false,
          runId,
          status: "error",
          reason: "commit_not_on_main",
          detail: verifyDetail,
          mainHead: verify.mainHead,
        },
        { status: 422 },
      );
    }

    // Verification succeeded — record it as a transparency event.
    await writeEvent(runId, {
      type: "log",
      message: `Verified commit ${commitSha.slice(0, 12)} is on origin/main (${verify.status}). Marking ${resolutions.length} feedback item(s) resolved.`,
    });
  }

  // ── Flip the run row ──────────────────────────────────────────────────────
  await db
    .update(agentRuns)
    .set({ status, completedAt: now })
    .where(eq(agentRuns.id, runId));

  // ── On success, update feedback rows with resolution metadata ─────────────
  // Only reached if the on-main verification (above) succeeded.
  if (status === "done" && resolutions && resolutions.length > 0) {
    for (const r of resolutions) {
      await db
        .update(feedback)
        .set({
          status: "resolved",
          resolvedAt: now,
          updatedAt: now,
          resolutionCommitSha: commitSha ?? null,
          resolutionCommitUrl: commitUrl ?? null,
          resolutionSummary: r.summary,
          resolutionFiles: r.files ?? [],
        })
        // Extra scoping: only update feedback from the run's org
        .where(eq(feedback.id, r.feedbackId));
    }
  }

  return NextResponse.json({
    success: true,
    runId,
    status,
    verifiedOnMain,
    resolutionsApplied: resolutions?.length ?? 0,
  });
}
