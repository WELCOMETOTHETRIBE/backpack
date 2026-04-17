import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireOrg } from '@/lib/auth'
import { db } from '@/db'
import { feedback, agentRuns, agentRunEvents } from '@/db/schema'
import { eq, and, inArray, gt, asc } from 'drizzle-orm'

// ────────────────────────────────────────────────────────────────────────────
// Incorporate-Feedback Agent — Claude Code Remote Trigger Proxy
//
// This endpoint used to spawn an in-process Anthropic SDK session (costly,
// billed against ANTHROPIC_API_KEY). It now proxies to a Claude Code remote
// trigger, which runs on the user's Claude Code subscription — no API tokens.
//
// The frontend contract is UNCHANGED:
//   POST /api/ai/incorporate-feedback              → { runId }
//   GET  /api/ai/incorporate-feedback?runId&after  → { status, events, lastSeq }
//
// The trigger itself writes agent_run_events rows as it works, so polling
// keeps streaming the same log/thinking/tool/change/commit/done events.
// ────────────────────────────────────────────────────────────────────────────

const TRIGGER_API_BASE = 'https://claude.ai/api/v1/code/triggers'
const TRIGGER_ID = process.env.CLAUDE_CODE_TRIGGER_ID
const CLAUDE_CODE_TOKEN = process.env.CLAUDE_CODE_TOKEN

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

  if (!TRIGGER_ID) {
    return NextResponse.json(
      { error: 'CLAUDE_CODE_TRIGGER_ID env var is not set — agent cannot be invoked' },
      { status: 500 },
    )
  }
  if (!CLAUDE_CODE_TOKEN) {
    return NextResponse.json(
      { error: 'CLAUDE_CODE_TOKEN env var is not set — cannot authenticate to Claude Code' },
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
    message: 'Handing off to Claude Code remote trigger…',
  })

  // Fire the trigger. The trigger prompt receives runId + orgId as input —
  // it uses those to scope its DB queries and to write its own event stream.
  try {
    const triggerRes = await fetch(`${TRIGGER_API_BASE}/${TRIGGER_ID}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLAUDE_CODE_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TrustCodex-FeedbackProxy/1.0',
      },
      body: JSON.stringify({
        input: JSON.stringify({
          runId: run.id,
          orgId,
          feedbackCount: pendingRows.length,
        }),
      }),
    })

    if (!triggerRes.ok) {
      const errBody = await triggerRes.text().catch(() => '')
      await writeEvent(run.id, 2, {
        type: 'error',
        message: `Trigger invocation failed: HTTP ${triggerRes.status} ${errBody.slice(0, 300)}`,
      })
      await db
        .update(agentRuns)
        .set({ status: 'error', completedAt: new Date() })
        .where(eq(agentRuns.id, run.id))
      return NextResponse.json(
        { error: `Failed to invoke Claude Code trigger (HTTP ${triggerRes.status})`, runId: run.id },
        { status: 502 },
      )
    }

    await writeEvent(run.id, 2, {
      type: 'log',
      message: 'Trigger accepted — agent starting up…',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error invoking trigger'
    await writeEvent(run.id, 2, { type: 'error', message: `Trigger unreachable: ${msg}` })
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
