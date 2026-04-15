/**
 * Local runner: incorporate-feedback agent
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... GITHUB_TOKEN=ghp_... DATABASE_URL=postgresql://... node scripts/run-feedback-agent.mjs
 *
 * Or use: railway run node scripts/run-feedback-agent.mjs
 */

import Anthropic from '@anthropic-ai/sdk'
import postgres from 'postgres'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL
const ORG_ID = process.env.ORG_ID // optional — fetches all orgs if not set
const GITHUB_REPO = process.env.GITHUB_REPO || 'WELCOMETOTHETRIBE/CMMC'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'

if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is required'); process.exit(1) }
if (!GITHUB_TOKEN)       { console.error('GITHUB_TOKEN is required'); process.exit(1) }
if (!DATABASE_URL)       { console.error('DATABASE_URL or DATABASE_PUBLIC_URL is required'); process.exit(1) }

const ALLOWED_WRITE_PREFIXES = ['src/']
const BLOCKED_PATH_FRAGMENTS = ['.env', 'secret', 'credential', '/api/auth', 'middleware.ts', 'drizzle/', '/db/schema']

// ── DB ────────────────────────────────────────────────────────────────────────

const sql = postgres(DATABASE_URL, { ssl: DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false } })

async function loadFeedback() {
  const rows = await sql`
    SELECT
      f.id,
      f.content,
      f.category,
      f.status,
      f.page_url       AS "pageUrl",
      f.element_selector AS "elementSelector",
      f.element_text   AS "elementText",
      f.element_type   AS "elementType",
      f.created_at     AS "createdAt",
      f.organization_id AS "organizationId",
      u.name           AS "submittedBy"
    FROM feedback f
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.status IN ('pending', 'reviewed')
    ${ORG_ID ? sql`AND f.organization_id = ${ORG_ID}` : sql``}
    ORDER BY f.created_at ASC
    LIMIT 100
  `
  return rows
}

async function markResolved(ids) {
  if (ids.length === 0) return
  const now = new Date()
  for (const id of ids) {
    await sql`
      UPDATE feedback
      SET status = 'resolved', resolved_at = ${now}, updated_at = ${now}
      WHERE id = ${id}::uuid
    `
  }
}

// ── GitHub API ─────────────────────────────────────────────────────────────────

async function githubRequest(endpoint, method = 'GET', body) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'TrustCodex-FeedbackAgent/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub ${res.status} on ${endpoint}: ${err.slice(0, 300)}`)
  }
  return res.json()
}

async function commitStagedFiles(stagedFiles, commitMessage) {
  const ref    = await githubRequest(`/git/refs/heads/${GITHUB_BRANCH}`)
  const headSha = ref.object.sha
  const commit  = await githubRequest(`/git/commits/${headSha}`)
  const treeSha = commit.tree.sha

  const treeItems = []
  for (const [filePath, content] of stagedFiles) {
    log(`  Uploading blob: ${filePath}`)
    const blob = await githubRequest('/git/blobs', 'POST', {
      content: Buffer.from(content, 'utf-8').toString('base64'),
      encoding: 'base64',
    })
    treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha })
  }

  const newTree   = await githubRequest('/git/trees', 'POST', { base_tree: treeSha, tree: treeItems })
  const newCommit = await githubRequest('/git/commits', 'POST', {
    message: commitMessage,
    tree: newTree.sha,
    parents: [headSha],
    author: { name: 'Trust Codex Agent', email: 'agent@trustcodex.ai', date: new Date().toISOString() },
  })
  await githubRequest(`/git/refs/heads/${GITHUB_BRANCH}`, 'PATCH', { sha: newCommit.sha, force: false })

  return { sha: newCommit.sha, url: `https://github.com/${GITHUB_REPO}/commit/${newCommit.sha}` }
}

// ── Logging ────────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[agent] ${msg}`) }

// ── Agent tools ────────────────────────────────────────────────────────────────

const TOOLS = [
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
        file_pattern: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_file',
    description: 'Stage a complete file update for commit. Must be under src/.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string', description: 'Full updated file content' },
      },
      required: ['path', 'content'],
    },
  },
]

