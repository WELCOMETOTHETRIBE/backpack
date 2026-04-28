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
              <dd className="text-sm text-[var(--color-gray-900)]">
                {data[key] != null && data[key] !== "" ? String(data[key]) : "—"}
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
