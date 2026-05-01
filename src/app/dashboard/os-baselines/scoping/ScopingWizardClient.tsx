"use client";

import { useRouter } from "next/navigation";
import { OrgProfileForm } from "@/components/boundary-wizard/OrgProfileForm";

interface Props {
  initialData: {
    systemName: string | null;
    systemDescription: string | null;
    authorizationBoundaryStatement: string | null;
    systemOwnerName: string | null;
    systemOwnerEmail: string | null;
    issoName: string | null;
    issoEmail: string | null;
    cuiCategories: string[] | null;
    externalServiceProviders: Array<{
      name: string;
      serviceType: string;
      dataTypes: string[];
      inheritedControls: string[];
      website?: string;
    }> | null;
    boundaryNarrative: string | null;
    boundaryScopingCompletedAt: Date | null;
  };
}

/**
 * /dashboard/os-baselines/scoping client. Uses the same OrgProfileForm
 * as /dashboard/boundary/scoping — single source of truth for editing
 * the customer-specific organization profile. Returns to the OS Baselines
 * page on completion.
 */
export function ScopingWizardClient({ initialData }: Props) {
  const router = useRouter();

  const handleComplete = () => {
    router.push("/dashboard/os-baselines");
    router.refresh();
  };

  return (
    <OrgProfileForm
      initialData={{
        systemName: initialData.systemName ?? "",
        systemDescription: initialData.systemDescription ?? "",
        authorizationBoundaryStatement: initialData.authorizationBoundaryStatement ?? "",
        systemOwnerName: initialData.systemOwnerName ?? "",
        systemOwnerEmail: initialData.systemOwnerEmail ?? "",
        issoName: initialData.issoName ?? "",
        issoEmail: initialData.issoEmail ?? "",
        cuiCategories: initialData.cuiCategories ?? [],
        externalServiceProviders: initialData.externalServiceProviders ?? [],
        boundaryNarrative: initialData.boundaryNarrative ?? "",
      }}
      onComplete={handleComplete}
    />
  );
}
