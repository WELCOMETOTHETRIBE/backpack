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
 * Boundary "scoping" client — historically a 6-step wizard that duplicated
 * onboarding inputs and asked customers to "choose" architecture details
 * that are now constants (Win 2025 + Azure Gov). Replaced with a slim
 * single-page edit form (OrgProfileForm) that keeps only the genuinely
 * customer-specific fields. The route name is preserved for backward-compat
 * with the boundary page link.
 */
export function ScopingWizardClient({ initialData }: Props) {
  const router = useRouter();

  const handleComplete = () => {
    router.push("/dashboard/boundary");
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
