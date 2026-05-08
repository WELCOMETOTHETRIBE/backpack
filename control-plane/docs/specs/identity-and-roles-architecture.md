# MacTech Suite — Identity, Membership, and Role Architecture

**Status**: documented (2026-05-07). Reflects the live system across QMS,
Codex, MacTech Identity Command Center (ICC), and Clerk.
**Audience**: anyone building a new app in the suite or modifying authz on
an existing one.

## TL;DR

We run **three role taxonomies on purpose**, not by accident. Each layer
owns a different concern; conflating them would either weaken the audit
trail (CMMC L2 + 21 CFR Part 11 want separate, app-specific responsibility
records) or create coupling that prevents per-app evolution.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Clerk                                                              │
│  Owns: identity (who is this human; password, MFA, session)         │
│  Vocabulary: clerk_user_id, email, optional clerk_org_id            │
│  Source of truth: Clerk dashboard                                   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MacTech Identity Command Center (ICC)                              │
│  Owns: cross-app entitlements ("this user has access to QMS         │
│         AND codex AND TrainOS") + a coarse role hint per app        │
│  Vocabulary: customer_owner, customer_admin, compliance_manager,    │
│              security_manager, evidence_contributor, auditor,       │
│              read_only_user                                         │
│  Source of truth: MacTech Suite admin UI                            │
└─────────────────────────────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
   │ QMS            │  │ Codex          │  │ TrainOS (etc.) │
   │ App-internal   │  │ App-internal   │  │ Per-app role   │
   │ permissions    │  │ roles          │  │ taxonomy       │
   │                │  │                │  │                │
   │ Manager,       │  │ Admin,         │  │ ...            │
   │ Quality Mgr,   │  │ Compliance,    │  │                │
   │ Read-Only,     │  │ Assessor       │  │                │
   │ System Admin,  │  │                │  │                │
   │ User           │  │                │  │                │
   │ + 60+          │  │                │  │                │
   │ permission     │  │                │  │                │
   │ codes          │  │                │  │                │
   │ (document:     │  │                │  │                │
   │  release, …)   │  │                │  │                │
   └────────────────┘  └────────────────┘  └────────────────┘
```

A single human can legitimately hold:
- Clerk user `user_2abc...` (one identity)
- ICC role `compliance_manager` (their hub-level entitlement)
- QMS role `Quality Manager` (releases documents under 21 CFR Part 11)
- Codex role `Compliance` (reviews adjudication evidence)

These are **not duplicates**. They are different jobs, with different audit
trails, in different regulated systems. CMMC L2 and ISO 13485 explicitly
treat them as separate responsibilities.

## Why three layers, not one

### Why not just Clerk

Clerk is a great identity provider but it's not a regulatory-domain authz
layer. Every app in the suite has its own compliance vocabulary:
- QMS speaks 21 CFR Part 11 (e-signature meanings, release authority)
- Codex speaks NIST 800-171 R2 (control adjudication, assessor view mode)
- TrainOS speaks training-record completeness and signed evidence

Clerk's `publicMetadata` could stuff custom fields, but:
1. You'd be putting CMMC-grade audit fields in a third-party service
2. Cross-app changes would all serialize through one provider
3. Versioning + rollback of role definitions becomes a Clerk problem

So Clerk is **identity only**. No role data lives there.

### Why not just ICC

ICC is the right place for **suite-level** decisions: which apps a user has
access to, which org they belong to, whether they're internal MacTech or
customer. It's NOT the right place for app-internal authz because:
1. ICC roles are coarse on purpose (`compliance_manager` rather than
   `quality_manager + has document:release permission`).
2. App-internal authz changes are common; ICC entitlement changes are rare.
   A QMS admin promoting someone to `Quality Manager` shouldn't require
   touching the central hub.
3. CMMC 3.4.5 wants the system that *enforces* the change to also *record*
   it. QMS auditors want to see "this user got `Quality Manager` in QMS on
   2026-05-07 by Patrick Caruso, with reason X" in QMS's audit log — not
   in a hub log they can't easily reach.

### Why per-app local roles win

Each app's role taxonomy is shaped by its own regulations:
- QMS has `Quality Manager` because 21 CFR §211.22 puts release authority
  on a distinct role; the e-sig statement names them.
- Codex has `Assessor` because NIST 800-171 R2 needs a C3PAO read-only
  view mode that's distinct from compliance staff.
- TrainOS will have its own roles tied to training-record-keeping rules.

If we forced one taxonomy, every app would carry every other app's roles
"just in case." Local taxonomy = local authority over local rules.

## What lives where (definitive table)

| Concern | Layer | Concrete artifact |
|---|---|---|
| Email + password + MFA + sign-in UI | Clerk | Clerk dashboard |
| Clerk user_id (`user_2abc…`) | Clerk | Session token |
| "Does this human have access to app X?" | ICC | `findActiveAccessForApp(iccResult, "quality")` |
| "What's their default role in app X?" | ICC | `access.org.role` (one of the 7 ICC role values) |
| "What can they ACTUALLY do in app X right now?" | App-local | `users.role` + `role_permissions` join |
| "Who exactly is allowed to release this document?" | QMS-local | `document:release` permission code |
| "Who can run the C3PAO assessor view?" | Codex-local | `users.role = 'Assessor'` |
| Audit log of role changes within app X | App-local | `audit_logs` table in app X |
| Audit log of "user added to app X" | ICC + app | Hub-side audit + app-side JIT-provision audit |

## Mapping: ICC role → app-local role

When a user signs into QMS for the first time, the JIT path queries ICC,
gets `access.org.role`, and maps to a QMS role using the table below. After
provisioning, the QMS role is the source of truth for QMS authz. ICC role
changes do NOT auto-update the QMS role (manual overrides survive).

### QMS

| ICC role | QMS role (default) |
|---|---|
| `customer_owner` | `System Admin` |
| `customer_admin` | `System Admin` |
| `compliance_manager` | `Quality Manager` |
| `security_manager` | `Manager` |
| `evidence_contributor` | `User` |
| `auditor` | `Read-Only` |
| `read_only_user` | `Read-Only` |
| (internal MacTech operator) | `System Admin` |

Lives in [`server/src/lib/iccRoleMapping.js`](https://github.com/bmacdonald417/QMS/blob/main/server/src/lib/iccRoleMapping.js).

### Codex

| ICC role | Codex role (default) |
|---|---|
| `customer_owner` / `customer_admin` | `Admin` |
| `auditor` | `Assessor` |
| `compliance_manager` / `security_manager` / `evidence_contributor` / `read_only_user` | `Compliance` |
| (internal MacTech operator) | `Admin` |

Lives in `src/lib/auth.ts` (`mapIccRoleToCodexRole`).

## How a sign-in flows end-to-end

```
[User clicks /sign-in on quality.mactechsolutionsllc.com]
  ↓ Clerk SSO completes
[Clerk session cookie set; clerk_user_id assigned]
  ↓ React app loads, fetches /api/auth/me
[QMS authMiddleware validates Clerk token → resolves local user row]
  ├── User row already exists (clerkUserId match) → load + return
  ├── Email matches existing pre-Clerk row → adopt by linking clerkUserId
  └── Neither → JIT: query ICC, map ICC role → QMS role, create row
  ↓
[req.user populated with QMS role + permissions]
  ↓ all subsequent routes use requireRoles(...) + requirePermission(...)
```

Once the user has a QMS row, ICC is no longer consulted on role decisions.
Subsequent ICC role changes don't propagate (intentional — QMS Quality
Manager is the source of truth for QMS authority).

## What "override" means and how to detect it

After JIT provision, a System Admin / Quality Manager / Manager (with the
`users:update*` permission) can change any user's QMS role through
`/system/users`. Every change writes a `USER_ROLE_CHANGED` audit log entry
with before/after snapshots.

To distinguish "JIT default" from "manually overridden", we record
`users.icc_role_at_provision` — the raw ICC role string at the moment of
JIT. If `current QMS role != mapIccRoleToQmsRole(icc_role_at_provision)`,
the user has been overridden. The QMS UI surfaces this as a hint
("ICC default would be Quality Manager; current override is Manager").

## What happens when ICC says someone changes role

Today: nothing. The QMS row keeps whatever role it had.

Future sprint: a webhook from ICC (`POST /api/iam/icc-webhook` on QMS)
fires on `org_member.role_changed`. QMS:
1. Re-runs the mapping for the new ICC role
2. Updates `icc_role_at_provision` to the new ICC value
3. **Only updates the QMS role if the user has never been manually
   overridden** (i.e. their current QMS role still equals what the OLD
   `icc_role_at_provision` mapped to)
4. Logs `USER_ROLE_AUTO_UPDATED_FROM_ICC` either way

This preserves the principle: **manual overrides always win**, and ICC
sync becomes a default-keeper, not a reset-everything signal.

## Common mistakes (don't repeat these)

1. **Checking role names instead of permission codes.** `roleName === 'Admin'`
   is fragile — Admin might not exist in your app's taxonomy (it doesn't in
   QMS). Always use the canonical `requireRoles(...) + requirePermission(...)`
   pattern, and for the most important gates, lean on the permission code
   alone (e.g. `document:release`).

2. **Putting authz in middleware that checks Clerk publicMetadata.** Authz
   isn't an identity concern; it's a regulated-domain concern. Use the
   app-local users.role / role_permissions tables.

3. **Trying to reuse one app's role names in another.** "I'll just call codex's
   Admin == QMS's System Admin" — they're not the same. A codex Admin can
   open a CMMC assessment; a QMS System Admin can release a controlled
   document. Both are powerful in their own domain; neither implies the
   other.

4. **Auto-syncing every ICC change to the QMS role.** This destroys the
   manual-override audit trail. Only update on the default-keeper rule
   above.

## Open questions / future work

- **Codex permission codes.** Codex today only has 3 roles, no fine-grained
  permissions. As codex grows (CAE actions, OIS narrative locks, assessor
  scratchpad) we'll need permission codes too. Time to mirror the QMS
  pattern when the route count crosses ~10 per role.

- **ICC webhook for role-change sync.** Spec'd above; not built. Triggers:
  a person leaves an org → `read_only_user` everywhere → don't blow away
  the manual override but DO log the discrepancy so an admin can review.

- **Cross-app permission-equivalence registry.** When auditors ask "who
  in the company can release CMMC governance documents?", today they have
  to query QMS for `document:release`. If we add cross-app fine-grained
  permissions, an ICC-side registry that joins them might help.

- **Internal-MacTech-operator clarification.** Today `isInternalMacTechUser`
  → `System Admin` everywhere. We may want a separate "MacTech Support"
  role that has elevated read access for troubleshooting but NOT release
  authority — protecting the customer's audit trail from MacTech employees
  inadvertently signing things on their behalf.
