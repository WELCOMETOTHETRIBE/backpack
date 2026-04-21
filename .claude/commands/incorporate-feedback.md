# Incorporate User Feedback

Review pending feedback from the CMMC Codex production database and implement the requested changes.

## Step 1 — Fetch pending feedback

Query the production database for all unresolved feedback:

```
psql "$(railway variables --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('DATABASE_PUBLIC_URL',''))")" \
  -c "SELECT id, content, category, status, element_selector, element_id, element_class, element_text, element_type, page_url, created_at FROM feedback WHERE status IN ('pending', 'reviewed') ORDER BY created_at ASC;"
```

If no pending feedback is found, report that and stop.

## Step 2 — Triage and plan

For each feedback item:
1. Read the `content` field — this is what the user is asking for.
2. Use the `page_url` to identify which part of the app is affected.
3. Use `element_selector`, `element_type`, `element_text`, and `element_class` to pinpoint the specific UI element the user clicked on when submitting feedback.
4. Map the `category` field (`bug`, `ux`, `feature`, `general`) to understand the type of change needed.
5. Explore the relevant source files to understand the current implementation.

Present a brief plan for each item before implementing. If any item is ambiguous, ask for clarification before proceeding.

## Step 3 — Implement changes

For each feedback item, implement the requested change:
- Follow existing code patterns and conventions in the codebase.
- Type-check with `npx tsc --noEmit` after changes.
- Keep changes focused — address exactly what the feedback asks for.

## Step 4 — Mark feedback as resolved

After implementing and verifying each item, update the production database:

```sql
UPDATE feedback
SET status = 'resolved',
    resolved_at = NOW(),
    updated_at = NOW(),
    resolution_summary = '<concise description of what was changed>',
    resolution_files = '<JSON array of modified file paths>'::jsonb
WHERE id = '<feedback-id>';
```

If the `resolution_summary` and `resolution_files` columns don't exist yet, apply the migration first:

```sql
ALTER TABLE "feedback"
  ADD COLUMN IF NOT EXISTS "resolution_commit_sha"  TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_commit_url"  TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_summary"     TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_files"       JSONB;
```

## Step 5 — Commit and push to main

Commit all changes with a message referencing the feedback ID(s), then push directly to `origin/main`:

```
git add -A
git commit -m "<message referencing feedback IDs>"
git push origin main
```

Do **not** create a branch. Do **not** open a pull request. Every feedback-incorporation run lands directly on `main` so Railway picks it up on the next deploy.

If `git push origin main` is rejected because remote `main` has moved ahead, do `git pull --rebase origin main`, resolve any conflicts, then retry the push. Never use `--force`.

Summarize what was done for each feedback item in the final response.

## Rules
- **Always push directly to `origin/main`** — never create branches or PRs for feedback runs.
- Never use `git push --force` or `--force-with-lease` against `main`.
- If a feedback item requires a large architectural change or is unclear, present options and ask before implementing.
- Always type-check (`npx tsc --noEmit`) before committing.
- One commit per feedback item, or a single commit if items are closely related.
