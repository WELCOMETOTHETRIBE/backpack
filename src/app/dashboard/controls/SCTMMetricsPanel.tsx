"use client";

import React from "react";

export type ComplianceMetrics = {
  completedControls: number;
  totalControls: number;
  domainMetrics: Record<string, { total: number; completed: number }>;
};

interface SCTMMetricsPanelProps {
  metrics: ComplianceMetrics;
}

export function SCTMMetricsPanel({ metrics }: SCTMMetricsPanelProps) {
  const domainOrder = ["AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP", "PS", "PE", "RA", "CA", "SC", "SI"];

  return (
    <div className="rounded-xl border border-[var(--color-border)]/60 bg-white p-5 shadow-sm space-y-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">
        Compliance
      </h3>

      <div>
        <p className="text-sm font-medium text-[var(--color-gray-900)]">
          {metrics.completedControls} of {metrics.totalControls} controls adjudicated
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--color-gray-600)] mb-2">By domain</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {domainOrder.map((code) => {
            const stats = metrics.domainMetrics[code];
            if (!stats || stats.total === 0) return null;
            const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
            return (
              <div key={code} className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium w-6 text-[var(--color-gray-700)]">{code}</span>
                <div className="flex-1 h-1.5 bg-[var(--color-gray-100)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-blue-accent)] rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--color-gray-500)] w-10 text-right tabular-nums">
                  {stats.completed}/{stats.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
