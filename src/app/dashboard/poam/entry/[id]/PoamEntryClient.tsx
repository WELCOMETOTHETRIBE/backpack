"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Detect a "pre-contract-award gap" POA&M -- one where the weakness is
 * known + intentional during build-out but MUST close before CUI lands
 * in production. We mark these by including a literal phrase in the
 * weakness description so the detection is content-driven without
 * needing a schema change. If you author a custom pre-CUI POAM, include
 * the phrase "pre-contract-award" in the weakness description and the
 * banner will surface automatically.
 */
const PRE_CONTRACT_MARKER = "pre-contract-award";

type Milestone = {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | Date | null;
  orderIndex: number;
};

type Approval = {
  id: string;
  approverId: string;
  approvalOrder: number;
  attestedAt: string | Date;
  approverEmail: string | null;
};

type Role = { id: string; name: string };

type Entry = {
  id: string;
  controlRecordId: string;
  controlId: string | null;
  // Phase A0 (migration 0068) extended poam_entry_status with 'draft'
  // and 'active' to support the auto-POA&M-on-NOT-MET flow:
  //   draft  — auto-stub created when a control flips to NOT MET;
  //            does NOT elevate the verdict.
  //   active — customer-finalized, AG-mandated fields populated;
  //            elevates met_via to operational_plan_of_action.
  // Legacy 'open' / 'closed' values still flow through unchanged.
  status: "open" | "closed" | "draft" | "active";
  weaknessDescription: string | null;
  remediationPlan: string | null;
  scheduledCompletionDate: string | null;
  responsibleRoleId: string | null;
  closedAt: string | Date | null;
  closeoutEvidence: string | null;
  // AG-mandated fields gating the operational_plan_of_action elevator
  // (per AG p.10 "deficiency reviews, milestones, and progress").
  // canPoamElevate() in src/lib/canonical-state/auto-poam.ts enforces:
  //   - deficiencyReviewSummary ≥ 20 chars
  //   - progressSummary non-empty
  //   - originalCompletionDate set (chronic-slippage anchor)
  //   - ≥1 milestone present
  //   - status === 'active'
  //   - not chronic-slipped
  deficiencyReviewSummary: string | null;
  progressSummary: string | null;
  originalCompletionDate: string | null;
  // Per v2.13 page 204: 'operational' (CA.L2-3.12.2, no cap) vs
  // 'assessment' (32 CFR § 170.21, hard 180-day closeout for
  // Conditional Level 2 CMMC Status). Default 'operational'.
  kind: "operational" | "assessment";
  // createdAt is the anchor for the assessment-POA&M 180-day cap.
  createdAt: string | Date;
  milestones: Milestone[];
  closureApprovals: Approval[];
};

