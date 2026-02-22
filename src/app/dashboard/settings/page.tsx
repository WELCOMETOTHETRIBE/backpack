import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import SettingsForm from "./SettingsForm";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Settings</h1>
        <p className="mt-2 text-gray-600">Manage your organization and account settings</p>
      </div>

      <SettingsForm
        organization={org}
        user={currentUser}
        userRole={user.role}
      />
    </div>
  );
}
