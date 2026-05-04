import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { governanceRegisterEntries, governanceRegisters, governanceEntryEvents, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  getFieldLabel,
  getSummaryTemplate,
  renderSummary,
  getFallbackSummary,
} from "@/data/cmmc/field-labels-and-summaries";
import { FinalizeButton } from "./FinalizeButton";
import { EntryAttachments } from "./EntryAttachments";

type PageProps = { params: Promise<{ entryId: string }> };

export default async function EvidenceEngineEntryDetailPage({ params }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { entryId } = await params;

  const [entry] = await db
    .select()
    .from(governanceRegisterEntries)
    .where(eq(governanceRegisterEntries.id, entryId));

  if (!entry) notFound();

  const [register] = await db
    .select()
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.id, entry.registerId),
        eq(governanceRegisters.organizationId, orgId)
      )
    );

  if (!register) notFound();

  const data = (entry.entryData ?? {}) as Record<string, unknown>;
  const registerKey = register.registerKey;
  const entryType = entry.entryType ?? "unknown";
  const template = getSummaryTemplate(registerKey, entryType);
  const summary = template
    ? renderSummary(template, data)
    : getFallbackSummary(entryType, data);

  const keys = Object.keys(data).sort();
  const isDraft = entry.status === "draft";
  const userRole = (session?.user as { role?: string })?.role;
  const canFinalize = userRole === "Admin";

  const timelineRows = await db
    .select({
      id: governanceEntryEvents.id,
      eventAt: governanceEntryEvents.eventAt,
      eventType: governanceEntryEvents.eventType,
      eventJson: governanceEntryEvents.eventJson,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(governanceEntryEvents)
    .leftJoin(users, eq(governanceEntryEvents.actorUserId, users.id))
    .where(
      and(
        eq(governanceEntryEvents.entryId, entryId),
        eq(governanceEntryEvents.orgId, orgId)
      )
    )
    .orderBy(desc(governanceEntryEvents.eventAt));

  function timelineSummary(eventType: string, eventJson: Record<string, unknown> | null): string {
    if (eventType === "created") return "Entry created";
    if (eventType === "updated") return (eventJson?.summary as string) ?? "Fields updated";
    if (eventType === "finalized") return (eventJson?.summary as string) ?? "Entry finalized";
    if (eventType === "attachment_added") {
      const name = eventJson?.originalFilename as string | undefined;
      return name ? `Attachment added: ${name}` : "Attachment added";
    }
    if (eventType === "voided") {
      const reason = eventJson?.voidReason as string | undefined;
      return reason ? `Voided: ${reason}` : "Entry voided";
    }
    return eventType;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}`}
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← {register.name}
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          Entry detail
        </h2>
        <p className="mt-0.5 font-mono text-sm text-[var(--color-gray-600)]">
          {entryType} · {entry.status}
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Summary</h3>
        <p className="mt-2 text-[var(--color-gray-800)]">{summary}</p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Fields</h3>
          {isDraft && canFinalize && (
            <FinalizeButton
              entryId={entryId}
              registerKey={registerKey}
              boundaryId={entry.boundaryId}
            />
          )}
        </div>
        <dl className="mt-4 space-y-3">
          {keys.map((key) => (
            <div key={key} className="flex gap-4 border-b border-[var(--color-border-muted)] pb-2">
              <dt className="w-48 shrink-0 text-sm font-medium text-[var(--color-gray-700)]">
                {getFieldLabel(key)}
              </dt>
              <dd className="flex-1 min-w-0 text-sm text-[var(--color-gray-900)]">
                <FieldValue value={data[key]} />
              </dd>
            </div>
          ))}
        </dl>
        {keys.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">No field data.</p>
        )}
      </div>

      <EntryAttachments entryId={entryId} />

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Timeline</h3>
        {timelineRows.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">No events yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {timelineRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-2 text-sm last:border-0"
              >
                <span className="text-[var(--color-gray-500)]">
                  {row.eventAt ? new Date(row.eventAt).toLocaleString() : "—"}
                </span>
                <span className="font-medium text-[var(--color-gray-700)]">
                  {row.actorName ?? row.actorEmail ?? "System"}
                </span>
                <span className="text-[var(--color-gray-600)]">
                  {timelineSummary(row.eventType, row.eventJson as Record<string, unknown> | null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm text-[var(--color-gray-600)]">
        Created {new Date(entry.createdAt).toLocaleString()}
        {entry.finalizedAt && (
          <> · Finalized {new Date(entry.finalizedAt).toLocaleString()}</>
        )}
      </div>
    </div>
  );
}

/**
 * Render a single entryData field value. Handles the four shapes that
 * actually show up in the codex's register entries:
 *   - primitives (string/number/bool/null) -> plain text
 *   - empty string / null / undefined        -> em dash
 *   - array of primitives                    -> joined with commas
 *   - array of objects / nested object       -> collapsible pretty-printed JSON
 *
 * Without this, the page renders nested objects via String(value), which
 * yields the famously useless "[object Object]". For inventory_snapshot
 * entries (users / service_principals / devices / scope / totals / diff_
 * from_previous) every meaningful field is nested -- the old rendering
 * meant the page surfaced literally none of the snapshot data.
 */
function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-[var(--color-gray-400)]">—</span>;
  }
  // Primitives
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="break-words">{String(value)}</span>;
  }
  // Array of primitives -> comma-joined
  if (Array.isArray(value) && value.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v))) {
    if (value.length === 0) {
      return <span className="text-[var(--color-gray-400)] italic">empty list</span>;
    }
    return <span className="break-words">{value.map((v) => String(v)).join(", ")}</span>;
  }
  // Array of objects -> count + collapsible JSON
  if (Array.isArray(value)) {
    return (
      <details className="group">
        <summary className="cursor-pointer text-xs text-[var(--color-blue-accent)] hover:underline">
          {value.length} item{value.length === 1 ? "" : "s"} (click to expand)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-3 font-mono text-[11px] leading-relaxed text-[var(--color-gray-800)]">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    );
  }
  // Plain object -> compact key:value list, with deep nesting fall-through to JSON
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return <span className="text-[var(--color-gray-400)] italic">empty</span>;
    }
    // Shallow object with all-primitive values -> inline list
    const allPrimitive = keys.every((k) => {
      const v = obj[k];
      return v === null || ["string", "number", "boolean"].includes(typeof v);
    });
    if (allPrimitive) {
      return (
        <ul className="space-y-0.5">
          {keys.map((k) => (
            <li key={k} className="text-xs">
              <span className="font-medium text-[var(--color-gray-600)]">{k}:</span>{" "}
              <span className="text-[var(--color-gray-900)]">
                {obj[k] === null || obj[k] === "" ? "—" : String(obj[k])}
              </span>
            </li>
          ))}
        </ul>
      );
    }
    // Otherwise fall back to JSON (collapsed)
    return (
      <details className="group">
        <summary className="cursor-pointer text-xs text-[var(--color-blue-accent)] hover:underline">
          object ({keys.length} field{keys.length === 1 ? "" : "s"} — click to expand)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-3 font-mono text-[11px] leading-relaxed text-[var(--color-gray-800)]">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    );
  }
  return <span className="break-words">{String(value)}</span>;
}
