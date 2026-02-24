"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Shield,
  ClipboardList,
  FileText,
  Truck,
  CalendarCheck,
  Target,
  BarChart3,
  Settings,
  Plus,
  UserPlus,
  ClipboardCheck,
} from "lucide-react";

type CommandPaletteProps = {
  user?: { role?: string } | null;
};

const NAV_ITEMS = [
  { value: "nav-overview", label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { value: "nav-controls", label: "Controls", href: "/dashboard/controls", icon: Shield },
  { value: "nav-adjudication", label: "Adjudication", href: "/dashboard/adjudication", icon: ClipboardCheck },
  { value: "nav-poam", label: "POA&M", href: "/dashboard/poam", icon: ClipboardList },
  { value: "nav-evidence", label: "Evidence", href: "/dashboard/evidence", icon: FileText },
  { value: "nav-supply-chain", label: "Supply Chain", href: "/dashboard/supply-chain", icon: Truck },
  { value: "nav-monitoring", label: "Monitoring", href: "/dashboard/monitoring", icon: CalendarCheck },
  { value: "nav-readiness", label: "Readiness", href: "/dashboard/readiness", icon: Target },
  { value: "nav-reporting", label: "Reporting", href: "/dashboard/reporting", icon: BarChart3 },
  { value: "nav-settings", label: "Settings", href: "/dashboard/settings", icon: Settings },
] as const;

export function CommandPalette({ user }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isAssessor = user?.role === "Assessor";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[20%] z-[100] w-full max-w-xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white shadow-xl"
      overlayClassName="fixed inset-0 z-[99] bg-black/20"
      contentClassName="overflow-hidden rounded-xl p-0"
    >
      <Command.Input
        placeholder="Search or run a command…"
        className="w-full border-0 border-b border-slate-200 bg-transparent px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
      />
      <Command.List className="max-h-[min(70vh,400px)] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-sm text-slate-500">
          No results found.
        </Command.Empty>
        <Command.Group heading="Navigate" className="mb-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Command.Item
                key={item.value}
                value={`${item.label} ${item.href}`}
                onSelect={() => run(item.href)}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-900"
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                {item.label}
              </Command.Item>
            );
          })}
        </Command.Group>
        <Command.Group heading="Actions" className="mb-2">
          <Command.Item
            value="Create new POA&M item"
            onSelect={() => run("/dashboard/poam")}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-900"
          >
            <Plus className="h-4 w-4 shrink-0 text-slate-500" />
            Create new POA&M item
          </Command.Item>
          <Command.Item
            value="Invite subcontractor"
            onSelect={() => run("/dashboard/supply-chain")}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-900"
          >
            <UserPlus className="h-4 w-4 shrink-0 text-slate-500" />
            Invite subcontractor
          </Command.Item>
          {isAssessor && (
            <Command.Item
              value="Switch to Assessor View"
              onSelect={() => run("/assessor")}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-900"
            >
              <ClipboardCheck className="h-4 w-4 shrink-0 text-slate-500" />
              Switch to Assessor View
            </Command.Item>
          )}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
