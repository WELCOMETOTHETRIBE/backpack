"use client";

import { useMemo } from "react";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import type { SctmOptimizedControl } from "@/lib/sctm-optimized-types";

const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];

export interface ComplianceMetrics {
  totalControls: number;
  completedControls: number;
  complianceScore: number;
  domainMetrics: Record<
    string,
    { total: number; completed: number; sprs5: number; sprs3: number; sprs1: number }
  >;
  priorityDistribution: { sprs5: number; sprs3: number; sprs1: number };
}

export interface RecordForMetrics {
  controlId: string;
  implementationStatus: string;
}

export function useComplianceMetrics(
  records: RecordForMetrics[],
  optimizedByControlId: Record<string, SctmOptimizedControl>
): ComplianceMetrics {
  return useMemo(() => {
    const adjudicatedIds = new Set(
      records.filter((r) => ADJUDICATED.includes(r.implementationStatus)).map((r) => r.controlId)
    );

    const domainMetrics: ComplianceMetrics["domainMetrics"] = {};
    let totalControls = 0;
    let totalCompleted = 0;
    let totalSPRS = 0;
    let completedSPRS = 0;
    const priorityDistribution = { sprs5: 0, sprs3: 0, sprs1: 0 };

    for (const controlId of ALL_CONTROL_IDS) {
      const opt = optimizedByControlId[controlId];
      const sprs = opt?.scoring?.sprs ?? 1;
      const prefix = controlId.split(".").slice(0, 2).join(".");
      const domain = CONTROL_FAMILIES.find((f) => f.controlPrefix === prefix)?.code ?? "AC";
      if (!domainMetrics[domain]) {
        domainMetrics[domain] = { total: 0, completed: 0, sprs5: 0, sprs3: 0, sprs1: 0 };
      }

      domainMetrics[domain].total++;
      totalControls++;
      if (sprs === 5) {
        domainMetrics[domain].sprs5++;
        priorityDistribution.sprs5++;
      } else if (sprs === 3) {
        domainMetrics[domain].sprs3++;
        priorityDistribution.sprs3++;
      } else {
        domainMetrics[domain].sprs1++;
        priorityDistribution.sprs1++;
      }
      totalSPRS += sprs;

      if (adjudicatedIds.has(controlId)) {
        domainMetrics[domain].completed++;
        totalCompleted++;
        completedSPRS += sprs;
      }
    }

    const complianceScore = totalSPRS > 0 ? Math.round((completedSPRS / totalSPRS) * 100) : 0;

    return {
      totalControls,
      completedControls: totalCompleted,
      complianceScore,
      domainMetrics,
      priorityDistribution,
    };
  }, [records, optimizedByControlId]);
}
