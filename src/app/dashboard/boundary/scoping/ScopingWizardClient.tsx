"use client";

import { useRouter } from "next/navigation";
import { BoundaryScopingWizard } from "@/components/boundary-wizard/BoundaryScopingWizard";

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

export function ScopingWizardClient({ initialData }: Props) {
  const router = useRouter();

  const handleComplete = () => {
    router.push("/dashboard/boundary");
    router.refresh();
  };

  return (
    <BoundaryScopingWizard
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
