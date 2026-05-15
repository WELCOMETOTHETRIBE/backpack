"use client";

import { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FileSignature,
  Info,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  OutstandingControlEntry,
  CustomerAttestedInherited,
} from "@/lib/compliance/outstanding-controls";
import type { AttestationTemplate } from "@/lib/compliance/attestation-templates";
import { AttestationModal } from "@/components/adjudication/AttestationModal";
import { controlDetailHref } from "@/lib/compliance/control-detail-href";

export type WizardLiveStatus = "closed" | "in_progress" | "not_started";

export interface WizardCard extends OutstandingControlEntry {
  liveStatus: WizardLiveStatus;
  controlRecordId: string | null;
  template?: AttestationTemplate;
}

export interface WizardCustomerAttestedCard extends CustomerAttestedInherited {
  liveStatus: WizardLiveStatus;
  controlRecordId: string | null;
  template?: AttestationTemplate;
}

const BUCKETS = {
  A: {
    label: "Training & IR tabletop",
    subtitle: "Push training records + run IR tabletop; evidence auto-attaches",
    color: "emerald",
  },
  B: {
    label: "Register entries",
    subtitle: "Make entries on cadence",
    color: "amber",
  },
  C: {
    label: "Sign-off needed",
    subtitle: "One-time architectural attestations",
    color: "indigo",
  },
  E: {
    label: "N/A attestations",
    subtitle: "5-minute one-click sign-offs",
    color: "slate",
  },
} as const;

type BucketKey = keyof typeof BUCKETS;
type TabKey = BucketKey | "ALL" | "IN_PROGRESS";

const VALID_BUCKETS: readonly BucketKey[] = ["A", "B", "C", "E"];

function isValidBucket(value: string | null): value is BucketKey {
  return value !== null && (VALID_BUCKETS as readonly string[]).includes(value);
}

