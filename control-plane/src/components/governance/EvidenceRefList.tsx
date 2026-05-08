import Link from "next/link";
import { ExternalLink, FileSignature, Hash, Link2, Ticket } from "lucide-react";

/**
 * Reusable renderer for an entry's `evidence_refs[]` array (per §1.9 of
 * the Register-Automation v1.1 brief / Phase 5 cross-reference graph).
 *
 * Each ref dispatches on `type` to a typed click-through:
 *   - manifest_id          → /dashboard/monitoring/manifests/[id]
 *   - audit_log_id         → /admin/audit-logs?id=[id]
 *   - related_entry_id     → /dashboard/evidence-engine/entries/[id]
 *   - ticket_url           → external URL (target=_blank)
 *   - evidence_file_hash   → renders the hash + Verify button (placeholder)
 *   - admin_signature      → static badge (no link target)
 *   - any other type       → rendered as a labelled key/value row
 *
 * Designed to be safe with arbitrary data — any unrecognized `type` falls
 * through to a non-clickable display.
 */

export interface EvidenceRefListItem {
  type?: unknown;
  value?: unknown;
  label?: unknown;
}

interface Props {
  refs: unknown;
  /**
   * If provided, the manifest_id for the ENTRY hosting this list — gets
   * a "(source manifest)" badge so the auditor sees which manifest carried
   * the entry vs. which manifests touched it later.
   */
  primaryManifestId?: string | null;
  /**
   * Heading rendered above the list; defaults to "Evidence references".
   */
  heading?: string;
  /**
   * If true, omits the heading and outer card chrome — useful when
   * embedded inside a larger panel that already has its own header.
   */
  inline?: boolean;
}

export function EvidenceRefList({
  refs,
  primaryManifestId,
  heading = "Evidence references",
  inline = false,
}: Props) {
  const items = Array.isArray(refs) ? (refs as EvidenceRefListItem[]) : [];
  if (items.length === 0) {
    if (inline) return null;
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          {heading}
        </h3>
        <p className="mt-2 text-sm text-[var(--color-gray-500)]">
          No evidence references recorded for this entry.
        </p>
      </div>
    );
  }

  const list = (
    <ul className="space-y-2">
      {items.map((ref, i) => (
        <EvidenceRefRow
          key={`${typeof ref.type === "string" ? ref.type : "unknown"}-${i}`}
          item={ref}
          primaryManifestId={primaryManifestId ?? null}
        />
      ))}
    </ul>
  );

  if (inline) return list;
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">
        {heading}
      </h3>
      <div className="mt-3">{list}</div>
    </div>
  );
}

function EvidenceRefRow({
  item,
  primaryManifestId,
}: {
  item: EvidenceRefListItem;
  primaryManifestId: string | null;
}) {
  const type = typeof item.type === "string" ? item.type : "unknown";
  const value = typeof item.value === "string" ? item.value : "(no value)";
  const label = typeof item.label === "string" ? item.label : null;

  const isPrimary = type === "manifest_id" && value === primaryManifestId;

  let icon = <Link2 className="h-3.5 w-3.5" aria-hidden />;
  let pill: React.ReactNode = (
    <span className="font-mono text-xs text-[var(--color-gray-700)] break-all">
      {value}
    </span>
  );

  if (type === "manifest_id") {
    icon = <FileSignature className="h-3.5 w-3.5" aria-hidden />;
    pill = (
      <Link
        href={`/dashboard/monitoring/manifests/${encodeURIComponent(value)}`}
        className="font-mono text-xs text-[var(--color-blue-accent)] hover:underline break-all"
      >
        {value}
      </Link>
    );
  } else if (type === "audit_log_id") {
    icon = <FileSignature className="h-3.5 w-3.5" aria-hidden />;
    pill = (
      <Link
        href={`/admin/audit-logs?id=${encodeURIComponent(value)}`}
        className="font-mono text-xs text-[var(--color-blue-accent)] hover:underline break-all"
      >
        {value}
      </Link>
    );
  } else if (type === "related_entry_id") {
    icon = <Link2 className="h-3.5 w-3.5" aria-hidden />;
    pill = (
      <Link
        href={`/dashboard/evidence-engine/entries/${encodeURIComponent(value)}`}
        className="font-mono text-xs text-[var(--color-blue-accent)] hover:underline break-all"
      >
        {value}
      </Link>
    );
  } else if (type === "ticket_url") {
    icon = <Ticket className="h-3.5 w-3.5" aria-hidden />;
    if (/^https?:\/\//i.test(value)) {
      pill = (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-blue-accent)] hover:underline break-all inline-flex items-center gap-1"
        >
          {value}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      );
    } else {
      pill = (
        <span className="font-mono text-xs text-[var(--color-gray-700)] break-all">
          {value}
        </span>
      );
    }
  } else if (type === "evidence_file_hash") {
    icon = <Hash className="h-3.5 w-3.5" aria-hidden />;
    pill = (
      <span className="font-mono text-xs text-[var(--color-gray-700)] break-all">
        sha256:{value.length > 16 ? `${value.slice(0, 16)}…${value.slice(-4)}` : value}
      </span>
    );
  } else if (type === "admin_signature") {
    icon = <FileSignature className="h-3.5 w-3.5" aria-hidden />;
    pill = (
      <span className="font-mono text-xs text-[var(--color-gray-700)] break-all">
        signature: {value.length > 16 ? `${value.slice(0, 8)}…` : value}
      </span>
    );
  }

  return (
    <li className="flex items-start gap-3 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/40 px-3 py-2 text-sm">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-gray-600)]">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
            {type}
          </span>
          {isPrimary && (
            <span className="inline-flex items-center rounded-full bg-[var(--color-gray-100)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-gray-700)]">
              source manifest
            </span>
          )}
        </div>
        {label && (
          <p className="mt-0.5 text-xs text-[var(--color-gray-600)] break-words">
            {label}
          </p>
        )}
        <div className="mt-1">{pill}</div>
      </div>
    </li>
  );
}
