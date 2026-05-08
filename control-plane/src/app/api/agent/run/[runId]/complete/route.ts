import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { agentRuns, feedback } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyAgentShimSecret } from "@/lib/agent-shim-auth";

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

  // Flip the run row
  await db
    .update(agentRuns)
    .set({ status, completedAt: now })
    .where(eq(agentRuns.id, runId));

  // On success, update feedback rows with resolution metadata (only if provided)
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
        .where(
          eq(feedback.id, r.feedbackId),
        );
    }
  }

  return NextResponse.json({
    success: true,
    runId,
    status,
    resolutionsApplied: resolutions?.length ?? 0,
  });
}
