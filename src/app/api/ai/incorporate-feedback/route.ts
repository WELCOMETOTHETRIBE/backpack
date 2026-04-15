import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireRole, requireOrg } from '@/lib/auth'
import { db } from '@/db'
import { feedback, users } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = process.cwd()

// Only the agent may write to these prefixes
const ALLOWED_WRITE_PREFIXES = ['src/']
// Block sensitive paths regardless
const BLOCKED_PATH_FRAGMENTS = [
  '.env',
  'secret',
  'credential',
  '/api/auth',
  'middleware.ts',
  'drizzle/',
  '/db/schema',
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

async function commitStagedFiles(
  stagedFiles: Map<string, string>,
  commitMessage: string,
): Promise<{ sha: string; url: string }> {
  // 1. Current HEAD SHA
  const ref = await githubRequest(`/git/refs/heads/${GITHUB_BRANCH}`)
  const headSha: string = ref.object.sha

  // 2. Current tree SHA (from the commit object)
  const commitObj = await githubRequest(`/git/commits/${headSha}`)
  const treeSha: string = commitObj.tree.sha

  // 3. Create blobs for each staged file
  const treeItems: { path: string; mode: string; type: string; sha: string }[] = []
  for (const [filePath, content] of stagedFiles) {
    const blob = await githubRequest('/git/blobs', 'POST', {
      content: Buffer.from(content, 'utf-8').toString('base64'),
      encoding: 'base64',
    })
    treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha })
  }

  // 4. New tree
  const newTree = await githubRequest('/git/trees', 'POST', {
    base_tree: treeSha,
    tree: treeItems,
  })

  // 5. New commit
  const newCommit = await githubRequest('/git/commits', 'POST', {
    message: commitMessage,
    tree: newTree.sha,
    parents: [headSha],
    author: {
      name: 'Trust Codex Agent',
      email: 'agent@trustcodex.ai',
      date: new Date().toISOString(),
    },
  })

  // 6. Advance branch ref
  await githubRequest(`/git/refs/heads/${GITHUB_BRANCH}`, 'PATCH', {
    sha: newCommit.sha,
    force: false,
  })

  return {
    sha: newCommit.sha as string,
    url: `https://github.com/${GITHUB_REPO}/commit/${newCommit.sha}`,
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the full contents of a source file in the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to project root, e.g. src/components/ui/Button.tsx',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List files matching a glob pattern in the project.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern e.g. src/components/**/*.tsx',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a text pattern across source files. Returns matching lines with file:line context.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or substring to search for (case-insensitive)' },
        file_pattern: {
          type: 'string',
          description: 'Optional glob to restrict search, e.g. src/**/*.tsx (defaults to all src TS/TSX)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_file',
    description:
      'Stage a complete file change to be committed after the agent finishes. ' +
      'Path must be under src/. Write the FULL updated file content.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to project root (must start with src/)',
        },
        content: { type: 'string', description: 'Complete new file content (not a diff)' },
      },
      required: ['path', 'content'],
    },
  },
]

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST() {
  // Auth guard — Admin only
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
    return NextResponse.json(
      { error: 'GITHUB_TOKEN env var is not set — cannot push changes' },
      { status: 500 },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY env var is not set' },
      { status: 500 },
    )
  }

  // Fetch actionable feedback
  const feedbackRows = await db
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
        eq(feedback.organizationId, orgId),
        inArray(feedback.status, ['pending', 'reviewed']),
      ),
    )
    .orderBy(feedback.createdAt)

  if (feedbackRows.length === 0) {
    return NextResponse.json({ error: 'No pending or reviewed feedback to incorporate.' }, { status: 400 })
  }

  // Build SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      function send(event: Record<string, unknown>) {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      // Keepalive: ping every 15s so Railway's HTTP/2 proxy never sees an idle connection
      const keepalive = setInterval(() => {
        if (closed) { clearInterval(keepalive); return }
        controller.enqueue(encoder.encode(`: keepalive\n\n`))
      }, 15_000)

      try {
        send({ type: 'log', message: `Loaded ${feedbackRows.length} feedback item(s).` })

        // ── Format feedback for prompt ─────────────────────────────────────────
        const feedbackBlock = feedbackRows
          .map((f, i) => {
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
          })
          .join('\n\n---\n\n')

        // ── Staged writes accumulator ──────────────────────────────────────────
        const stagedFiles = new Map<string, string>()

        // ── Anthropic client + agentic loop ────────────────────────────────────
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

Hard limits — do NOT touch:
• .env files or anything with 'secret'/'credential' in the path
• src/lib/auth.ts or /api/auth routes
• Database migrations (drizzle/ directory)
• src/db/schema.ts
• middleware.ts`

        const messages: Anthropic.MessageParam[] = [
          {
            role: 'user',
            content: `Here is the pending user feedback to incorporate:\n\n${feedbackBlock}\n\nPlease work through each item and implement the improvements. Read relevant code first, then apply changes with write_file.`,
          },
        ]

        send({ type: 'log', message: 'Agent started — analyzing feedback...' })

        const MAX_TURNS = 24

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          // Use streaming so tokens flow continuously — prevents Railway HTTP/2
          // idle-timeout from killing the SSE connection during long generations.
          send({ type: 'log', message: `Turn ${turn + 1}…` })

          let thinkingBuf = ''
          const stream = client.messages.stream({
            model: 'claude-opus-4-5',
            max_tokens: 16384,
            system: systemPrompt,
            tools: AGENT_TOOLS,
            messages,
          })

          // Stream text deltas live so the connection stays warm
          stream.on('text', (delta) => {
            thinkingBuf += delta
            // Emit thinking preview every ~120 chars to keep stream alive
            if (thinkingBuf.length % 120 < delta.length) {
              send({ type: 'thinking', message: thinkingBuf.slice(-400) })
            }
          })

          const response = await stream.finalMessage()

          // Append assistant turn
          messages.push({ role: 'assistant', content: response.content })

          if (response.stop_reason === 'end_turn') {
            send({ type: 'log', message: 'Agent finished.' })
            break
          }
          if (response.stop_reason !== 'tool_use') break

          // ── Execute tools ────────────────────────────────────────────────────
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const block of response.content) {
            if (block.type !== 'tool_use') continue

            const { name, input, id } = block
            const inp = input as Record<string, string>
            send({ type: 'tool', name, path: inp.path ?? inp.pattern ?? inp.query })

            let result = ''
            try {
              switch (name) {
                case 'read_file': {
                  const abs = path.resolve(PROJECT_ROOT, inp.path)
                  if (!abs.startsWith(PROJECT_ROOT)) {
                    result = 'Error: path traversal blocked'
                    break
                  }
                  if (!fs.existsSync(abs)) {
                    result = `Error: file not found — ${inp.path}`
                    break
                  }
                  const raw = fs.readFileSync(abs, 'utf-8')
                  result = raw.length > 60_000 ? raw.slice(0, 60_000) + '\n[…truncated]' : raw
                  send({ type: 'log', message: `Read ${inp.path} (${raw.length.toLocaleString()} chars)` })
                  break
                }

                case 'list_files': {
                  const { glob: globFn } = await import('glob')
                  const files = await globFn(inp.pattern, {
                    cwd: PROJECT_ROOT,
                    ignore: ['node_modules/**', '.next/**', '.git/**'],
                  })
                  result = files.slice(0, 300).join('\n') || '(no matches)'
                  send({ type: 'log', message: `Globbed "${inp.pattern}" → ${files.length} file(s)` })
                  break
                }

                case 'search_code': {
                  const { glob: globFn } = await import('glob')
                  const filePattern = inp.file_pattern || 'src/**/*.{ts,tsx}'
                  const files = await globFn(filePattern, {
                    cwd: PROJECT_ROOT,
                    ignore: ['node_modules/**', '.next/**'],
                  })
                  const matches: string[] = []
                  for (const f of files) {
                    if (matches.length >= 120) break
                    try {
                      const src = fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf-8')
                      src.split('\n').forEach((line, idx) => {
                        if (line.toLowerCase().includes(inp.query.toLowerCase())) {
                          matches.push(`${f}:${idx + 1}: ${line.trim()}`)
                        }
                      })
                    } catch { /* skip */ }
                  }
                  result = matches.join('\n') || 'No matches'
                  send({ type: 'log', message: `Searched "${inp.query}" → ${matches.length} match(es)` })
                  break
                }

                case 'write_file': {
                  const isAllowed = ALLOWED_WRITE_PREFIXES.some(p => inp.path.startsWith(p))
                  const isBlocked = BLOCKED_PATH_FRAGMENTS.some(f => inp.path.includes(f))

                  if (!isAllowed) {
                    result = `Error: write blocked — path must start with src/ (got ${inp.path})`
                    break
                  }
                  if (isBlocked) {
                    result = `Error: write blocked — ${inp.path} is a protected path`
                    break
                  }

                  stagedFiles.set(inp.path, inp.content)
                  send({ type: 'change', path: inp.path })
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

        // ── Commit or bail ─────────────────────────────────────────────────────
        if (stagedFiles.size === 0) {
          send({ type: 'done', changes: 0, message: 'Agent finished with no file changes.' })
          closed = true; clearInterval(keepalive); controller.close()
          return
        }

        send({ type: 'log', message: `Committing ${stagedFiles.size} file(s) via GitHub API…` })

        const summaryLines = feedbackRows.map(
          f => `- [${f.category}] ${f.content.slice(0, 90)}${f.content.length > 90 ? '…' : ''}`,
        )
        const commitMessage = [
          `Agent: incorporate ${feedbackRows.length} feedback item(s)`,
          '',
          'Addresses:',
          ...summaryLines,
          '',
          'Co-authored-by: Trust Codex Agent <agent@trustcodex.ai>',
        ].join('\n')

        const { sha, url } = await commitStagedFiles(stagedFiles, commitMessage)

        // Mark feedback resolved
        await db
          .update(feedback)
          .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
          .where(inArray(feedback.id, feedbackRows.map(f => f.id)))

        send({ type: 'commit', sha: sha.slice(0, 7), fullSha: sha, url, changes: stagedFiles.size })
        send({
          type: 'done',
          changes: stagedFiles.size,
          message: `${stagedFiles.size} file(s) committed (${sha.slice(0, 7)}). Railway is redeploying.`,
        })
        closed = true; clearInterval(keepalive); controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error'
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`))
        closed = true; clearInterval(keepalive); controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
