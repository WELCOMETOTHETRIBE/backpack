# Claude Code Routine — Incorporate Feedback

Setup guide for the **Incorporate Feedback** agent, which runs on your Claude
Code subscription via a [Routine](https://code.claude.com/docs/en/routines).
Zero Anthropic API tokens consumed per run.

## Why HTTPS shim (not direct Postgres)

Claude Code's cloud sandbox **whitelists HTTPS to known hosts** (Anthropic,
GitHub) but **blocks arbitrary TCP egress**. That means the routine cannot
connect directly to Railway Postgres (`gondola.proxy.rlwy.net:44848`).

To work around this, the Next.js app exposes a small **internal HTTPS shim**
that the routine uses for all DB operations:

```
┌─────────────────┐      ┌──────────────────────────┐     ┌──────────────────┐
│  GUI button     │─POST→│ /api/ai/incorporate-fb   │─────│  Claude Code     │
│  (admin only)   │      │  (proxy: fire routine)   │fire │  Routine (cloud) │
│                 │←poll─│                          │     │                  │
└─────────────────┘      └──────────────────────────┘     └──────────────────┘
                                 ▲  │                             │
                    writes via   │  │                             │ clones repo,
                    HTTPS shim   │  │  Postgres over local         │ calls shim,
                    (below)      │  │  network (Railway internal)  │ edits files,
                                 │  ▼                             │ commits + pushes
                         ┌──────────────────────┐                 │
                         │  /api/agent/run/{id} │◀────────────────┘
                         │  GET   context       │   authed via
                         │  POST  /events       │   x-agent-secret
                         │  POST  /complete     │   header
                         └──────────────────────┘
```

## One-Time Setup

### 1. Create the Routine at claude.ai

Go to **https://claude.ai/code/scheduled** → **New routine**.

