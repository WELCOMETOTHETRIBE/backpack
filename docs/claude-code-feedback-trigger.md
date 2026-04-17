# Claude Code Remote Trigger — Incorporate Feedback

This file documents the setup for the **Incorporate Feedback** agent, which runs
on your Claude Code subscription (no API token cost) instead of the direct
Anthropic SDK path.

## Architecture

```
┌─────────────────┐       ┌──────────────────────────┐      ┌─────────────────┐
│  GUI button     │─POST─▶│ /api/ai/incorporate-fb   │─run─▶│ Claude Code     │
│  (admin only)   │       │  (Next.js route)         │      │  Remote Trigger │
│                 │◀poll──│                          │      │                 │
└─────────────────┘       └──────────────────────────┘      └─────────────────┘
                                  ▲                                  │
                                  │                                  │ commits,
                                  │     writes events, status        │ pushes,
                                  └──────────── DB ◀─────────────────┘ updates
                                                                        feedback
```

1. User clicks **Incorporate Feedback** in the GUI.
2. `/api/ai/incorporate-feedback` POST creates an `agent_runs` row and fires the
   Claude Code trigger, passing `{ runId, orgId, feedbackCount }` as input.
3. The trigger runs on Claude Code's cloud infrastructure, connects back to the
   Railway DB, reads pending feedback, makes code changes, commits & pushes,
   and updates the `feedback` / `agent_runs` / `agent_run_events` tables.
4. The GUI polls `/api/ai/incorporate-feedback?runId=…&after=…` every 2s and
   streams the events the trigger wrote to the DB.

## One-Time Setup

### 1. Create the trigger at claude.ai

Go to **https://claude.ai/code/triggers** → **Create Trigger**.

- **Name:** `Incorporate Feedback — Trust Codex`
- **Repository:** `WELCOMETOTHETRIBE/CMMC` on branch `main`
- **Environment variables:** add `DATABASE_URL` with your Railway Postgres URL
- **Prompt:** paste the contents of the "Trigger Prompt" section below
- **Save** — copy the trigger ID it generates (format: `trigger_...`)

### 2. Add Railway env vars

Set these in your Railway service:

```
CLAUDE_CODE_TRIGGER_ID=trigger_...        # from step 1
CLAUDE_CODE_TOKEN=<your claude.ai OAuth>  # Settings → API → "API token" or claude CLI token
```

Then **remove** `ANTHROPIC_API_KEY` from Railway — it's no longer needed for this
feature (and that was the token being burned on every button press).

### 3. Verify

Click the button in the GUI. The log panel should show:

```
Queued — N feedback item(s) pending.
Handing off to Claude Code remote trigger…
Trigger accepted — agent starting up…
[trigger-emitted events]
```

If you see `Trigger invocation failed: HTTP 401` → your `CLAUDE_CODE_TOKEN`
needs to be refreshed. If you see `HTTP 404` → wrong `CLAUDE_CODE_TRIGGER_ID`.

---

## Trigger Prompt

Paste this verbatim into the trigger's **Prompt** field on claude.ai:

````
You are the Trust Codex feedback agent. You drain pending feedback items from
the production database and land real fixes on main.

INPUT: The invocation gives you a JSON blob with { runId, orgId, feedbackCount }.
Parse it from the input — every event you emit and every row you touch must be
scoped to that runId and orgId.

STACK: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · Drizzle ORM
(Postgres) · Lucide icons · next-auth v5.

DATABASE: Postgres at $DATABASE_URL. You'll read feedback and write progress
events. Connection via `psql "$DATABASE_URL"` works; so does piping SQL through
heredoc.

────────────────────────────────────────────────────────────────────────────
PROTOCOL
────────────────────────────────────────────────────────────────────────────

1. Read feedback:
   SELECT id, content, category, page_url, element_selector, element_text,
          element_type, created_at
     FROM feedback
    WHERE organization_id = '<orgId>'
      AND status IN ('pending','reviewed')
    ORDER BY created_at;

   If zero rows → emit a single 'done' event with message "No pending feedback"
   and stop. Do NOT commit an empty commit.

