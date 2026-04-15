import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireRole, requireOrg } from '@/lib/auth'
import { db } from '@/db'
import { feedback, users, agentRuns, agentRunEvents } from '@/db/schema'
import { eq, and, inArray, gt, asc } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = process.cwd()

const ALLOWED_WRITE_PREFIXES = ['src/']
const BLOCKED_WRITE_FRAGMENTS = [
  '.env', 'secret', 'credential', '/api/auth', 'middleware.ts',
  'drizzle/', '/db/schema',
]

// ── GitHub API ────────────────────────────────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO || 'WELCOMETOTHETRIBE/CMMC'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'

async function githubRequest(endpoint: string, method = 'GET', body?: unknown) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'TrustCodex-Agent/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub API ${res.status} on ${endpoint}: ${err.slice(0, 300)}`)
  }
  return res.json()
}

async function commitStagedFiles(stagedFiles: Map<string, string>, commitMessage: string) {
  const ref = await githubRequest(`/git/refs/heads/${GITHUB_BRANCH}`)
  const headSha: string = ref.object.sha
  const commitObj = await githubRequest(`/git/commits/${headSha}`)
  const treeSha: string = commitObj.tree.sha

  const treeItems: { path: string; mode: string; type: string; sha: string }[] = []
  for (const [filePath, content] of stagedFiles) {
    const blob = await githubRequest('/git/blobs', 'POST', {
      content: Buffer.from(content, 'utf-8').toString('base64'),
      encoding: 'base64',
    })
    treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha })
  }

  const newTree = await githubRequest('/git/trees', 'POST', { base_tree: treeSha, tree: treeItems })
  const newCommit = await githubRequest('/git/commits', 'POST', {
    message: commitMessage, tree: newTree.sha, parents: [headSha],
    author: { name: 'Trust Codex Agent', email: 'agent@trustcodex.ai', date: new Date().toISOString() },
  })
  await githubRequest(`/git/refs/heads/${GITHUB_BRANCH}`, 'PATCH', { sha: newCommit.sha, force: false })
  return { sha: newCommit.sha as string, url: `https://github.com/${GITHUB_REPO}/commit/${newCommit.sha}` }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the full contents of a source file in the project.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path relative to project root' } },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List files matching a glob pattern.',
    input_schema: {
      type: 'object',
      properties: { pattern: { type: 'string' } },
      required: ['pattern'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a text pattern across source files.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        file_pattern: { type: 'string', description: 'Optional glob, defaults to src/**/*.{ts,tsx}' },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_file',
    description: 'Stage a complete file update for commit. Path must be under src/. Write the FULL updated file content.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string', description: 'Complete new file content' },
      },
      required: ['path', 'content'],
    },
  },
]

// ── Event writer ──────────────────────────────────────────────────────────────

async function writeEvent(runId: string, seq: number, payload: Record<string, unknown>) {
  await db.insert(agentRunEvents).values({ runId, seq, payload })
}

// ── Background agent runner ───────────────────────────────────────────────────

