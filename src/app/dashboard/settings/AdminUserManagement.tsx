"use client";

import { useState, useEffect } from "react";
import { UserPlus, KeyRound, Users, Eye, EyeOff, Check, X } from "lucide-react";

type OrgUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export default function AdminUserManagement() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Create user form state
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<string>("Compliance");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Reset password state
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    setCreateLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail.trim(),
          name: createName.trim() || undefined,
          password: createPassword,
          role: createRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create user");
        return;
      }

      setCreateSuccess(`User ${data.email} created successfully.`);
      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      setCreateRole("Compliance");
      fetchUsers();
    } catch {
      setCreateError("Network error — please try again");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleResetPassword(userId: string) {
    setResetError("");
    setResetSuccess("");
    setResetLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error ?? "Failed to reset password");
        return;
      }

      setResetSuccess(`Password for ${data.email} has been reset.`);
      setResetUserId(null);
      setResetPassword("");
    } catch {
      setResetError("Network error — please try again");
    } finally {
      setResetLoading(false);
    }
  }

  function cancelReset() {
    setResetUserId(null);
    setResetPassword("");
    setResetError("");
    setShowResetPassword(false);
  }

  return (
    <div className="space-y-6">
      {/* Create User Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <UserPlus className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">Create user account</h2>
            <p className="text-sm text-gray-600">
              Directly create a new user account with a password
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="user@company.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCreatePassword ? "text" : "password"}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                >
                  {showCreatePassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Compliance">Compliance</option>
                <option value="Admin">Admin</option>
                <option value="Assessor">Assessor</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}
              {createSuccess && (
                <p className="text-sm text-emerald-600">{createSuccess}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={createLoading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createLoading ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>

      {/* User List & Password Reset Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10">
            <KeyRound className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">User password reset</h2>
            <p className="text-sm text-gray-600">
              Reset passwords for users in your organization
            </p>
          </div>
        </div>

        {resetSuccess && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {resetSuccess}
          </div>
        )}

        {loadingUsers ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="h-4 w-4 animate-pulse" />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">No users found in your organization.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {user.name || "—"}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {resetUserId === user.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="relative">
                            <input
                              type={showResetPassword ? "text" : "password"}
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              placeholder="New password"
                              minLength={8}
                              className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowResetPassword(!showResetPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showResetPassword ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleResetPassword(user.id)}
                            disabled={resetLoading || resetPassword.length < 8}
                            className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700 disabled:opacity-50"
                            title="Confirm reset"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelReset}
                            className="rounded-lg border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setResetUserId(user.id);
                            setResetError("");
                            setResetSuccess("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset password
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resetError && (
              <div className="border-t border-gray-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                {resetError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
