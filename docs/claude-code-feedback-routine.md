# Claude Code Routine — Incorporate Feedback

Setup guide for the **Incorporate Feedback** agent, which runs on your Claude
Code subscription via a [Routine](https://code.claude.com/docs/en/routines)
instead of the direct Anthropic SDK path. Zero API tokens consumed per run.

## Architecture

```
┌─────────────────┐      ┌──────────────────────────┐     ┌──────────────────┐
│  GUI button     │─POST→│ /api/ai/incorporate-fb   │─────│  Claude Code     │
│  (admin only)   │      │  (Next.js route)         │fire │  Routine (cloud) │
│                 │←poll─│                          │     │                  │
└─────────────────┘      └──────────────────────────┘     └──────────────────┘
                                 ▲                                  │
                                 │                                  │ clones repo,
                                 │   writes events, status          │ edits files,
                                 └────────── DB ◀───────────────────┘ commits to main,
                                                                       updates feedback
```

1. Admin clicks **Incorporate Feedback** in the GUI.
2. `/api/ai/incorporate-feedback` POST creates an `agent_runs` row, writes the
   first two log events, then fires the Routine via the `/fire` endpoint with
   runId + orgId packed into the `text` field.
3. The Routine runs as a full Claude Code cloud session: clones the repo,
   queries the Railway DB, processes feedback, commits to `main`, pushes.
4. As it works, it writes `agent_run_events` rows so the GUI's existing poller
   streams log/thinking/tool/change/commit events in real time.

## One-Time Setup

### 1. Create the Routine at claude.ai

Go to **https://claude.ai/code/routines** → **New routine**.

- **Name:** `Incorporate Feedback — Trust Codex`
- **Prompt:** paste the "Routine Prompt" section below
- **Model:** Claude Opus 4.5 (or newest available)
- **Repositories:** add `WELCOMETOTHETRIBE/CMMC`
  - **Enable "Allow unrestricted branch pushes"** — required, because the
    routine pushes to `main`. Without this, it can only push to `claude/*`.
- **Environment:** create or reuse a cloud environment with:
  - **Env var** `DATABASE_URL` = your Railway public DB URL
    (the `gondola.proxy.rlwy.net` one, not the internal one — the cloud
    session won't have access to Railway's private network)
  - **Network access:** full
  - **Setup script:** `npm ci` (or leave empty — the routine can install if it
    needs specific tools)
- **Trigger:** choose **API**, save the routine.
- After save, edit the routine → **API trigger** → **Generate token**. Copy
  both the **routine ID** (format `trig_01...`) and the **token** (format
  `sk-ant-oat01-...`) immediately — the token is shown only once.

### 2. Set Railway env vars

In the Railway dashboard → CMMC service → Variables, add:

```
CLAUDE_CODE_ROUTINE_ID=trig_01...           # from step 1
CLAUDE_CODE_ROUTINE_TOKEN=sk-ant-oat01-...  # from step 1 — set via Railway UI,
                                            # not CLI, to keep it out of shell history
```

Then **remove** `ANTHROPIC_API_KEY` — no longer needed for feedback.

### 3. Verify

Click the button in the GUI. The log drawer should show:

```
Queued — N feedback item(s) pending.
Handing off to Claude Code routine…
Routine accepted — session: https://claude.ai/code/session_01...
[routine-emitted events from here on]
```

Clicking the session URL opens the live Claude Code session in a browser so
you can watch the run end-to-end.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `HTTP 401` on fire | Token wrong or revoked | Regenerate token in routine settings |
| `HTTP 404` on fire | Wrong `CLAUDE_CODE_ROUTINE_ID` | Copy the `trig_` ID exactly from the routine URL |
| Routine runs but can't push | Unrestricted push not enabled | Edit routine → repo → toggle on |
| Routine runs but no DB events | Wrong `DATABASE_URL` on cloud env | Use public URL (`gondola.proxy.rlwy.net`), not `railway.internal` |
| Routine fails on `psql` | Tool not installed in cloud env | Add `apt-get install -y postgresql-client` to setup script |
| Daily cap exceeded | Hit routine run limit | Enable extra usage in Settings > Billing, or wait for window reset |

---

## Routine Prompt

Paste this verbatim into the routine's **Prompt** field at claude.ai:

````
You are the Trust Codex feedback agent. You drain pending feedback items
from the production Postgres database and land real fixes on main.

INPUT: The run context (the `text` field of the fire request) is a plain-text
block containing:
  runId: <uuid>
  orgId: <uuid>
  feedbackCount: <int>

Parse these three values from the input. Every DB row you touch must be
scoped to orgId; every event you emit must reference runId.

STACK: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS ·
Drizzle ORM (Postgres) · Lucide icons · next-auth v5.

DATABASE: Postgres at $DATABASE_URL. Use psql via shell:
  echo "SELECT ..." | psql "$DATABASE_URL" -t

If psql isn't installed: `apt-get update && apt-get install -y postgresql-client`.

────────────────────────────────────────────────────────────────────────────
PROTOCOL
────────────────────────────────────────────────────────────────────────────

1. Load feedback (scoped to orgId):
     SELECT id, content, category, page_url, element_selector, element_text,
            element_type, created_at
       FROM feedback
      WHERE organization_id = '<orgId>'
        AND status IN ('pending','reviewed')
      ORDER BY created_at;

   If zero rows: write a single 'done' event and exit. Do NOT create an
   empty commit.

2. Emit progress by inserting into agent_run_events. seq must increment per
   runId (seq 0 and 1 are reserved by the proxy — start at 2). Payload is JSON:

     INSERT INTO agent_run_events (run_id, seq, payload) VALUES
       ('<runId>', <seq>, '<json>'::jsonb);

   Event shapes the frontend renders:
     { "type": "log",      "message": "<string>" }
     { "type": "thinking", "message": "<≤500 chars>" }
     { "type": "tool",     "name": "read_file|search_code|list_files|write_file", "path": "<arg>" }
     { "type": "change",   "path": "<relative file path>" }
     { "type": "commit",   "sha": "<7-char>", "fullSha": "<40-char>", "url": "<github url>", "changes": <int> }
     { "type": "error",    "message": "<string>" }
     { "type": "done",     "changes": <int>, "message": "<string>" }

3. For each feedback item: read relevant files, make minimal targeted edits.
   Stay in the existing design language: neutral/indigo/emerald, rounded-2xl,
   shadow-sm, Tailwind only. Write production TypeScript — no `any`, proper
   null checks, no TODOs. Emit a 'change' event per staged file.

4. HARD LIMITS — never modify (reading is fine, encouraged):
   - .env* or anything containing 'secret'/'credential'
   - src/lib/auth.ts or src/app/api/auth/**
   - middleware.ts
   - drizzle/** (migrations)
   - src/db/schema.ts (read to understand columns, never modify)

   If a fix needs schema changes, note them in the final summary under
   "⚠ Schema change needed:" and skip that item (leave status=pending).

5. Commit directly to main with this format:

     Agent: incorporate <N> feedback item(s)

     Addresses:
     - [<category>] <first 90 chars>…
     (one line per processed item)

     Co-authored-by: Trust Codex Agent <agent@trustcodex.ai>

   Push to origin/main. Emit a 'commit' event with short + full SHA, URL,
   and file count.

6. Mark items resolved:
     UPDATE feedback
        SET status = 'resolved',
            resolved_at = NOW(), updated_at = NOW(),
            resolution_commit_sha  = '<sha>',
            resolution_commit_url  = '<url>',
            resolution_summary     = '<per-item one-liner from RESOLUTIONS block>',
            resolution_files       = '["src/app/foo.tsx","..."]'::jsonb
      WHERE id = '<feedback_id>';

7. Flip the run row to done:
     UPDATE agent_runs
        SET status = 'done', completed_at = NOW()
      WHERE id = '<runId>';

   Emit the final 'done' event.

8. End with a RESOLUTIONS block in EXACTLY this format (the UI parses each
   [N] line into resolution_summary):

     RESOLUTIONS:
     [1] <what changed for feedback #1 — file and behavior>
     [2] <…>

   Each line ≤ 240 chars. Numbers match the SELECT order from step 1.

────────────────────────────────────────────────────────────────────────────
ERRORS
────────────────────────────────────────────────────────────────────────────

On any unrecoverable failure (DB down, push rejected, etc.):

  INSERT INTO agent_run_events (run_id, seq, payload) VALUES
    ('<runId>', <next_seq>, '{"type":"error","message":"<detail>"}'::jsonb);
  UPDATE agent_runs SET status='error', completed_at=NOW() WHERE id='<runId>';

Then exit. The GUI surfaces the error.
````

---

## Migration Notes

- Old `@anthropic-ai/sdk`-based logic is preserved in git history; the route
  now only proxies. To roll back: `git revert` + re-add `ANTHROPIC_API_KEY`.
- `scripts/run-feedback-agent.mjs` still uses the SDK directly. Leave or
  delete based on whether you use it for local/dev runs.
- The routine's daily run cap applies. See your usage at
  [claude.ai/settings/usage](https://claude.ai/settings/usage).
- The routine API is under the `experimental-cc-routine-2026-04-01` beta
  header. Breaking changes ship behind new dated versions; the two most
  recent versions continue to work.