async function runAgent(runId: string, orgId: string, feedbackRows: {
  id: string; content: string; category: string; status: string;
  pageUrl: string | null; elementSelector: string | null;
  elementText: string | null; elementType: string | null;
  createdAt: Date; submittedBy: string | null;
}[]) {
  let seq = 0
  const emit = (payload: Record<string, unknown>) => writeEvent(runId, seq++, payload)

  try {
    await emit({ type: 'log', message: `Loaded ${feedbackRows.length} feedback item(s).` })

    const feedbackBlock = feedbackRows.map((f, i) => {
      const lines = [
        `### [${i + 1}] ${f.category.toUpperCase()} — ${f.status}`,
        `Submitted: ${new Date(f.createdAt).toLocaleDateString()} by ${f.submittedBy ?? 'Anonymous'}`,
        f.pageUrl ? `Page: ${f.pageUrl}` : null,
        f.elementType
          ? `Element: <${f.elementType}>${f.elementText ? ` "${f.elementText.slice(0, 80)}"` : ''} — ${f.elementSelector ?? ''}`
          : null,
        '',
        f.content,
      ]
      return lines.filter(Boolean).join('\n')
    }).join('\n\n---\n\n')

    const stagedFiles = new Map<string, string>()
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `You are a senior full-stack engineer on the Trust Codex team — a CMMC 2.0 compliance SaaS platform.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Drizzle ORM (Postgres) · Lucide React icons · next-auth v5

Your mission: implement the user feedback below into the codebase. You have four tools:
• read_file   — read any project file
• list_files  — glob for files
• search_code — grep across src/
• write_file  — stage a complete file update (writes go into a pending commit)

Workflow:
1. Read relevant files first — understand what's there before touching it.
2. Make targeted, minimal changes that directly address each feedback item.
3. Keep the existing design language: neutral/indigo/emerald palette, rounded-2xl cards, shadow-sm, Tailwind only.
4. Write production TypeScript — no 'any', proper null checks, no TODOs left behind.
5. write_file takes FULL file content (not diffs). Always include the complete updated file.
6. When you have finished all changes, stop using tools and write a brief summary of what you changed.

Hard limits — do NOT write to these files (reading them for reference is fine and encouraged):
• .env files or anything with 'secret'/'credential' in the path
• src/lib/auth.ts or /api/auth routes
• Database migrations (drizzle/ directory) — never write SQL migrations
• src/db/schema.ts — read to understand column names, but never modify it
• middleware.ts

Schema changes: if feedback requires new DB columns, implement the UI/API
using existing columns as best you can, then end your summary with a
"⚠ Schema change needed:" section listing exactly what column/table to add.
The developer will handle the migration separately.`

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Here is the pending user feedback to incorporate:\n\n${feedbackBlock}\n\nPlease work through each item and implement the improvements. Read relevant code first, then apply changes with write_file.`,
      },
    ]

    await emit({ type: 'log', message: 'Agent started — analyzing feedback...' })

    const MAX_TURNS = 24

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      await emit({ type: 'log', message: `Turn ${turn + 1}…` })

      // Streaming so we get thinking tokens as they arrive
      let thinkingBuf = ''
      const stream = client.messages.stream({
        model: 'claude-opus-4-5',
        max_tokens: 16384,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages,
      })

      stream.on('text', (delta) => { thinkingBuf += delta })

      const response = await stream.finalMessage()

      if (thinkingBuf.trim()) {
        await emit({ type: 'thinking', message: thinkingBuf.trim().slice(0, 500) })
      }

      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'end_turn') {
        await emit({ type: 'log', message: 'Agent finished.' })
        break
      }
      if (response.stop_reason !== 'tool_use') break

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        const { name, input, id } = block
        const inp = input as Record<string, string>
        await emit({ type: 'tool', name, path: inp.path ?? inp.pattern ?? inp.query })

        let result = ''
        try {
          switch (name) {
            case 'read_file': {
              const abs = path.resolve(PROJECT_ROOT, inp.path)
              if (!abs.startsWith(PROJECT_ROOT)) { result = 'Error: path traversal blocked'; break }
              if (!fs.existsSync(abs)) { result = `Error: file not found — ${inp.path}`; break }
              const raw = fs.readFileSync(abs, 'utf-8')
              result = raw.length > 60_000 ? raw.slice(0, 60_000) + '\n[…truncated]' : raw
              await emit({ type: 'log', message: `Read ${inp.path} (${raw.length.toLocaleString()} chars)` })
              break
            }
            case 'list_files': {
              const { glob: globFn } = await import('glob')
              const files = await globFn(inp.pattern, { cwd: PROJECT_ROOT, ignore: ['node_modules/**', '.next/**', '.git/**'] })
              result = files.slice(0, 300).join('\n') || '(no matches)'
              await emit({ type: 'log', message: `Globbed "${inp.pattern}" → ${files.length} file(s)` })
              break
            }
            case 'search_code': {
              const { glob: globFn } = await import('glob')
              const filePattern = inp.file_pattern || 'src/**/*.{ts,tsx}'
              const files = await globFn(filePattern, { cwd: PROJECT_ROOT, ignore: ['node_modules/**', '.next/**'] })
              const matches: string[] = []
              for (const f of files) {
                if (matches.length >= 120) break
                try {
                  const src = fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf-8')
                  src.split('\n').forEach((line, idx) => {
                    if (line.toLowerCase().includes(inp.query.toLowerCase()))
                      matches.push(`${f}:${idx + 1}: ${line.trim()}`)
                  })
                } catch { /* skip */ }
              }
              result = matches.join('\n') || 'No matches'
              await emit({ type: 'log', message: `Searched "${inp.query}" → ${matches.length} match(es)` })
              break
            }
            case 'write_file': {
              const isAllowed = ALLOWED_WRITE_PREFIXES.some(p => inp.path.startsWith(p))
              const isBlocked = BLOCKED_WRITE_FRAGMENTS.some(f => inp.path.includes(f))
              if (!isAllowed) { result = `Error: write blocked — path must start with src/ (got ${inp.path})`; break }
              if (isBlocked) { result = `Error: write blocked — ${inp.path} is a protected path`; break }
              stagedFiles.set(inp.path, inp.content)
              await emit({ type: 'change', path: inp.path })
              result = `Staged for commit: ${inp.path}`
              break
            }
            default:
              result = `Unknown tool: ${name}`
          }
        } catch (err) {
          result = `Tool error: ${err instanceof Error ? err.message : String(err)}`
        }

        toolResults.push({ type: 'tool_result', tool_use_id: id, content: result })
      }

      messages.push({ role: 'user', content: toolResults })
    }

    // ── Commit ────────────────────────────────────────────────────────────────
    if (stagedFiles.size === 0) {
      await emit({ type: 'done', changes: 0, message: 'Agent finished with no file changes.' })
      await db.update(agentRuns).set({ status: 'done', completedAt: new Date() }).where(eq(agentRuns.id, runId))
      return
    }

    await emit({ type: 'log', message: `Committing ${stagedFiles.size} file(s) via GitHub API…` })

    const summaryLines = feedbackRows.map(
      f => `- [${f.category}] ${f.content.slice(0, 90)}${f.content.length > 90 ? '…' : ''}`,
    )
    const commitMessage = [
      `Agent: incorporate ${feedbackRows.length} feedback item(s)`,
      '', 'Addresses:', ...summaryLines, '',
      'Co-authored-by: Trust Codex Agent <agent@trustcodex.ai>',
    ].join('\n')

    const { sha, url } = await commitStagedFiles(stagedFiles, commitMessage)

    await db.update(feedback)
      .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
      .where(inArray(feedback.id, feedbackRows.map(f => f.id)))

    await emit({ type: 'commit', sha: sha.slice(0, 7), fullSha: sha, url, changes: stagedFiles.size })
    await emit({ type: 'done', changes: stagedFiles.size, message: `${stagedFiles.size} file(s) committed (${sha.slice(0, 7)}). Railway is redeploying.` })
    await db.update(agentRuns).set({ status: 'done', completedAt: new Date() }).where(eq(agentRuns.id, runId))

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    await writeEvent(runId, seq++, { type: 'error', message })
    await db.update(agentRuns).set({ status: 'error', completedAt: new Date() }).where(eq(agentRuns.id, runId))
  }
}

// ── POST /api/ai/incorporate-feedback — kick off run ─────────────────────────

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

  if (!GITHUB_TOKEN) {
    return NextResponse.json({ error: 'GITHUB_TOKEN env var is not set — cannot push changes' }, { status: 500 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY env var is not set' }, { status: 500 })
  }

  const feedbackRows = await db
    .select({
      id: feedback.id, content: feedback.content, category: feedback.category,
      status: feedback.status, pageUrl: feedback.pageUrl,
      elementSelector: feedback.elementSelector, elementText: feedback.elementText,
      elementType: feedback.elementType, createdAt: feedback.createdAt,
      submittedBy: users.name,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(and(eq(feedback.organizationId, orgId), inArray(feedback.status, ['pending', 'reviewed'])))
    .orderBy(feedback.createdAt)

  if (feedbackRows.length === 0) {
    return NextResponse.json({ error: 'No pending or reviewed feedback to incorporate.' }, { status: 400 })
  }

  // Create the run record
  const [run] = await db.insert(agentRuns).values({ organizationId: orgId }).returning()

  // Fire-and-forget — runs in the background independent of HTTP connection
  runAgent(run.id, orgId, feedbackRows).catch(console.error)

  return NextResponse.json({ runId: run.id, feedbackCount: feedbackRows.length }, { status: 202 })
}

// ── GET /api/ai/incorporate-feedback?runId=&after= — poll for events ──────────

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
    events: events.map(e => ({ seq: e.seq, ...(e.payload as Record<string, unknown>) })),
    lastSeq: events.length > 0 ? events[events.length - 1].seq : after,
  })
}
