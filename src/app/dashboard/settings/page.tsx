import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import SettingsForm from "./SettingsForm";
import InviteTeamSection from "./InviteTeamSection";
import ScopingPresetsCard from "./ScopingPresetsCard";
import AdminUserManagement from "./AdminUserManagement";
import { ALL_PRESETS } from "@/lib/compliance/scoping-presets";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Fetch organization details
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // Fetch current user details
  const [currentUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id!))
    .limit(1);

  const cardClass = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">Settings</h1>
        <p className="mt-2 text-gray-600">Manage your organization and account settings.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className={cardClass}>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Organization & account</h2>
          <SettingsForm
            organization={org}
            user={currentUser}
            userRole={user.role}
          />
        </div>

        {(user.role === "Admin" || user.role === "Compliance") && (
          <div className={cardClass}>
            <h2 className="mb-4 text-sm font-semibold text-slate-800">Invite team</h2>
            <InviteTeamSection />
          </div>
        )}

        {user.role === "Admin" && (
          <div className={cardClass}>
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-800">User Management</h2>
              <p className="mt-1 text-xs text-slate-500">
                Manage user accounts and classify users as General or Privileged for CMMC training compliance tracking.
              </p>
            </div>
            <AdminUserManagement />
          </div>
        )}

        {(user.role === "Admin" || user.role === "Compliance") && (
          <div className={cardClass}>
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Architecture scoping presets</h2>
            <p className="mb-4 text-xs text-slate-500">
              Apply Not Applicable designations based on your system architecture. Only controls in{" "}
              <span className="font-medium">Not Started</span> or{" "}
              <span className="font-medium">In Progress</span> status are affected — Assessed, Inherited,
              and Implemented controls are never overwritten.
            </p>
            <ScopingPresetsCard presets={ALL_PRESETS} />
          </div>
        )}
      </div>
    </div>
  );
}
