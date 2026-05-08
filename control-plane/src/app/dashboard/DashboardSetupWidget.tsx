"use client";

import { useState } from "react";
import {
  Settings2,
  ChevronRight,
  CheckCircle2,
  Circle,
  ArrowRight,
  Server,
  Compass,
  Shield,
  FileCheck,
  Award,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";

export interface ChecklistItem {
  label: string;
  description: string;
  done: boolean;
  href: string;
  hint?: string;
}

export interface ChecklistStage {
  key: string;
  title: string;
  subtitle: string;
  items: ChecklistItem[];
}

const STAGE_ICONS: Record<string, typeof Compass> = {
  onboarding: Compass,
  foundation: Server,
  adjudication: FileCheck,
  defensible: Shield,
  certifiable: Award,
};

export function DashboardSetupWidget({
  onboardingStarted,
}: {
  onboardingStarted: boolean;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F172A] mb-1">
          {onboardingStarted ? "CMMC Certification Journey" : "Welcome to CMMC Codex"}
        </h1>
        <p className="text-[15px] text-slate-600">
          {onboardingStarted
            ? "Track your path to C3PAO assessment in the Readiness tab."
            : "Set up your MacTech CUI Vault to begin your CMMC Level 2 certification path."}
        </p>
      </div>
      <Link
        href="/welcome"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <Settings2 className="h-4 w-4" />
        {onboardingStarted ? "Edit setup" : "Start Vault setup"}
      </Link>
    </div>
  );
}

export function CertificationJourneyWidget({ stages }: { stages: ChecklistStage[] }) {
  const allItems = stages.flatMap((s) => s.items);
  const completedCount = allItems.filter((c) => c.done).length;
  const totalCount = allItems.length;
  const allDone = completedCount === totalCount && totalCount > 0;
  const activeStageIndex = stages.findIndex((s) => s.items.some((i) => !i.done));

  if (allDone) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-900">Ready for C3PAO assessment</h3>
            <p className="mt-0.5 text-sm text-emerald-700">
              All 110 controls are adjudicated, evidence is current, and your SSP is defensible. Export your assessment package from the SSP tab when you&rsquo;re ready.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800">Path to C3PAO Assessment</h3>
          <span className="text-xs font-medium text-slate-500">
            {completedCount} / {totalCount} milestones
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
            style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          {stages.map((s, i) => {
            const stageDone = s.items.every((it) => it.done);
            const isActive = i === activeStageIndex;
            const Icon = STAGE_ICONS[s.key] ?? Compass;
            return (
              <div key={s.key} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                    stageDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isActive
                      ? "border-[#0F172A] bg-white text-[#0F172A]"
                      : "border-slate-200 bg-white text-slate-300"
                  }`}
                >
                  {stageDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide text-center ${
                    stageDone
                      ? "text-emerald-600"
                      : isActive
                      ? "text-[#0F172A]"
                      : "text-slate-400"
                  }`}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {stages.map((stage, si) => (
          <StageGroup
            key={stage.key}
            stage={stage}
            stageNumber={si + 1}
            isActive={si === activeStageIndex}
            isLocked={si > activeStageIndex && activeStageIndex !== -1}
          />
        ))}
      </div>
    </div>
  );
}

export function VaultSetupCTA() {
  return (
    <Link
      href="/welcome"
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/80 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F172A]/10">
          <Server className="h-5 w-5 text-[#0F172A]" />
        </div>
        <div>
          <h3 className="font-semibold text-[#0F172A]">Set up your MacTech CUI Vault</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Configure your Windows Server 2025 Datacenter VM in Azure Government and begin your CMMC Level 2 certification.
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
    </Link>
  );
}

function StageGroup({
  stage,
  stageNumber,
  isActive,
  isLocked,
}: {
  stage: ChecklistStage;
  stageNumber: number;
  isActive: boolean;
  isLocked: boolean;
}) {
  const stageComplete = stage.items.every((i) => i.done);
  const [open, setOpen] = useState(isActive && !stageComplete);

  const doneInStage = stage.items.filter((i) => i.done).length;
  const totalInStage = stage.items.length;
  const Icon = STAGE_ICONS[stage.key] ?? Compass;

  return (
    <div className={isLocked ? "opacity-60" : ""}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
      >
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            stageComplete
              ? "bg-emerald-100 text-emerald-600"
              : isActive
              ? "bg-[#0F172A] text-white"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {stageComplete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4.5 w-4.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
              Stage {stageNumber}
            </span>
            {stageComplete && (
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">
                Complete
              </span>
            )}
            {isActive && !stageComplete && (
              <span className="text-[10px] font-semibold text-[#0F172A] uppercase tracking-wide">
                In progress
              </span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-slate-800">{stage.title}</h4>
          <p className="text-xs text-slate-500 mt-0.5">{stage.subtitle}</p>
        </div>
        <span className="text-xs font-medium text-slate-500 shrink-0">
          {doneInStage} / {totalInStage}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 space-y-2">
          {stage.items.map((item, i) => (
            <Link
              key={i}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                item.done ? "bg-emerald-50/50" : "bg-slate-50 hover:bg-slate-100"
              }`}
            >
              {item.done ? (
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-4.5 w-4.5 shrink-0 text-slate-300" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    item.done ? "text-slate-500 line-through" : "text-slate-800"
                  }`}
                >
                  {item.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                {item.hint && !item.done && (
                  <p className="text-[11px] text-amber-700 mt-1 italic">💡 {item.hint}</p>
                )}
              </div>
              {!item.done && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