- **Name:** `Incorporate Feedback — Trust Codex`
- **Repository:** `WELCOMETOTHETRIBE/CMMC` (enable "Allow unrestricted branch
  pushes" so the routine can push to `main`)
- **Environment:** Default (or a custom one) — must have:
  - Env var **`AGENT_SHIM_SECRET`** = the 64-char hex secret (must match the
    one set in Railway as `AGENT_SHIM_SECRET`)
  - Network access: full (so it can reach api.github.com + cmmc-production.up.railway.app)
- **Trigger:** API (generates the `trig_01...` ID and `sk-ant-oat01-...` token)
- **Prompt:** paste the "Routine Prompt" section below

### 2. Set Railway env vars

```
CLAUDE_CODE_ROUTINE_ID=trig_01...              # from routine API trigger
CLAUDE_CODE_ROUTINE_TOKEN=sk-ant-oat01-...     # from routine API trigger
AGENT_SHIM_SECRET=<64 hex chars>               # same value as on the cloud env
```

Remove `ANTHROPIC_API_KEY` once the new flow is verified.

### 3. Test

Click the GUI button. The drawer should stream events as the routine progresses.
Session URL in the drawer opens the live execution trace at claude.ai.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `HTTP 401` on fire | Wrong `CLAUDE_CODE_ROUTINE_TOKEN` | Regenerate at claude.ai |
| `HTTP 404` on fire | Wrong `CLAUDE_CODE_ROUTINE_ID` | Verify `trig_...` matches |
| Routine hits 403 on shim | `AGENT_SHIM_SECRET` mismatch | Must be identical in Railway + cloud env |
| Routine can't reach shim | Cloud env has no network access | Enable network access on environment |
| Routine can't push | "Allow unrestricted branch pushes" off | Toggle in routine repo settings |

---

## Routine Prompt

Paste this verbatim into the routine's **Prompt** field:

````
You are the Trust Codex feedback agent. You drain pending user-feedback items
from production and land real fixes on main.

──────────────────────────────────────────────────────────────────────────────
INPUT
──────────────────────────────────────────────────────────────────────────────

Your run's `text` field contains:
  runId: <uuid>
  apiBase: https://cmmc-production.up.railway.app
  feedbackCount: <int>

Parse runId and apiBase from the input. The sandbox blocks direct Postgres TCP,
so ALL database access goes through an HTTPS shim at apiBase. Every shim call
must send header:  x-agent-secret: $AGENT_SHIM_SECRET  (env var on this env).

STACK: Next.js 16 App Router · React 19 · TypeScript · Tailwind · Drizzle ORM ·
Lucide icons · next-auth v5.

──────────────────────────────────────────────────────────────────────────────
PROTOCOL
──────────────────────────────────────────────────────────────────────────────

1. Load your run context:
     curl -sS -H "x-agent-secret: $AGENT_SHIM_SECRET" \
       $apiBase/api/agent/run/$runId

   Response: { runId, orgId, runStatus, feedback: [...] }
   Each feedback item has: { id, content, category, status, pageUrl,
   elementSelector, elementText, elementType, createdAt, submittedBy }

   If feedback is empty: POST /complete with status=done and exit.

2. Emit progress events liberally. Every milestone = one POST:
     curl -sS -X POST -H "x-agent-secret: $AGENT_SHIM_SECRET" \
       -H "Content-Type: application/json" \
       -d '<payload>' \
       $apiBase/api/agent/run/$runId/events

   Payload shapes (stored verbatim in JSONB, frontend renders them):
     { "type":"log",      "message": "<string>" }
     { "type":"thinking", "message": "<≤500 chars>" }
     { "type":"tool",     "name": "read_file|search_code|list_files|write_file", "path": "<arg>" }
     { "type":"change",   "path": "<relative file path>" }
     { "type":"commit",   "sha":"7char", "fullSha":"40char", "url":"github url", "changes": N }

   The shim auto-increments seq — you never manage sequence numbers.

3. For each feedback item: read relevant source files (emit 'tool' events),
   make minimal targeted edits. Stay in the existing design language:
   neutral / indigo / emerald, rounded-2xl, shadow-sm, Tailwind only.
   Production TypeScript — no `any`, proper null checks, no TODOs.
   Emit a 'change' event per staged file.

4. HARD LIMITS — never modify (reading is fine, encouraged):
   - .env* or anything containing 'secret'/'credential'
   - src/lib/auth.ts or src/app/api/auth/**
   - middleware.ts
   - drizzle/** (migrations)
   - src/db/schema.ts (read to understand columns, never modify)

   If a fix needs schema changes, emit a 'log' event starting with
   "⚠ Schema change needed:" and skip that feedback item (its summary
   in the completion call should say "Skipped — needs schema change").

5. Commit directly to main:

     git add -A
     git commit -m "$(cat <<'EOF'
     Agent: incorporate <N> feedback item(s)

     Addresses:
     - [<category>] <first 90 chars>…
     (one line per processed item)

     Co-authored-by: Trust Codex Agent <agent@trustcodex.ai>
     EOF
     )"
     git push origin main

   Emit a 'commit' event with short + full SHA, full GitHub URL, file count.

6. Finalize the run with one atomic POST:

     curl -sS -X POST -H "x-agent-secret: $AGENT_SHIM_SECRET" \
       -H "Content-Type: application/json" \
       -d '{
         "status": "done",
         "commitSha": "<full 40-char sha>",
         "commitUrl": "https://github.com/WELCOMETOTHETRIBE/CMMC/commit/<sha>",
         "resolutions": [
           {
             "feedbackId": "<uuid>",
             "summary": "<one-sentence description of what changed>",
             "files": ["src/app/foo.tsx", "src/..."]
           }
         ]
       }' \
       $apiBase/api/agent/run/$runId/complete

   The shim updates feedback.status='resolved' for each resolution, stamps
   commit metadata, and flips agent_runs.status='done'.

7. Emit a final 'done' event:
     { "type":"done", "changes": <N>, "message": "N file(s) committed (<short sha>). Railway is redeploying." }

──────────────────────────────────────────────────────────────────────────────
ERROR HANDLING
──────────────────────────────────────────────────────────────────────────────

On unrecoverable failure (git push rejected, auth issue, anything you can't
route around):

  curl -sS -X POST -H "x-agent-secret: $AGENT_SHIM_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"type":"error","message":"<details>"}' \
    $apiBase/api/agent/run/$runId/events

  curl -sS -X POST -H "x-agent-secret: $AGENT_SHIM_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"status":"error"}' \
    $apiBase/api/agent/run/$runId/complete

Then exit. The GUI surfaces the error to the admin.
````

---

## Migration Notes

- Old `@anthropic-ai/sdk`-based logic preserved in git history. To roll back:
  `git revert` the route change and re-add `ANTHROPIC_API_KEY`.
- `scripts/run-feedback-agent.mjs` still uses the SDK directly. Delete or keep
  based on whether you use it for local dev.
- Routine daily run cap applies. Check usage at
  [claude.ai/settings/usage](https://claude.ai/settings/usage).
- The routine API is under the `experimental-cc-routine-2026-04-01` beta
  header. Breaking changes ship behind new dated header versions; two most
  recent versions continue to work.
- If `AGENT_SHIM_SECRET` ever leaks, rotate it in both Railway AND the
  routine's cloud env — they must match.
