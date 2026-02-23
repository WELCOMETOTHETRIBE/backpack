"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  FileText,
  FolderOpen,
  BookOpen,
  Network,
  CheckCircle2,
  Activity,
  Settings,
} from "lucide-react";

const navigation = [
  {
    name: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Controls",
    href: "/dashboard/controls",
    icon: Shield,
  },
  {
    name: "POA&M",
    href: "/dashboard/poam",
    icon: FileText,
  },
  {
    name: "Evidence",
    href: "/dashboard/evidence",
    icon: FolderOpen,
  },
  {
    name: "Governance",
    href: "/dashboard/governance",
    icon: BookOpen,
  },
  {
    name: "Supply Chain",
    href: "/dashboard/supply-chain",
    icon: Network,
  },
  {
    name: "Readiness",
    href: "/dashboard/readiness",
    icon: CheckCircle2,
  },
  {
    name: "Monitoring",
    href: "/dashboard/monitoring",
    icon: Activity,
  },
  {
    name: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-[#0F172A]" />
          <span className="text-lg font-semibold text-[#0F172A]">CMMC OS</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#3B82F6] text-white"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 p-4">
        <Link
          href="/api/auth/signout"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Sign out
        </Link>
      </div>
    </div>
  );
}