export function PoamEntryClient({
  entryId,
  initial,
  roles,
  userRole,
  userId,
}: {
  entryId: string;
  initial: Entry;
  roles: Role[];
  userRole: string;
  userId?: string;
}) {
  const [entry, setEntry] = useState<Entry>(initial);
  const [saving, setSaving] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [closureLoading, setClosureLoading] = useState(false);

  function refetch() {
    fetch(`/api/poam/entries/${entryId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setEntry(data));
  }

  async function saveField(
    field:
      | "weaknessDescription"
      | "remediationPlan"
      | "scheduledCompletionDate"
      | "responsibleRoleId"
      | "deficiencyReviewSummary"
      | "progressSummary"
      | "originalCompletionDate",
    value: string | null
  ) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/poam/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) refetch();
    } finally {
      setSaving(false);
    }
  }

  async function addMilestone() {
    const title = newMilestoneTitle.trim();
    if (!title || addingMilestone) return;
    setAddingMilestone(true);
    try {
      const res = await fetch(`/api/poam/entries/${entryId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setNewMilestoneTitle("");
        refetch();
      }
    } finally {
      setAddingMilestone(false);
    }
  }

  async function toggleMilestoneComplete(mid: string, completed: boolean) {
    const res = await fetch(`/api/poam/entries/${entryId}/milestones/${mid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: completed ? new Date().toISOString() : null }),
    });
    if (res.ok) refetch();
  }

  async function approveClosure() {
    if (closureLoading || entry.status === "closed") return;
    setClosureLoading(true);
    try {
      const res = await fetch(`/api/poam/entries/${entryId}/approve`, { method: "POST" });
      if (res.ok) refetch();
    } finally {
      setClosureLoading(false);
    }
  }

  // C3PAO defensibility: dual-sign-off closure must NOT be available
  // on drafts. A draft has no remediation plan and no milestones — it's
  // a system-flagged stub awaiting human triage. Letting someone close
  // it would close out a gap without ever performing remediation.
  // 'open' (legacy) and 'active' (new) both mean "team is working it"
  // and qualify for closure sign-off.
  const isInProgress = entry.status === "open" || entry.status === "active";
  const canSignOff =
    isInProgress &&
    userRole !== "Assessor" &&
    !entry.closureApprovals.some((a) => a.approverId === userId);
  const approvedByCurrentUser = entry.closureApprovals.some((a) => a.approverId === userId);

  // The pre-contract-gap warning marks an entry's provenance and is
  // relevant on any non-closed entry, including drafts (the auto-POA&M
  // for a pre-contract gap should still surface that context).
  const isPreContractGap =
    entry.status !== "closed" &&
    (entry.weaknessDescription ?? "").toLowerCase().includes(PRE_CONTRACT_MARKER);

  // AG-readiness checklist (mirror of canPoamElevate on the server).
  // When all five gates pass and status is 'active', the operational_
  // plan_of_action elevator fires and the underlying control reads MET
  // on the next rescore.
  const milestoneCount = entry.milestones.length;
  const agChecklist = {
    deficiencyReview:
      (entry.deficiencyReviewSummary ?? "").trim().length >= 20,
    progress: (entry.progressSummary ?? "").trim().length > 0,
    originalCompletion: !!entry.originalCompletionDate,
    milestone: milestoneCount > 0,
    isActive: entry.status === "active" || entry.status === "open",
  };
  const agReady =
    agChecklist.deficiencyReview &&
    agChecklist.progress &&
    agChecklist.originalCompletion &&
    agChecklist.milestone &&
    agChecklist.isActive;

  async function promoteToActive() {
    if (saving) return;
    setSaving(true);
    try {
      // Backfill original_completion_date from scheduled if absent.
      const body: Record<string, unknown> = { status: "active" };
      if (
        !entry.originalCompletionDate &&
        entry.scheduledCompletionDate
      ) {
        body.scheduledCompletionDate = entry.scheduledCompletionDate;
      }
      const res = await fetch(`/api/poam/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {entry.status === "draft" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-amber-900">
                Draft — auto-created stub awaiting human triage
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                The Control Adjudication Engine flagged this control as
                NOT MET and created this stub per the customer&apos;s
                &ldquo;outstanding → POA&amp;M&rdquo; rule. Until you
                fill in the AG-required fields below and promote it to
                <em> active</em>, the underlying control still reads
                NOT MET on the SCTM. <strong>Drafts cannot be closed
                </strong> — they must be triaged into <em>active</em>{" "}
                first, then worked to completion.
              </p>
            </div>
          </div>
        </div>
      )}
      {isPreContractGap && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-amber-900">
                Pre-contract-award gap — close before any CUI lands
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                This POA&amp;M documents a known partial implementation that is
                acceptable today because the system has not yet processed CUI.
                The C3PAO will challenge this control at assessment; the
                milestones below must be complete (and the closeout signed)
                <strong> before the contract goes live and any CUI is stored,
                processed, or transmitted on this boundary.</strong> Do not
                close this POA&amp;M as a paper exercise — verify the
                remediation, re-run the relevant validator, and attach
                operational evidence to the closeout before sign-off.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-zinc-800">Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Weakness / root cause</label>
            <textarea
              value={entry.weaknessDescription ?? ""}
              onChange={(e) => setEntry((prev) => ({ ...prev, weaknessDescription: e.target.value }))}
              onBlur={() => saveField("weaknessDescription", entry.weaknessDescription || null)}
              disabled={entry.status === "closed"}
              rows={3}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Remediation plan</label>
            <textarea
              value={entry.remediationPlan ?? ""}
              onChange={(e) => setEntry((prev) => ({ ...prev, remediationPlan: e.target.value }))}
              onBlur={() => saveField("remediationPlan", entry.remediationPlan || null)}
              disabled={entry.status === "closed"}
              rows={3}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Scheduled completion</label>
            <input
              type="date"
              value={entry.scheduledCompletionDate ?? ""}
              onChange={(e) =>
                setEntry((prev) => ({ ...prev, scheduledCompletionDate: e.target.value || null }))
              }
              onBlur={() =>
                saveField("scheduledCompletionDate", entry.scheduledCompletionDate || null)
              }
              disabled={entry.status === "closed"}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Responsible role</label>
            <select
              value={entry.responsibleRoleId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setEntry((prev) => ({ ...prev, responsibleRoleId: v }));
                saveField("responsibleRoleId", v);
              }}
              disabled={entry.status === "closed"}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-50"
            >
              <option value="">— Select —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {saving && <p className="mt-2 text-xs text-zinc-500">Saving…</p>}
      </div>

      {/*
        POA&M kind selector. Per v2.13 page 204, operational (CA.L2-
        3.12.2) and assessment (32 CFR § 170.21) POA&Ms have different
        regulatory rules. Operational is the default — no cap, routine
        remediation. Assessment is an OSA-declared path that claims a
        Conditional Level 2 CMMC Status, with a hard 180-day closeout.
      */}
      {entry.status !== "closed" && (
        <KindSelector
          entryId={entryId}
          currentKind={entry.kind}
          createdAt={entry.createdAt}
          scheduledCompletionDate={entry.scheduledCompletionDate}
          onChanged={(newKind) => {
            setEntry((prev) => ({ ...prev, kind: newKind }));
            refetch();
          }}
        />
      )}

      {/*
        AG-required fields (gating operational_plan_of_action elevator).
        Per AG p.10, a POA&M only counts as a MET-elevator when the
        deficiency review, progress, milestones, and an anchored
        completion date are all recorded. canPoamElevate() in
        src/lib/canonical-state/auto-poam.ts enforces these on the
        server. The form below MUST exist for a customer to ever ship a
        defensible operational-plan POA&M.
      */}
      {entry.status !== "closed" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-1 font-medium text-zinc-800">
            AG-required deficiency review
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            CMMC AG p.10: temporary deficiencies that include
            &ldquo;deficiency reviews, milestones, and progress towards
            implementation&rdquo; are assessed as MET. These three
            fields are what the C3PAO will read.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-500">
                Deficiency review summary{" "}
                <span className="text-zinc-400">(≥ 20 chars)</span>
              </label>
              <textarea
                value={entry.deficiencyReviewSummary ?? ""}
                onChange={(e) =>
                  setEntry((prev) => ({
                    ...prev,
                    deficiencyReviewSummary: e.target.value,
                  }))
                }
                onBlur={() =>
                  saveField(
                    "deficiencyReviewSummary",
                    entry.deficiencyReviewSummary || null,
                  )
                }
                rows={3}
                placeholder="Summarize the root cause, impact, and what made the control fall short. The C3PAO reads this verbatim."
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-500">
                Progress summary
              </label>
              <textarea
                value={entry.progressSummary ?? ""}
                onChange={(e) =>
                  setEntry((prev) => ({
                    ...prev,
                    progressSummary: e.target.value,
                  }))
                }
                onBlur={() =>
                  saveField("progressSummary", entry.progressSummary || null)
                }
                rows={2}
                placeholder='"No progress yet" is acceptable as a starting point. Update as milestones move.'
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500">
                Original completion date{" "}
                <span className="text-zinc-400">(slippage anchor)</span>
              </label>
              <input
                type="date"
                value={entry.originalCompletionDate ?? ""}
                onChange={(e) =>
                  setEntry((prev) => ({
                    ...prev,
                    originalCompletionDate: e.target.value || null,
                  }))
                }
                onBlur={() =>
                  saveField(
                    "originalCompletionDate",
                    entry.originalCompletionDate || null,
                  )
                }
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Locked once set. A POA&M open &gt;365 days from this
                date or with &gt;2 target pushes is &ldquo;chronic
                slipped&rdquo; and stops elevating per AG p.10.
              </p>
            </div>
          </div>

          {/* AG-readiness checklist */}
          <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Elevator readiness ({Object.values(agChecklist).filter(Boolean).length}/5)
            </p>
            <ul className="space-y-1 text-xs">
              <ChecklistItem
                ok={agChecklist.deficiencyReview}
                label="Deficiency review summary ≥ 20 chars"
              />
              <ChecklistItem
                ok={agChecklist.progress}
                label="Progress summary recorded"
              />
              <ChecklistItem
                ok={agChecklist.originalCompletion}
                label="Original completion date set"
              />
              <ChecklistItem
                ok={agChecklist.milestone}
                label={`At least one milestone (${milestoneCount} present)`}
              />
              <ChecklistItem
                ok={agChecklist.isActive}
                label="Status: active (or legacy 'open')"
              />
            </ul>
            {agReady && (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                ✓ Elevator-ready. The next rescore will mark this
                control MET via operational_plan_of_action.
              </p>
            )}
            {!agReady && entry.status === "draft" && (
              <button
                type="button"
                onClick={promoteToActive}
                disabled={
                  saving ||
                  !agChecklist.deficiencyReview ||
                  !agChecklist.progress ||
                  !agChecklist.milestone
                }
                className="mt-3 rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                title={
                  !agChecklist.deficiencyReview ||
                  !agChecklist.progress ||
                  !agChecklist.milestone
                    ? "Fill in deficiency review, progress, and at least one milestone first."
                    : ""
                }
              >
                {saving ? "Promoting…" : "Promote to active"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-zinc-800">Milestones</h2>
        <ul className="space-y-2">
          {entry.milestones.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50/50 px-3 py-2"
            >
              <span className={m.completedAt ? "text-zinc-500 line-through" : ""}>{m.title}</span>
              <div className="flex items-center gap-2">
                {m.dueDate && (
                  <span className="text-xs text-zinc-500">
                    due {new Date(m.dueDate).toLocaleDateString()}
                  </span>
                )}
                {entry.status !== "closed" && (
                  <button
                    type="button"
                    onClick={() => toggleMilestoneComplete(m.id, !m.completedAt)}
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-50"
                  >
                    {m.completedAt ? "Reopen" : "Complete"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {/* Add-milestone is the primary triage action on a draft —
            adding the first milestone is what auto-promotes draft →
            active on the server. So this input MUST be available on
            drafts, not just open/active items. */}
        {entry.status !== "closed" && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newMilestoneTitle}
              onChange={(e) => setNewMilestoneTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMilestone()}
              placeholder={
                entry.status === "draft"
                  ? "Add the first milestone to activate this POA&M"
                  : "New milestone"
              }
              className="flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={addMilestone}
              disabled={!newMilestoneTitle.trim() || addingMilestone}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {addingMilestone ? "Adding…" : "Add"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-zinc-800">Closure approvals (dual sign-off)</h2>
        <p className="mb-3 text-sm text-zinc-600">Two approvals are required to close this POA&M item.</p>
        <div className="space-y-2">
          {[1, 2].map((order) => {
            const approval = entry.closureApprovals.find((a) => a.approvalOrder === order);
            return (
              <div
                key={order}
                className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50/50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-zinc-700">Approval {order}</span>
                {approval ? (
                  <span className="text-zinc-600">
                    {approval.approverEmail ?? approval.approverId} —{" "}
                    {new Date(approval.attestedAt).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-zinc-400">Pending</span>
                )}
              </div>
            );
          })}
        </div>
        {canSignOff && (
          <button
            type="button"
            onClick={approveClosure}
            disabled={closureLoading}
            className="mt-3 rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {closureLoading ? "Submitting…" : "Approve Closure"}
          </button>
        )}
        {approvedByCurrentUser && isInProgress && (
          <p className="mt-2 text-xs text-zinc-500">You have approved. One more approval required to close.</p>
        )}
        {entry.status === "closed" && (
          <>
            <p className="mt-2 text-sm font-medium text-green-700">
              {entry.closeoutEvidence ? "Closed (attestation uploaded)." : "Closed (dual sign-off complete)."}
            </p>
            {entry.closeoutEvidence && (
              <div className="mt-2 rounded border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-medium text-zinc-600">Closeout evidence</p>
                <p className="mt-1 text-sm text-zinc-700">{entry.closeoutEvidence}</p>
                {entry.closedAt && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Closed {new Date(entry.closedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold leading-none ${
          ok ? "bg-emerald-500 text-white" : "bg-zinc-300 text-white"
        }`}
        aria-hidden
      >
        {ok ? "✓" : "·"}
      </span>
      <span className={ok ? "text-zinc-700" : "text-zinc-500"}>{label}</span>
    </li>
  );
}

/**
 * Kind selector — v2.13 page 204 distinguishes operational (CA.L2-
 * 3.12.2, no closeout cap) from assessment (32 CFR § 170.21, hard
 * 180-day cap, conditions a Conditional Level 2 CMMC Status). Default
 * is operational; the OSA opts into assessment explicitly.
 *
 * The 180-day cap on the assessment path is computed against
 * created_at — surface a live "days remaining / days overdue" hint
 * so the operator sees the consequence of switching.
 */
function KindSelector({
  entryId,
  currentKind,
  createdAt,
  scheduledCompletionDate,
  onChanged,
}: {
  entryId: string;
  currentKind: "operational" | "assessment";
  createdAt: string | Date;
  scheduledCompletionDate: string | null;
  onChanged: (kind: "operational" | "assessment") => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const created = new Date(createdAt);
  const cap = new Date(created.getTime() + 180 * 24 * 3600 * 1000);
  const today = new Date();
  const daysSinceCreated = Math.floor(
    (today.getTime() - created.getTime()) / (24 * 3600 * 1000),
  );
  const daysToCap = Math.floor(
    (cap.getTime() - today.getTime()) / (24 * 3600 * 1000),
  );
  const scheduledExceedsCap =
    scheduledCompletionDate && new Date(scheduledCompletionDate) > cap;

  async function setKind(next: "operational" | "assessment") {
    if (saving || next === currentKind) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/poam/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      onChanged(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="mb-1 font-medium text-zinc-800">POA&amp;M kind</h2>
      <p className="mb-3 text-xs text-zinc-500">
        v2.13 page 204:{" "}
        <em>
          &ldquo;An operational plan of action in accordance with
          CA.L2-3.12.2 differs from a CMMC assessment POA&amp;M as
          described in 32 CFR § 170.21. … Operational plans of action
          are not subject to the 180 day POA&amp;M closeout
          requirement.&rdquo;
        </em>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setKind("operational")}
          disabled={saving}
          className={`rounded-lg border p-3 text-left text-xs transition ${
            currentKind === "operational"
              ? "border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200"
              : "border-zinc-200 bg-white hover:bg-zinc-50"
          } disabled:opacity-50`}
        >
          <p className="font-semibold text-zinc-800">
            Operational
            {currentKind === "operational" && (
              <span className="ml-2 text-[10px] uppercase text-emerald-700">
                · current
              </span>
            )}
          </p>
          <p className="mt-1 text-zinc-600">
            CA.L2-3.12.2 plan of action. <strong>No closeout cap.</strong>{" "}
            Routine remediation; auto-POA&amp;Ms-on-NOT-MET land here by
            default.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setKind("assessment")}
          disabled={saving}
          className={`rounded-lg border p-3 text-left text-xs transition ${
            currentKind === "assessment"
              ? "border-amber-300 bg-amber-50/40 ring-1 ring-amber-200"
              : "border-zinc-200 bg-white hover:bg-zinc-50"
          } disabled:opacity-50`}
        >
          <p className="font-semibold text-zinc-800">
            Assessment
            {currentKind === "assessment" && (
              <span className="ml-2 text-[10px] uppercase text-amber-700">
                · current
              </span>
            )}
          </p>
          <p className="mt-1 text-zinc-600">
            32 CFR § 170.21. <strong>Hard 180-day closeout.</strong> Used
            when the OSA claims a Conditional Level 2 CMMC Status (Self
            / C3PAO / DIBCAC). Scheduled completion must fit within
            created_at + 180d.
          </p>
        </button>
      </div>
      {currentKind === "assessment" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs">
          <p className="font-semibold text-amber-900">
            180-day window status
          </p>
          <p className="mt-1 text-amber-800">
            Created {created.toISOString().slice(0, 10)} ·{" "}
            <span className="font-mono">{daysSinceCreated}d</span> elapsed
            ·{" "}
            <span
              className={`font-mono font-semibold ${
                daysToCap < 0
                  ? "text-rose-700"
                  : daysToCap < 30
                    ? "text-amber-800"
                    : "text-emerald-700"
              }`}
            >
              {daysToCap < 0
                ? `${Math.abs(daysToCap)}d OVERDUE`
                : `${daysToCap}d remaining`}
            </span>{" "}
            of the 180-day closeout cap (closes{" "}
            {cap.toISOString().slice(0, 10)}).
          </p>
          {scheduledExceedsCap && (
            <p className="mt-1 text-rose-700">
              ⚠ Scheduled completion ({scheduledCompletionDate}) exceeds
              the cap. Reduce the date or revert to operational kind.
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-700">Error: {error}</p>}
    </div>
  );
}
