"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronDown, Settings, LogOut, ClipboardCheck } from "lucide-react";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/controls": "SCTM",
  "/dashboard/governance": "Governance",
  "/dashboard/governance/controls": "Governance Controls",
  "/dashboard/technical": "Technical",
  "/dashboard/technical/controls": "Technical Controls",
  "/dashboard/governance/documents": "Document Control",
  "/dashboard/governance/registers": "Registers",
  "/dashboard/governance/evidence": "Evidence Library",
  "/dashboard/governance/export": "Assessor Package Export",
  "/dashboard/documents": "Documents",
  "/dashboard/os-baselines": "System Boundary",
  "/dashboard/adjudication": "Adjudication",
  "/dashboard/poam": "POA&M",
  "/dashboard/evidence": "Evidence",
  "/dashboard/supply-chain": "Supply Chain",
  "/dashboard/readiness": "Readiness",
  "/dashboard/monitoring": "Monitoring",
  "/dashboard/settings": "Settings",
  "/dashboard/reporting": "Reporting",
};

function getPageTitle(pathname: string | null): string {
  if (!pathname) return "Overview";
  // Exact match first
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  // Prefix match for nested routes (e.g. /dashboard/poam/entry/123 -> POA&M)
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "dashboard" && segments[1]) {
    const base = `/dashboard/${segments[1]}`;
    if (ROUTE_TITLES[base]) return ROUTE_TITLES[base];
  }
  return "Overview";
}

type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
};

export default function Header({ user }: { user: SessionUser | undefined }) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const title = getPageTitle(pathname);
  const displayName = user?.name || user?.email || "User";
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : "U";

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3">
      <h1 className="text-lg font-semibold text-[var(--color-navy-primary)]">{title}</h1>

      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] shadow-sm transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3B82F6] text-xs font-medium text-white"
            aria-hidden
          >
            {initials}
          </span>
          <span className="max-w-[160px] truncate">{displayName}</span>
          <ChevronDown
            className={`h-4 w-4 text-gray-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {dropdownOpen && (
          <div
            className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
            role="menu"
          >
            {user?.role === "Assessor" && (
              <Link
                href="/assessor"
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                role="menuitem"
                onClick={() => setDropdownOpen(false)}
              >
                <ClipboardCheck className="h-4 w-4 text-gray-500" />
                Switch to Assessor View
              </Link>
            )}
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              role="menuitem"
              onClick={() => setDropdownOpen(false)}
            >
              <Settings className="h-4 w-4 text-gray-500" />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                signOut({ callbackUrl: "/" });
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              role="menuitem"
            >
              <LogOut className="h-4 w-4 text-gray-500" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