async function executeTool(name, input, stagedFiles) {
  const { glob: globFn } = await import('glob')

  if (name === 'read_file') {
    const abs = path.resolve(PROJECT_ROOT, input.path)
    if (!abs.startsWith(PROJECT_ROOT)) return 'Error: path traversal blocked'
    if (!fs.existsSync(abs)) return `Error: file not found — ${input.path}`
    const raw = fs.readFileSync(abs, 'utf-8')
    log(`read_file ${input.path} (${raw.length.toLocaleString()} chars)`)
    return raw.length > 60_000 ? raw.slice(0, 60_000) + '\n[…truncated]' : raw
  }

  if (name === 'list_files') {
    const files = await globFn(input.pattern, {
      cwd: PROJECT_ROOT,
      ignore: ['node_modules/**', '.next/**', '.git/**'],
    })
    log(`list_files "${input.pattern}" → ${files.length} file(s)`)
    return files.slice(0, 300).join('\n') || '(no matches)'
  }

  if (name === 'search_code') {
    const filePattern = input.file_pattern || 'src/**/*.{ts,tsx}'
    const files = await globFn(filePattern, { cwd: PROJECT_ROOT, ignore: ['node_modules/**', '.next/**'] })
    const matches = []
    for (const f of files) {
      if (matches.length >= 120) break
      try {
        const src = fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf-8')
        src.split('\n').forEach((line, idx) => {
          if (line.toLowerCase().includes(input.query.toLowerCase())) {
            matches.push(`${f}:${idx + 1}: ${line.trim()}`)
          }
        })
      } catch { /* skip */ }
    }
    log(`search_code "${input.query}" → ${matches.length} match(es)`)
    return matches.join('\n') || 'No matches'
  }

  if (name === 'write_file') {
    const isAllowed = ALLOWED_WRITE_PREFIXES.some(p => input.path.startsWith(p))
    const isBlocked = BLOCKED_PATH_FRAGMENTS.some(f => input.path.includes(f))
    if (!isAllowed) return `Error: must write to src/ (got ${input.path})`
    if (isBlocked)  return `Error: ${input.path} is a protected path`
    stagedFiles.set(input.path, input.content)
    log(`write_file staged: ${input.path}`)
    return `Staged: ${input.path}`
  }

  return `Unknown tool: ${name}`
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  log('Connecting to database…')
  const feedbackRows = await loadFeedback()

  if (feedbackRows.length === 0) {
    log('No pending/reviewed feedback found. Nothing to do.')
    await sql.end()
    return
  }

  log(`Loaded ${feedbackRows.length} feedback item(s).`)

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

  const stagedFiles = new Map()
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

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

  const messages = [
    {
      role: 'user',
      content: `Here is the pending user feedback to incorporate:\n\n${feedbackBlock}\n\nPlease work through each item and implement the improvements. Read relevant code first, then apply changes with write_file.`,
    },
  ]

  log('Starting Claude agent…')

  const MAX_TURNS = 24

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    log(`Turn ${turn + 1}/${MAX_TURNS}`)

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 16384,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        const preview = block.text.trim().slice(0, 300)
        console.log(`\n[thinking] ${preview}${preview.length === 300 ? '…' : ''}\n`)
      }
    }

    if (response.stop_reason === 'end_turn') {
      log('Agent finished.')
      break
    }

    if (response.stop_reason !== 'tool_use') {
      log(`Unexpected stop_reason: ${response.stop_reason}`)
      break
    }

    const toolResults = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const { name, input, id } = block
      log(`tool: ${name}(${JSON.stringify(input).slice(0, 100)})`)

      let result = ''
      try {
        result = await executeTool(name, input, stagedFiles)
      } catch (err) {
        result = `Tool error: ${err.message}`
      }
      toolResults.push({ type: 'tool_result', tool_use_id: id, content: result })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  if (stagedFiles.size === 0) {
    log('Agent completed with no file changes.')
    await sql.end()
    return
  }

  log(`Staged ${stagedFiles.size} file(s): ${[...stagedFiles.keys()].join(', ')}`)
  log('Committing via GitHub API…')

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
  log(`Committed: ${sha.slice(0, 7)} — ${url}`)

  log('Marking feedback as resolved…')
  await markResolved(feedbackRows.map(f => f.id))

  await sql.end()
  log(`Done. ${stagedFiles.size} file(s) committed. Railway is redeploying.`)
  console.log(`\n✓ Commit: ${url}\n`)
}

main().catch(err => {
  console.error('[error]', err.message)
  process.exit(1)
})
