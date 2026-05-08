# MacTech Identity audit integration

Codex now forwards audit events to the central
[MacTech Identity Command Center](https://www.suite.mactechsolutionsllc.com)
via its `/api/audit/ingest` endpoint.

## Required env vars

| Variable | Purpose |
| --- | --- |
| `MACTECH_IDENTITY_BASE_URL` | Defaults to `https://www.suite.mactechsolutionsllc.com`. Override only for staging. |
| `MACTECH_AUDIT_INGEST_API_KEY` | Bearer key shared with the central hub. Never expose to the browser. |

Both values are server-side only (no `NEXT_PUBLIC_` prefix). The Railway
service for this app should have them set in its environment variables.

## What is sent automatically

`src/middleware.ts` fires one `codex.session.opened` event per browser
session per user, deduped via the `mactech_audit_session` cookie (8h TTL).
This gives the central hub a low-noise "user is using codex" signal.

Failures never throw upstream — `sendAuditLogAsync` swallows network or
hub errors so a downstream outage in Identity cannot take down codex.

## How to log a custom event

```ts
import { sendAuditLog } from "@/lib/mactech-audit-client";

await sendAuditLog({
  payload: {
    appKey: "codex",
    eventType: "codex.control.modified",
    eventCategory: "compliance",
    severity: "info",
    action: `Modified control ${controlId} to status=${status}`,
    actorClerkUserId: userId,
    customerOrgClerkId: orgId,
    resourceType: "control",
    resourceId: controlId,
    metadata: { previousStatus, newStatus: status },
  },
});
```

The full TypeScript surface lives in `src/lib/mactech-audit-client.ts`.
The server-side schema is enforced by the central hub
(`mactech-suite-platform/lib/validations/audit.ts`).
