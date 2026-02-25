"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import type { ComplianceMetrics } from "./useComplianceMetrics";

interface SCTMMetricsPanelProps {
  metrics: ComplianceMetrics;
}

export function SCTMMetricsPanel({ metrics }: SCTMMetricsPanelProps) {
  const priorityData = [
    { name: "High (5)", value: metrics.priorityDistribution.sprs5, fill: "var(--color-status-red)" },
    { name: "Medium (3)", value: metrics.priorityDistribution.sprs3, fill: "var(--color-status-amber)" },
    { name: "Basic (1)", value: metrics.priorityDistribution.sprs1, fill: "var(--color-blue-accent)" },
  ];

  const domainOrder = ["AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP", "PS", "PE", "RA", "CA", "SC", "SI"];

  return (
    <div className="rounded-xl border border-[var(--color-border)]/60 bg-white p-5 shadow-sm space-y-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">
        Compliance
      </h3>

      {/* Overall score */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
              fill="none"
              stroke="var(--color-gray-200)"
              strokeWidth="3"
            />
            <path
              d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
              fill="none"
              stroke="var(--color-blue-accent)"
              strokeWidth="3"
              strokeDasharray={`${(metrics.complianceScore / 100) * 97.3} 97.3`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-[var(--color-gray-900)]">{metrics.complianceScore}%</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--color-gray-900)]">
            {metrics.completedControls} of {metrics.totalControls} controls
          </p>
          <p className="text-xs text-[var(--color-gray-500)]">adjudicated (SPRS-weighted)</p>
        </div>
      </div>

      {/* Priority distribution */}
      <div>
        <p className="text-xs font-medium text-[var(--color-gray-600)] mb-2">Priority distribution</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={priorityData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Domain progress */}
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
