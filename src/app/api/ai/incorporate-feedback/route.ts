import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireOrg } from '@/lib/auth'
import { db } from '@/db'
import { feedback, agentRuns, agentRunEvents } from '@/db/schema'
import { eq, and, inArray, gt, asc } from 'drizzle-orm'

// ────────────────────────────────────────────────────────────────────────────
// Incorporate-Feedback Agent — Claude Code Routine Proxy
//
// This endpoint used to spawn an in-process Anthropic SDK session (costly,
// billed against ANTHROPIC_API_KEY). It now fires a Claude Code Routine, which
// runs on the user's Claude Code subscription — no API tokens consumed.
//
// API reference: https://code.claude.com/docs/en/routines
// Endpoint:      POST https://api.anthropic.com/v1/claude_code/routines/{id}/fire
// Body:          { "text": "<freeform run context>" }  — routine receives as string
// Auth:          Bearer <routine-scoped sk-ant-oat01 token>
// Beta header:   anthropic-beta: experimental-cc-routine-2026-04-01
//
// The frontend contract is UNCHANGED:
//   POST /api/ai/incorporate-feedback              → { runId }
//   GET  /api/ai/incorporate-feedback?runId&after  → { status, events, lastSeq }
//
// The routine itself writes agent_run_events rows as it works, so polling
// keeps streaming the same log/thinking/tool/change/commit/done events.
// ────────────────────────────────────────────────────────────────────────────

const ROUTINE_API_BASE = 'https://api.anthropic.com/v1/claude_code/routines'
const ROUTINE_BETA_HEADER = 'experimental-cc-routine-2026-04-01'
const ROUTINE_ID = process.env.CLAUDE_CODE_ROUTINE_ID
const ROUTINE_TOKEN = process.env.CLAUDE_CODE_ROUTINE_TOKEN

// ── Event writer ──────────────────────────────────────────────────────────────

async function writeEvent(runId: string, seq: number, payload: Record<string, unknown>) {
  await db.insert(agentRunEvents).values({ runId, seq, payload })
}

// ── POST — kick off a remote trigger run ──────────────────────────────────────

