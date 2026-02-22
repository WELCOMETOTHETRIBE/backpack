"use client";

import { useState } from "react";
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      // TODO: Implement settings update API
      setMessage("Settings saved successfully!");
    } catch (err) {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Organization Settings */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3B82F6]/10">
            <Building2 className="h-5 w-5 text-[#3B82F6]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">Organization</h2>
            <p className="text-sm text-gray-600">Organization details and configuration</p>
          </div>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Organization Name</label>
            <input
              type="text"
              defaultValue={organization?.name || ""}
              disabled
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-500">Organization name cannot be changed</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Organization Slug</label>
            <input
              type="text"
              defaultValue={organization?.slug || ""}
              disabled
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-500">Organization slug cannot be changed</p>
          </div>
        </form>
      </div>

      {/* User Account Settings */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#10B981]/10">
            <User className="h-5 w-5 text-[#10B981]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">Account</h2>
            <p className="text-sm text-gray-600">Your account information and preferences</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              defaultValue={user?.email || ""}
              disabled
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              defaultValue={user?.name || ""}
              disabled
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <div className="mt-1 flex items-center gap-2">
              <Shield className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-900">{userRole || user?.role || "—"}</span>
            </div>
          </div>
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

      {message && (
        <div
          className={`rounded-lg border p-4 ${
            message.includes("success")
              ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
              : "border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
