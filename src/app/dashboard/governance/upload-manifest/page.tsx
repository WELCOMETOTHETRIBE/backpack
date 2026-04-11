import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import UploadGovernanceClient from "./UploadGovernanceClient";

export default async function UploadGovernanceManifestPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Only Admin and Compliance can ingest governance manifests
  const role = user?.role ?? "";
  if (!["Admin", "Compliance"].includes(role)) {
    redirect("/dashboard/governance");
  }

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Ingest Governance Manifest
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload the <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">governance-manifest.json</span> from your
            MacTech CUI Vault Governance Bundle. This will register all policy documents and
            automatically mark policy lanes as satisfied on dual-evidence controls.
          </p>
        </div>
        <UploadGovernanceClient />
      </div>
    </div>
  );
}
