"use client";

import { Building2, User, Shield } from "lucide-react";

interface SettingsFormProps {
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  } | null;
  userRole?: string;
}

export default function SettingsForm({ organization, user, userRole }: SettingsFormProps) {
  return (
    <div className="space-y-6">
      {/* Organization + Account — read-only identity cards (not a create-user form) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <Building2 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Organization</h2>
              <p className="text-xs text-slate-500">Read-only identity</p>
            </div>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900">{organization?.name || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Slug</dt>
              <dd className="font-mono text-xs text-slate-700">{organization?.slug || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <User className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Signed in as</h2>
              <p className="text-xs text-slate-500">Your profile on this tenant</p>
            </div>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900">{user?.name || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="truncate text-slate-700">{user?.email || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Role</dt>
              <dd className="inline-flex items-center gap-1.5 text-slate-900">
                <Shield className="h-3.5 w-3.5 text-slate-400" />
                {userRole || user?.role || "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* System Information */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">System Information</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Platform Version</span>
            <span className="font-medium text-gray-900">CMMC OS v1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Compliance Framework</span>
            <span className="font-medium text-gray-900">NIST SP 800-171 Rev 2</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Controls</span>
            <span className="font-medium text-gray-900">110</span>
          </div>
        </div>
      </div>

    </div>
  );
}