export async function POST() {
  try {
    await requireRole(['Admin'])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let orgId: string
  try {
    orgId = await requireOrg()
  } catch {
    return NextResponse.json({ error: 'No organization context' }, { status: 401 })
  }

  if (!ROUTINE_ID) {
    return NextResponse.json(
      { error: 'CLAUDE_CODE_ROUTINE_ID env var is not set — agent cannot be invoked' },
      { status: 500 },
    )
  }
  if (!ROUTINE_TOKEN) {
    return NextResponse.json(
      { error: 'CLAUDE_CODE_ROUTINE_TOKEN env var is not set — cannot authenticate to Claude Code' },
      { status: 500 },
    )
  }

  // Count pending feedback up-front so we fail fast before burning a trigger run
  const pendingRows = await db
    .select({ id: feedback.id })
    .from(feedback)
    .where(and(eq(feedback.organizationId, orgId), inArray(feedback.status, ['pending', 'reviewed'])))

  if (pendingRows.length === 0) {
    return NextResponse.json({ error: 'No pending or reviewed feedback to incorporate.' }, { status: 400 })
  }

  // Create the run record — trigger will write events against this ID and
  // flip the status to done/error when it finishes.
  const [run] = await db.insert(agentRuns).values({ organizationId: orgId }).returning()

  // Seed the first two events so the UI has something to render immediately.
  await writeEvent(run.id, 0, {
    type: 'log',
    message: `Queued — ${pendingRows.length} feedback item(s) pending.`,
  })
  await writeEvent(run.id, 1, {
    type: 'log',
    message: 'Handing off to Claude Code routine…',
  })

  // Fire the routine. Routines take freeform `text`, so we stringify the
  // context. The routine uses the HTTPS shim (since cloud sandbox blocks
  // direct TCP to Railway Postgres) — we pass the runId and the shim base
  // URL; the routine gets orgId + feedback by calling GET /api/agent/run/:runId.
  //
  // AGENT_SHIM_BASE_URL takes precedence over NEXTAUTH_URL so we can point
  // the routine at whichever hostname is on its sandbox allowed_hosts list
  // (e.g. cmmc-production.up.railway.app) without breaking Clerk's session
  // cookies, which are pinned to the public hostname via NEXTAUTH_URL.
  const shimBase =
    process.env.AGENT_SHIM_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    'https://cmmc-production.up.railway.app'
  const contextText = [
    `# Incorporate Feedback — Run Context`,
    ``,
    `runId: ${run.id}`,
    `apiBase: ${shimBase}`,
    `feedbackCount: ${pendingRows.length}`,
    ``,
    `Use the HTTPS shim at apiBase (sandbox blocks direct Postgres TCP):`,
    `  GET  ${shimBase}/api/agent/run/${run.id}              → { orgId, feedback[] }`,
    `  POST ${shimBase}/api/agent/run/${run.id}/events       → append progress event`,
    `  POST ${shimBase}/api/agent/run/${run.id}/complete     → mark done/error + resolutions`,
    ``,
    `Every call must send header: x-agent-secret: $AGENT_SHIM_SECRET (from cloud env).`,
    ``,
    `## Git workflow — STRICT, READ TWICE`,
    ``,
    `The Anthropic Claude Code sandbox creates a working branch by default`,
    `(e.g. claude/gifted-noether-XXXX). DO NOT use it. Every "fix" you commit`,
    `MUST land on origin/main or it will not deploy — Railway only watches main.`,
    ``,
    `Run these commands EXACTLY, in order, before making any edits:`,
    ``,
    `  git config user.name  "Trust Codex Agent"`,
    `  git config user.email "agent@trustcodex.ai"`,
    `  git checkout main                       # leave the sandbox branch`,
    `  git branch --set-upstream-to=origin/main main 2>/dev/null || true`,
    `  git pull --rebase origin main           # start from latest`,
    ``,
    `Then make your edits, then:`,
    ``,
    `  git add <files>`,
    `  git commit -m "Agent: incorporate N feedback item(s)" -m "<details>"`,
    `  git pull --rebase origin main           # in case main moved while you worked`,
    `  git push origin main                    # EXPLICIT branch — never bare "git push"`,
    ``,
    `Forbidden:`,
    `  - "git push" with no refspec (it pushes the current branch, which may be claude/*)`,
    `  - "git push origin HEAD"            (same problem if HEAD isn't on main)`,
    `  - "git push --force" / --force-with-lease`,
    `  - "git checkout -b ..."             (you must NEVER create a branch)`,
    `  - opening a pull request`,
    ``,
    `Verify before /complete:`,
    ``,
    `  git rev-parse HEAD                  # capture this SHA`,
    `  git fetch origin main`,
    `  git merge-base --is-ancestor HEAD origin/main && echo OK || echo NOT-ON-MAIN`,
    ``,
    `If "NOT-ON-MAIN", do NOT call /complete with status='done'. Call`,
    `/complete with status='error' and a clear message. The /complete endpoint`,
    `now verifies via GitHub API that the commit SHA is reachable from main`,
    `before flipping any feedback row to 'resolved' — if you lie, the call`,
    `will be rejected with HTTP 422 and the run marked 'error'.`,
    ``,
    `Why this matters: feedback rows used to be marked resolved with a`,
    `commit SHA that lived only on a sandbox branch. The dashboard showed`,
    `"resolved" but Railway never deployed the fix. We're done with that.`,
  ].join('\n')

  try {
    const routineRes = await fetch(`${ROUTINE_API_BASE}/${ROUTINE_ID}/fire`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ROUTINE_TOKEN}`,
        'Content-Type': 'application/json',
        'anthropic-beta': ROUTINE_BETA_HEADER,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'TrustCodex-FeedbackProxy/1.0',
      },
      body: JSON.stringify({ text: contextText }),
    })

    if (!routineRes.ok) {
      const errBody = await routineRes.text().catch(() => '')
      await writeEvent(run.id, 2, {
        type: 'error',
        message: `Routine invocation failed: HTTP ${routineRes.status} ${errBody.slice(0, 300)}`,
      })
      await db
        .update(agentRuns)
        .set({ status: 'error', completedAt: new Date() })
        .where(eq(agentRuns.id, run.id))
      return NextResponse.json(
        { error: `Failed to fire Claude Code routine (HTTP ${routineRes.status})`, runId: run.id },
        { status: 502 },
      )
    }

    // The fire endpoint returns { claude_code_session_id, claude_code_session_url }
    // Surface the session URL to the UI for "view full run" linking.
    const fireData = (await routineRes.json().catch(() => ({}))) as {
      claude_code_session_id?: string
      claude_code_session_url?: string
    }

    await writeEvent(run.id, 2, {
      type: 'log',
      message: fireData.claude_code_session_url
        ? `Routine accepted — session: ${fireData.claude_code_session_url}`
        : 'Routine accepted — agent starting up…',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error invoking routine'
    await writeEvent(run.id, 2, { type: 'error', message: `Routine unreachable: ${msg}` })
    await db
      .update(agentRuns)
      .set({ status: 'error', completedAt: new Date() })
      .where(eq(agentRuns.id, run.id))
    return NextResponse.json({ error: msg, runId: run.id }, { status: 502 })
  }

  return NextResponse.json({ runId: run.id, feedbackCount: pendingRows.length }, { status: 202 })
}

// ── GET — poll for events (unchanged contract) ────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireRole(['Admin'])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')
  const after = parseInt(searchParams.get('after') ?? '0', 10)

  if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 })

  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const events = await db
    .select()
    .from(agentRunEvents)
    .where(and(eq(agentRunEvents.runId, runId), gt(agentRunEvents.seq, after)))
    .orderBy(asc(agentRunEvents.seq))
    .limit(100)

  return NextResponse.json({
    status: run.status,
    events: events.map((e) => ({ seq: e.seq, ...(e.payload as Record<string, unknown>) })),
    lastSeq: events.length > 0 ? events[events.length - 1].seq : after,
  })
}
