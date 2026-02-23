"use client";

import { useState, useEffect } from "react";
import { UserPlus, Mail, Trash2 } from "lucide-react";

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

export default function InviteTeamSection() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("Compliance");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    fetch("/api/invitations")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Invitation[]) => setInvitations(Array.isArray(list) ? list : []))
      .catch(() => setInvitations([]))
      .finally(() => setLoadingList(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to send invitation");
        return;
      }
      setSuccess("Invitation sent. They will receive an email with a link to join.");
      setEmail("");
      const listRes = await fetch("/api/invitations");
      const list = await listRes.json().catch(() => []);
      setInvitations(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== id));
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8B5CF6]/10">
          <UserPlus className="h-5 w-5 text-[#8B5CF6]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A]">Invite user</h2>
          <p className="text-sm text-gray-600">Invite a team member to your organization by email</p>
        </div>
      </div>
      <form onSubmit={handleInvite} className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
            required
          />
        </div>
        <div className="w-36">
          <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
          >
            <option value="Compliance">Compliance</option>
            <option value="Admin">Admin</option>
            <option value="Assessor">Assessor</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send invitation"}
        </button>
      </form>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mb-2 text-sm text-green-600">{success}</p>}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700">Pending invitations</h3>
        {loadingList ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-gray-500">No pending invitations</p>
        ) : (
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  {inv.email}
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
                    {inv.role}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRevoke(inv.id)}
                  className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-red-600"
                  aria-label="Revoke invitation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