export function OutstandingWizard({
  cards,
  customerAttestedCards,
  signatoryName,
}: {
  cards: WizardCard[];
  customerAttestedCards: WizardCustomerAttestedCard[];
  signatoryName: string;
}) {
  // Deep-link support: PathTo110Widget chips link here with ?bucket=A|B|C|E.
  // Read it on mount so the user lands on the right tab immediately.
  const searchParams = useSearchParams();
  const initialBucket: TabKey = (() => {
    const v = searchParams.get("bucket");
    if (v === "IN_PROGRESS") return "IN_PROGRESS";
    return isValidBucket(v) ? v : "ALL";
  })();
  const [activeBucket, setActiveBucket] = useState<TabKey>(initialBucket);

  // Keep tab in sync if the user navigates between bucket-filtered URLs in
  // the same session (e.g. clicks a chip while already on this page).
  useEffect(() => {
    const v = searchParams.get("bucket");
    if (v === "IN_PROGRESS") setActiveBucket("IN_PROGRESS");
    else if (isValidBucket(v)) setActiveBucket(v);
    else if (v === null) setActiveBucket("ALL");
  }, [searchParams]);

  const [activeTemplate, setActiveTemplate] = useState<{
    template: AttestationTemplate;
    controlId: string;
  } | null>(null);

  // "Outstanding Controls" = work that still needs to happen. Closed cards
  // graduate off this view entirely (visible on the SCTM / Done view).
  // not_started ("Open") lives under the bucket tabs (All / A / B / C / E).
  // in_progress is shown only on the dedicated "In progress" tab so the
  // bucket tabs are clean lists of work that hasn't been touched yet.
  const notStartedCards = useMemo(
    () => cards.filter((c) => c.liveStatus === "not_started"),
    [cards],
  );
  const inProgressCards = useMemo(
    () => cards.filter((c) => c.liveStatus === "in_progress"),
    [cards],
  );

  const grouped = useMemo(() => {
    const out: Record<BucketKey, WizardCard[]> = { A: [], B: [], C: [], E: [] };
    for (const c of notStartedCards) {
      const b = c.bucket as BucketKey;
      if (out[b]) out[b].push(c);
    }
    return out;
  }, [notStartedCards]);

  const filteredCards =
    activeBucket === "ALL"
      ? notStartedCards
      : activeBucket === "IN_PROGRESS"
        ? inProgressCards
        : grouped[activeBucket] ?? [];

  // Each tab is now single-status, so sort within by lowest effort first.
  const sortedCards = [...filteredCards].sort(
    (a, b) => a.effortMinutes - b.effortMinutes,
  );

  return (
    <div className="space-y-6">
      {/* Bucket tabs. Each tab is a single-status list — bucket tabs hold
          not_started ("Open") cards; the dedicated "In progress" tab holds
          cards mid-flight. Closed cards never appear here. */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <BucketTab
          active={activeBucket === "ALL"}
          onClick={() => setActiveBucket("ALL")}
          label="All"
          count={notStartedCards.length}
        />
        {(Object.keys(BUCKETS) as BucketKey[]).map((b) => (
          <BucketTab
            key={b}
            active={activeBucket === b}
            onClick={() => setActiveBucket(b)}
            label={BUCKETS[b].label}
            count={grouped[b]?.length ?? 0}
          />
        ))}
        <BucketTab
          active={activeBucket === "IN_PROGRESS"}
          onClick={() => setActiveBucket("IN_PROGRESS")}
          label="In progress"
          count={inProgressCards.length}
        />
      </div>

      {/* Customer-attested-inherited section (always shown when not closed) */}
      {customerAttestedCards.some((c) => c.liveStatus !== "closed") && activeBucket === "ALL" && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-indigo-900">
                2 inherited controls need your attestation
              </h3>
              <p className="mt-1 text-sm text-indigo-800">
                Controls 3.10.3 and 3.10.6 are inherited from Azure Government — but C3PAO
                inheritance requires you to attest to specific conditions. Sign these to lock in
                the inheritance; if conditions don&apos;t apply, we&apos;ll switch you to the
                register-based path.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {customerAttestedCards.map((c) => (
                  <CustomerAttestedCard
                    key={c.controlId}
                    card={c}
                    onAttest={() =>
                      c.template &&
                      setActiveTemplate({ template: c.template, controlId: c.controlId })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Cards grid. Bucket A mixes Awareness & Training (3.2.x) and Incident
          Response (3.6.x) — split them into two explicit columns so the
          training cards stack on the left and the IR-tabletop cards stack on
          the right. Other buckets keep the standard row-major grid. */}
      {activeBucket === "A" ? (
        (() => {
          const atCards = sortedCards.filter((c) => c.controlId.startsWith("3.2."));
          const irCards = sortedCards.filter((c) => c.controlId.startsWith("3.6."));
          const other = sortedCards.filter(
            (c) => !c.controlId.startsWith("3.2.") && !c.controlId.startsWith("3.6.")
          );
          const renderCard = (card: WizardCard) => (
            <CloseControlCard
              key={card.controlId}
              card={card}
              onAttest={() =>
                card.template &&
                setActiveTemplate({ template: card.template, controlId: card.controlId })
              }
            />
          );
          return (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Awareness &amp; Training (AT)
                  </h3>
                  {atCards.length > 0 ? (
                    atCards.map(renderCard)
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      No open AT controls.
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Incident Response (IR)
                  </h3>
                  {irCards.length > 0 ? (
                    irCards.map(renderCard)
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      No open IR controls.
                    </p>
                  )}
                </div>
              </div>
              {other.length > 0 && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {other.map(renderCard)}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedCards.map((card) => (
            <CloseControlCard
              key={card.controlId}
              card={card}
              onAttest={() =>
                card.template &&
                setActiveTemplate({ template: card.template, controlId: card.controlId })
              }
            />
          ))}
        </div>
      )}

      {sortedCards.length === 0 && activeBucket !== "A" && (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-sm text-slate-600">No controls in this view.</p>
        </div>
      )}

      {/* Attestation modal */}
      {activeTemplate && (
        <AttestationModal
          template={activeTemplate.template}
          controlId={activeTemplate.controlId}
          defaultSignatoryName={signatoryName}
          onClose={() => setActiveTemplate(null)}
        />
      )}
    </div>
  );
}

function BucketTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-lg px-3.5 py-2 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
      <span
        className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
          active
            ? "bg-blue-700 text-blue-50"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: WizardLiveStatus }) {
  if (status === "closed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Closed
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        <Clock className="h-3 w-3" />
        In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <Circle className="h-3 w-3" />
      Open
    </span>
  );
}

function CloseControlCard({
  card,
  onAttest,
}: {
  card: WizardCard;
  onAttest: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isAttestation = !!card.attestationTemplateId;

  // Determine the action button: attestation modal vs deep-link
  let actionEl: React.ReactNode;
  if (card.liveStatus === "closed") {
    actionEl = (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Done
      </span>
    );
  } else if (isAttestation && card.template) {
    actionEl = (
      <button
        onClick={onAttest}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
      >
        <FileSignature className="h-4 w-4" />
        Sign attestation
      </button>
    );
  } else if (card.bucket === "B" && card.registerSchemaId) {
    // Deep-link straight to the register's own page rather than the
    // /dashboard/registers index — the index ignored ?schema=… and dumped
    // the user back at the full list, which they had to scan to find the
    // right register.
    actionEl = (
      <Link
        href={`/dashboard/evidence-engine/registers/${card.registerSchemaId}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Open register
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    );
  } else if (card.bucket === "A") {
    // 3.2.x: in-app training records flow.
    // 3.6.x: external IR tabletop on training.mactechsolutionsllc.com — the
    // export package will push back to Codex via the bridge and auto-flip
    // these cards to "closed" without manual action.
    const isIr = card.controlId.startsWith("3.6.");
    const href = isIr
      ? (process.env.NEXT_PUBLIC_MACTECH_TRAINING_URL ??
          "https://training.mactechsolutionsllc.com/ir-tabletop")
      : "/dashboard/training";
    const label = isIr ? "Schedule tabletop" : "Go to training";
    actionEl = (
      <a
        href={href}
        target={isIr ? "_blank" : undefined}
        rel={isIr ? "noopener noreferrer" : undefined}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        {label}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    );
  } else {
    actionEl = (
      <Link
        href={controlDetailHref(card.controlId)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        Open in SCTM
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    );
  }

  const bucketColor = BUCKETS[card.bucket as BucketKey]?.color ?? "slate";

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm transition ${
        card.liveStatus === "closed"
          ? "border-emerald-200 bg-emerald-50/30"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">
              {card.controlId}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium text-${bucketColor}-700 bg-${bucketColor}-100`}
            >
              Bucket {card.bucket}
            </span>
            <StatusPill status={card.liveStatus} />
            <span className="text-[11px] text-slate-500">
              ~{card.effortMinutes} min
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {card.title}
          </h3>
          <p className="mt-1 text-sm text-slate-600">{card.primaryAction}</p>
        </div>
        <div className="shrink-0">{actionEl}</div>
      </div>

      {card.template && (
        <details
          className="mt-3 border-t border-slate-100 pt-3"
          open={showDetails}
          onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900">
            <Info className="h-3.5 w-3.5" />
            What a C3PAO will look for
          </summary>
          <div className="mt-2 space-y-2 text-xs text-slate-600">
            <p>
              <strong className="text-slate-700">Examiner note:</strong>{" "}
              {card.template.c3paoExaminerNote}
            </p>
            <p>
              <strong className="text-slate-700">Conditions you&apos;ll affirm:</strong>
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {card.template.conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            {card.template.fallbackIfConditionFails.actionRequired && (
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-900">
                <strong>If a condition fails later:</strong>{" "}
                {card.template.fallbackIfConditionFails.actionRequired}
              </p>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

function CustomerAttestedCard({
  card,
  onAttest,
}: {
  card: WizardCustomerAttestedCard;
  onAttest: () => void;
}) {
  const isClosed = card.liveStatus === "closed";
  return (
    <div
      className={`rounded-lg border bg-white p-3 ${
        isClosed ? "border-emerald-200" : "border-indigo-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-slate-900">
          {card.controlId}
        </span>
        <StatusPill status={card.liveStatus} />
      </div>
      <p className="mt-1.5 text-sm text-slate-700">{card.template?.title}</p>
      {!isClosed && (
        <button
          onClick={onAttest}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700"
        >
          <FileSignature className="h-3.5 w-3.5" />
          Review &amp; sign
        </button>
      )}
    </div>
  );
}
