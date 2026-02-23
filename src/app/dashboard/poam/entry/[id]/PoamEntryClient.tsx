"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  status: "open" | "closed";
  weaknessDescription: string | null;
  remediationPlan: string | null;
  scheduledCompletionDate: string | null;
  responsibleRoleId: string | null;
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
    field: "weaknessDescription" | "remediationPlan" | "scheduledCompletionDate" | "responsibleRoleId",
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

  const canSignOff =
    entry.status === "open" &&
    userRole !== "Assessor" &&
    !entry.closureApprovals.some((a) => a.approverId === userId);
  const approvedByCurrentUser = entry.closureApprovals.some((a) => a.approverId === userId);

  return (
    <div className="space-y-6">
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
                {entry.status === "open" && (
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
        {entry.status === "open" && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newMilestoneTitle}
              onChange={(e) => setNewMilestoneTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMilestone()}
              placeholder="New milestone"
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
        {approvedByCurrentUser && entry.status === "open" && (
          <p className="mt-2 text-xs text-zinc-500">You have approved. One more approval required to close.</p>
        )}
        {entry.status === "closed" && (
          <p className="mt-2 text-sm font-medium text-green-700">Closed (dual sign-off complete).</p>
        )}
      </div>
    </div>
  );
}
