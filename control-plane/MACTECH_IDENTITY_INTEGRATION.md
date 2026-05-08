# MacTech Identity Command Center — JIT user provisioning

Codex now treats the central
[MacTech Identity Command Center](https://www.suite.mactechsolutionsllc.com)
as the source of truth for *who can sign into codex*.

## What changed

`src/lib/auth.ts > resolveSessionUser` previously returned null whenever
a Clerk user wasn't already attached to a local row AND their Clerk org
wasn't pre-mapped to a codex `organizations` row. Practically: every
new customer hit "Unauthorized" until an admin manually onboarded them.

The third lookup step is now:

> Call `${ICC}/api/v1/users/{clerkUserId}/access?appKey=codex`. If the
> user has access via any of their org entitlements (or is an internal
> MacTech operator), find or auto-create the matching codex
> `organizations` row from the ICC org metadata, then JIT-create the
> user row under it with the role mapped from the central role.

## Required env vars (already set on this service)

| Variable | Purpose |
| --- | --- |
| `MACTECH_IDENTITY_BASE_URL` | Defaults to `https://www.suite.mactechsolutionsllc.com` |
| `MACTECH_AUDIT_INGEST_API_KEY` | Bearer key shared with the central hub |

The same key is reused for both the audit forwarder and the identity
check. Once per-app keys are minted in the central admin UI, this app
should get one with `audit_ingest` + `user_access_read` scopes.

## Role mapping

ICC role → codex `user_role` enum value:

| ICC role | codex role |
| --- | --- |
| `customer_owner` | Admin |
| `customer_admin` | Admin |
| `auditor` | Assessor |
| `compliance_manager` | Compliance |
| `security_manager` | Compliance |
| `evidence_contributor` | Compliance |
| `read_only_user` | Compliance |
| (internal MacTech user) | Admin |

(Codex's enum only has three values today; a finer mapping requires
expanding `user_role` in `src/db/schema.ts`.)

Edit `mapIccRoleToCodexRole()` in `src/lib/auth.ts` to tweak.

## Failure mode

If the ICC is unreachable, the JIT step returns null and the session
resolver falls through to the existing "no user" path. Codex shows
the existing unauthorized state. Fail-closed by design.

## Effect

Granting a customer user access to codex now reduces to:

  - Set `codex` to enabled in the customer org's product entitlements
    in the central admin UI.
  - Add the user to that org via the central admin UI.

Their next codex sign-in JIT-creates a codex `organizations` row (if
one didn't exist) and the user row, then logs them in.