2. For EACH progress milestone, INSERT into agent_run_events. The seq column
   must increment monotonically per runId (seq=0 and seq=1 are already used
   by the API route, so start at seq=2). Use this exact shape:

     INSERT INTO agent_run_events (run_id, seq, payload)
     VALUES ('<runId>', <seq>, '<json>'::jsonb);

   Event payload shapes the frontend already renders:
     { "type": "log",      "message": "<string>" }
     { "type": "thinking", "message": "<string up to 500 chars>" }
     { "type": "tool",     "name": "read_file|search_code|list_files|write_file", "path": "<arg>" }
     { "type": "change",   "path": "<relative file path staged>" }
     { "type": "commit",   "sha": "<7-char>", "fullSha": "<40-char>", "url": "<github url>", "changes": <int> }
     { "type": "error",    "message": "<string>" }
     { "type": "done",     "changes": <int>, "message": "<string>" }

   Emit events liberally — this is what the user sees in the drawer.

3. Work through each feedback item:
   - Read relevant source files (emit a 'tool' event for each).
   - Design targeted, minimal edits. Stay in the existing design language:
     neutral / indigo / emerald palette, rounded-2xl, shadow-sm, Tailwind only.
   - Write production TypeScript: no `any`, proper null checks, no TODOs.
   - Emit a 'change' event for each file you stage.

4. HARD LIMITS — do NOT modify (reading is fine, encouraged):
   - .env* or anything containing 'secret'/'credential'
   - src/lib/auth.ts or src/app/api/auth/**
   - middleware.ts
   - drizzle/** (migrations — never write these)
   - src/db/schema.ts (read to understand columns, never modify)

   If a fix requires schema changes, note them in the final summary under
   "⚠ Schema change needed:" and skip that feedback item (leave it pending).

5. Commit with message:

     Agent: incorporate <N> feedback item(s)

     Addresses:
     - [<category>] <first 90 chars of content>…
     (one line per processed item)

     Co-authored-by: Trust Codex Agent <agent@trustcodex.ai>

   Push to origin/main. Emit a 'commit' event with the short SHA, full SHA,
   github.com commit URL, and file-count.

6. Update the database to mark items resolved:

     UPDATE feedback
        SET status = 'resolved',
            resolved_at = NOW(),
            updated_at = NOW(),
            resolution_commit_sha = '<sha>',
            resolution_commit_url = '<url>',
            resolution_summary = '<per-item one-liner>',
            resolution_files = '["src/app/foo.tsx", "..."]'::jsonb
      WHERE id = '<feedback_id>';

   Write resolution_summary from the [N] line of your final RESOLUTIONS block
   (see step 8).

7. Flip the agent_runs row to done:

     UPDATE agent_runs
        SET status = 'done', completed_at = NOW()
      WHERE id = '<runId>';

   Emit the final 'done' event.

8. End your output with a RESOLUTIONS block in this exact format — the Resolved
   tab in the GUI parses each [N] line verbatim into resolution_summary:

     RESOLUTIONS:
     [1] <what you changed to implement feedback item #1 — file & behavior>
     [2] <…>

   Each line ≤ 240 chars. The [N] numbers must match the feedback query order.

────────────────────────────────────────────────────────────────────────────
ERROR HANDLING
────────────────────────────────────────────────────────────────────────────

If anything fails (DB connection, git push rejected, etc.):

  INSERT INTO agent_run_events (run_id, seq, payload) VALUES
    ('<runId>', <next_seq>, '{"type":"error","message":"<details>"}'::jsonb);
  UPDATE agent_runs SET status='error', completed_at=NOW() WHERE id='<runId>';

Then exit. The GUI surfaces the error to the admin.
````

---

## Migration Notes

- The old `@anthropic-ai/sdk`-based logic is preserved in git history; the new
  route only proxies. If you ever need to roll back, `git revert` the route
  change and re-add `ANTHROPIC_API_KEY`.
- `scripts/run-feedback-agent.mjs` still uses the SDK directly for manual/local
  runs. Keep it or delete it based on whether you use it for dev.
- Railway redeploys within ~30s of a push, so the commit flow stays instant.
