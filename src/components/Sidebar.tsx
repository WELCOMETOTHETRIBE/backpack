"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  FileText,
  FolderOpen,
  Network,
  CheckCircle2,
  Activity,
  Settings,
  FileStack,
  BookMarked,
  Server,
  Cpu,
  BookCheck,
  BarChart2,
  GraduationCap,
  MessageSquare,
} from "lucide-react";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  statusDot?: "green" | "amber" | null;
};

type NavGroup = {
  label: string | null;
  items: NavItem[];
};

function buildNav(boundaryComplete?: boolean | null): NavGroup[] {
  return [
    {
      label: "Compliance",
      items: [
        { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
        { name: "SCTM", href: "/dashboard/controls", icon: Shield },
        { name: "Governance", href: "/dashboard/governance", icon: BookMarked },
        { name: "Technical", href: "/dashboard/technical", icon: BarChart2 },
        { name: "Registers", href: "/dashboard/registers", icon: BookCheck },
        { name: "POA&M", href: "/dashboard/poam", icon: FileText },
      ],
    },
    {
      label: "Infrastructure",
      items: [
        {
          name: "System Boundary",
          href: "/dashboard/boundary",
          icon: Server,
          statusDot: boundaryComplete === true ? "green" : boundaryComplete === false ? "amber" : null,
        },
        { name: "OS Baselines", href: "/dashboard/os-baselines", icon: Cpu },
        { name: "Upload Evidence", href: "/dashboard/technical/upload", icon: FolderOpen },
      ],
    },
    {
      label: "Program",
      items: [
        { name: "Documents", href: "/dashboard/documents", icon: FileStack },
        { name: "SSP", href: "/dashboard/ssp", icon: FileText },
        { name: "Training", href: "/dashboard/training", icon: GraduationCap },
        { name: "Supply Chain", href: "/dashboard/supply-chain", icon: Network },
        { name: "Readiness", href: "/dashboard/readiness", icon: CheckCircle2 },
        { name: "Monitoring", href: "/dashboard/monitoring", icon: Activity },
      ],
    },
    {
      label: null,
      items: [
        { name: "Feedback", href: "/dashboard/feedback", icon: MessageSquare },
        { name: "Settings", href: "/dashboard/settings", icon: Settings },
      ],
    },
  ];
}

export default function Sidebar({
  boundaryComplete,
}: {
  boundaryComplete?: boolean | null;
}) {
  const pathname = usePathname();
  const navGroups = buildNav(boundaryComplete);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(href + "/"));

  return (
    <aside
      className="flex h-screen w-60 flex-col bg-[#0F172A]"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5 border-b border-white/10">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500">
            <Shield className="h-4 w-4 text-white" aria-hidden />
          </div>
          <div>
            <span className="block text-[13px] font-semibold leading-tight text-white">
              Trust Codex
            </span>
            <span className="block text-[10px] font-medium leading-tight text-white/40 tracking-wide uppercase">
              CMMC Level 2
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        <div className="space-y-5">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                          active
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/6 hover:text-white/90"
                        }`}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="flex items-center gap-3">
                          <item.icon
                            className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-white/50"}`}
                            aria-hidden
                          />
                          {item.name}
                        </span>
                        {item.statusDot && (
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              item.statusDot === "green" ? "bg-emerald-400" : "bg-amber-400"
                            }`}
                            aria-label={item.statusDot === "green" ? "Complete" : "Incomplete"}
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-[10px] font-medium text-white/25 leading-relaxed">
          NIST SP 800-171 Rev 2 · CMMC v2.0
        </p>
      </div>
    </aside>
  );
}
