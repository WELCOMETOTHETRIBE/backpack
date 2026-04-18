# Repository Security Hardening

Audit and harden this repo's security posture. Use `gh` CLI (with `gh api` for anything without a first-class command). Do not make destructive changes without explicit approval.

## Setup
1. Confirm `gh auth status` shows admin access to this repo.
2. Capture: `OWNER/REPO` (`gh repo view --json nameWithOwner`), default branch, visibility (public/private), and whether it lives in a personal account or org.
3. If GitHub Advanced Security is required for a feature and not available on this repo, skip and note it — don't fail the run.

## Phase 1 — Audit (read-only)
Gather current state. Do not modify anything. Report as a table, then stop for my review.

- **Branch protection / rulesets** on default branch: `/repos/{O}/{R}/branches/{B}/protection` and `/repos/{O}/{R}/rulesets`
- **Code security**: `/repos/{O}/{R}` → `.security_and_analysis`; Dependabot alerts via `/repos/{O}/{R}/vulnerability-alerts` (204=on, 404=off); check for `.github/dependabot.yml`
- **Collaborators & teams**: list with role_name; flag anyone at admin/maintain; for org repos also list teams
- **Actions**: `/actions/permissions` and `/actions/permissions/workflow`; scan `.github/workflows/*.yml` for `pull_request_target`, missing top-level `permissions:` blocks, and secrets referenced in PR-triggered jobs
- **Hygiene**: deploy keys (`/keys`), webhooks (`/hooks`) — just list, flag anything stale or suspicious

## Phase 2 — Propose changes
For each finding, show: current state → proposed state → exact `gh api` command → one-line rationale. Group into:
1. **Safe defaults** — I'll approve as a batch
2. **Stricter options** — I opt in per item
3. **Manual review** — I decide (e.g. removing collaborators)

## Phase 3 — Secure defaults to apply (after I approve)

**Default branch protection:**
- Require PR before merge, minimum 1 approving review
- Dismiss stale approvals on new commits
- Require status checks to pass + branch up-to-date (detect existing checks from recent workflow runs; ask me which to require)
- Require conversation resolution
- Block force pushes
- Block branch deletion

**Code security:**
- Enable Dependabot alerts + security updates
- Enable secret scanning + push protection (skip on private repo without GHAS; tell me)
- If no `.github/dependabot.yml`, offer to create a minimal one for the detected ecosystem

**Actions:**
- Default workflow permissions: `read`
- Disable "allow Actions to create and approve pull requests"
- Require approval for first-time contributors' workflow runs
- Allowed actions: GitHub-owned + verified creators (flag if repo needs stricter allowlist)

## Phase 4 — Report
Produce a concise markdown report:
- Already-correct settings
- Changes applied, with the exact API calls
- Skipped items and why (e.g. "secret scanning requires GHAS on private repos")
- Manual follow-ups (e.g. "2 collaborators have admin — review")
- Optional next-level hardening I declined (signed commits, linear history, CodeQL, include admins in protections)

## Rules
- Never run a destructive or irreversible command without explicit approval.
- Never remove collaborators, teams, deploy keys, or webhooks without approval.
- Prefer **rulesets** over legacy branch protection on repos that already use them; don't create both.
- If a command's payload would overwrite existing settings, show me the diff first — these endpoints replace, not merge.
- Keep the final report short; I'm running this across many repos.
