"use client";

import { useState, useEffect } from "react";
import {
  UserPlus,
  KeyRound,
  Users,
  Eye,
  EyeOff,
  Check,
  X,
  Shield,
  ShieldCheck,
  Mail,
  MoreVertical,
  Search,
  UserCog,
  Trash2,
} from "lucide-react";

type UserType = "general" | "privileged";

type OrgUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  cuiAccessLevel: UserType;
};

interface BoundaryUser {
  id: string;
  email: string;
  name: string | null;
  userType: UserType;
  role: string;
}

export default function AdminUserManagement() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Tabs
  const [activeTab, setActiveTab] = useState<"directory" | "create">("directory");

  // Create user form state
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<string>("Compliance");
  const [createUserType, setCreateUserType] = useState<UserType>("general");
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

  // CUI access level is now persisted on the user row (migration 0064).
  // Reads come straight from /api/admin/users; writes go through the
  // PATCH /api/admin/users/[id]/cui-access-level endpoint.
  const [savingUserType, setSavingUserType] = useState<string | null>(null);
  const [userTypeError, setUserTypeError] = useState<string>("");

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

  async function saveUserType(userId: string, type: UserType): Promise<void> {
    setUserTypeError("");
    setSavingUserType(userId);
    // Optimistic update so the dropdown reflects the choice immediately.
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, cuiAccessLevel: type } : u)),
    );
    try {
      const res = await fetch(`/api/admin/users/${userId}/cui-access-level`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuiAccessLevel: type }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setUserTypeError(data.error ?? "Failed to update CUI access level");
        // Roll back optimistic update.
        await fetchUsers();
      }
    } catch {
      setUserTypeError("Network error — please try again");
      await fetchUsers();
    } finally {
      setSavingUserType(null);
    }
  }

  function getUserType(userId: string): UserType {
    return users.find((u) => u.id === userId)?.cuiAccessLevel ?? "general";
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

      // Save CUI access level for boundary tracking. Await so a failure
      // surfaces before we declare success.
      if (createUserType !== "general") {
        await saveUserType(data.id, createUserType);
      }

      setCreateSuccess(`User "${data.email}" created successfully.`);
      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      setCreateRole("Compliance");
      setCreateUserType("general");
      fetchUsers();
      
      // Switch to directory tab after successful creation
      setTimeout(() => {
        setActiveTab("directory");
        setCreateSuccess("");
      }, 2000);
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

      setResetSuccess(`Password reset successfully.`);
      setResetUserId(null);
      setResetPassword("");
      setTimeout(() => setResetSuccess(""), 3000);
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

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.name?.toLowerCase() ?? "").includes(searchQuery.toLowerCase())
  );

  const privilegedCount = users.filter((u) => getUserType(u.id) === "privileged").length;
  const generalCount = users.length - privilegedCount;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">{users.length} users</span>
        </div>
        <div className="h-4 w-px bg-slate-300" />
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          <span className="text-sm text-slate-600">{generalCount} general</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-violet-500" />
          <span className="text-sm text-slate-600">{privilegedCount} privileged</span>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
        <button
          onClick={() => setActiveTab("directory")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "directory"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <UserCog className="h-4 w-4" />
          User Directory
        </button>
        <button
          onClick={() => {
            setActiveTab("create");
            setCreateError("");
            setCreateSuccess("");
          }}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "create"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Success/Error messages */}
      {resetSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check className="mr-2 inline h-4 w-4" />
          {resetSuccess}
        </div>
      )}

      {/* Directory Tab */}
      {activeTab === "directory" && (
        <div className="space-y-3">
          {userTypeError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {userTypeError}
            </div>
          )}
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name or email..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* User table */}
          {loadingUsers ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              <Users className="mr-2 h-4 w-4 animate-pulse" />
              Loading users…
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 py-12">
              <Users className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                {searchQuery ? "No users match your search" : "No users in your organization"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setActiveTab("create")}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Add your first user
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      User
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                      title="Trust Codex platform role — controls in-app permissions (manage settings, edit controls, sign attestations)."
                    >
                      Codex Role
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                      title="CUI environment privilege — drives whether AT.L2-3.2.2 role-based training is required. Independent of Codex Role."
                    >
                      CUI Access
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => {
                    const userType = getUserType(user.id);
                    return (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
                              {(user.name?.[0] ?? user.email[0]).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">
                                {user.name || "Unnamed User"}
                              </p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              user.role === "Admin"
                                ? "bg-red-100 text-red-700"
                                : user.role === "Assessor"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={userType}
                            disabled={savingUserType === user.id}
                            onChange={(e) =>
                              saveUserType(user.id, e.target.value as UserType)
                            }
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${
                              userType === "privileged"
                                ? "border-violet-200 bg-violet-50 text-violet-700"
                                : "border-blue-200 bg-blue-50 text-blue-700"
                            }`}
                          >
                            <option value="general">General User</option>
                            <option value="privileged">Privileged User</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {resetUserId === user.id ? (
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <input
                                    type={showResetPassword ? "text" : "password"}
                                    value={resetPassword}
                                    onChange={(e) => setResetPassword(e.target.value)}
                                    placeholder="New password"
                                    minLength={8}
                                    className="w-36 rounded-lg border border-slate-300 px-3 py-1.5 pr-8 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowResetPassword(!showResetPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
                                  className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
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
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                Reset Password
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {resetError && (
                <div className="border-t border-slate-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                  {resetError}
                </div>
              )}
            </div>
          )}

          {/* Help text */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-600">
              <strong className="font-semibold text-slate-700">CUI Access</strong> (separate from Codex Role) determines training requirements:
              <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                <Shield className="h-3 w-3" />
                General Users
              </span>{" "}
              require 3.2.1 (Security Awareness) and 3.2.3 (Insider Threat).{" "}
              <span className="ml-2 inline-flex items-center gap-1 text-violet-600">
                <ShieldCheck className="h-3 w-3" />
                Privileged Users
              </span>{" "}
              additionally require 3.2.2 (Role-Based Training).
            </p>
          </div>
        </div>
      )}

      {/* Create User Tab */}
      {activeTab === "create" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-slate-900">Create New User Account</h3>
            <p className="mt-1 text-sm text-slate-500">
              Add a new user to your organization. They will be able to sign in immediately with the credentials you provide.
            </p>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-5" autoComplete="off">
            {/* Decoys to defeat Chrome's aggressive autofill on admin create-user forms */}
            <input type="text" name="fakeusernameremembered" style={{ display: "none" }} />
            <input type="password" name="fakepasswordremembered" style={{ display: "none" }} />
            {/* User Details Section */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                User Details
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="new-user-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Jane Smith"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="new-user-email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="jane@company.com"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Credentials Section */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Credentials
              </h4>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Initial Password <span className="text-red-500">*</span>
                </label>
                <div className="relative max-w-md">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    name="new-user-password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  >
                    {showCreatePassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  The user should change this password after their first sign-in.
                </p>
              </div>
            </div>

            {/* Access & Classification Section */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Access & Classification
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    System Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Compliance">Compliance</option>
                    <option value="Admin">Admin</option>
                    <option value="Assessor">Assessor</option>
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Controls access to platform features
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    CUI Access Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createUserType}
                    onChange={(e) => setCreateUserType(e.target.value as UserType)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="general">General User</option>
                    <option value="privileged">Privileged User</option>
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Privileged users require additional role-based training (3.2.2)
                  </p>
                </div>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <div>
                {createError && <p className="text-sm text-red-600">{createError}</p>}
                {createSuccess && (
                  <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <Check className="h-4 w-4" />
                    {createSuccess}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("directory");
                    setCreateEmail("");
                    setCreateName("");
                    setCreatePassword("");
                    setCreateRole("Compliance");
                    setCreateUserType("general");
                    setCreateError("");
                    setCreateSuccess("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createLoading ? (
                    <>Creating…</>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
