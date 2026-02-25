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
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "SCTM", href: "/dashboard/controls", icon: Shield },
  { name: "Governance", href: "/dashboard/governance", icon: BookMarked },
  { name: "Documents", href: "/dashboard/documents", icon: FileStack },
  { name: "POA&M", href: "/dashboard/poam", icon: FileText },
  { name: "Evidence", href: "/dashboard/evidence", icon: FolderOpen },
  { name: "Supply Chain", href: "/dashboard/supply-chain", icon: Network },
  { name: "Readiness", href: "/dashboard/readiness", icon: CheckCircle2 },
  { name: "Monitoring", href: "/dashboard/monitoring", icon: Activity },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex h-screen w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label="Main navigation"
    >
      <div className="flex h-16 shrink-0 items-center border-b border-[var(--color-border)] px-6">
        <Link href="/dashboard" className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 rounded">
          <Shield className="h-6 w-6 text-[var(--color-navy-primary)]" aria-hidden />
          <span className="text-lg font-semibold text-[var(--color-navy-primary)]">CMMC Control Plane</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 ${
                isActive
                  ? "bg-[var(--color-blue-accent)] text-white"
                  : "text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)]"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
