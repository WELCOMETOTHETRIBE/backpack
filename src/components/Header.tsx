"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { ChevronDown, Settings, LogOut, ClipboardCheck, ChevronRight, Users, Inbox } from "lucide-react";

const ROUTE_LABELS: Record<string, { section: string; title: string }> = {
  "/dashboard": { section: "", title: "Overview" },
  "/dashboard/controls": { section: "Assessment", title: "SCTM" },
  "/dashboard/documents": { section: "Program", title: "Documents" },
  "/dashboard/boundary": { section: "Infrastructure", title: "System Boundary" },
  "/dashboard/adjudication": { section: "Assessment", title: "Adjudication" },
  "/dashboard/poam": { section: "Assessment", title: "POA&M" },
  "/dashboard/evidence": { section: "Infrastructure", title: "Evidence" },
  "/dashboard/evidence-engine": { section: "Assessment", title: "Evidence Engine" },
  "/dashboard/supply-chain": { section: "Program", title: "Supply Chain" },
  "/dashboard/readiness": { section: "Program", title: "Readiness" },
  "/dashboard/monitoring": { section: "Program", title: "Monitoring" },
  "/dashboard/settings": { section: "", title: "Settings" },
  "/dashboard/reporting": { section: "Program", title: "Reporting" },
};

function getRouteLabel(pathname: string | null): { section: string; title: string } {
  if (!pathname) return { section: "", title: "Overview" };
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "dashboard" && segments[1]) {
    const base = `/dashboard/${segments[1]}`;
    if (ROUTE_LABELS[base]) return ROUTE_LABELS[base];
  }
  return { section: "", title: "Overview" };
}

type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
};

const ROLE_BADGE: Record<string, { label: string; class: string }> = {
  Admin: { label: "Admin", class: "bg-violet-100 text-violet-700" },
  Compliance: { label: "Compliance", class: "bg-blue-100 text-blue-700" },
  Assessor: { label: "C3PAO Assessor", class: "bg-amber-100 text-amber-700" },
};

export default function Header({ user }: { user: SessionUser | undefined }) {
  const pathname = usePathname();
  const { signOut } = useClerk();
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

  const { section, title } = getRouteLabel(pathname);
  const displayName = user?.name || user?.email || "User";
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : "U";
  const roleBadge = user?.role ? ROLE_BADGE[user.role] : null;

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-white px-6 py-0 h-14">
      {/* Breadcrumb / page title */}
      <div className="flex items-center gap-1.5 text-sm">
        {section ? (
          <>
            <span className="text-[var(--color-gray-500)]">{section}</span>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--color-gray-400)]" aria-hidden />
            <span className="font-semibold text-[var(--color-gray-900)]">{title}</span>
          </>
        ) : (
          <span className="font-semibold text-[var(--color-gray-900)]">{title}</span>
        )}
      </div>

      {/* Right: role badge + user menu */}
      <div className="flex items-center gap-3">
        {roleBadge && (
          <span className={`hidden rounded-full px-2.5 py-0.5 text-[11px] font-semibold sm:inline-block ${roleBadge.class}`}>
            {roleBadge.label}
          </span>
        )}

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-1"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F172A] text-[11px] font-semibold text-white"
              aria-hidden
            >
              {initials}
            </span>
            <span className="hidden max-w-[140px] truncate sm:block">{displayName}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-[var(--color-gray-500)] transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1.5 min-w-[192px] rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-lg"
              role="menu"
            >
              {/* User info row */}
              <div className="border-b border-[var(--color-border)] px-4 py-2.5">
                <p className="truncate text-[13px] font-medium text-[var(--color-gray-900)]">{displayName}</p>
                {user?.role && (
                  <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">{user.role}</p>
                )}
              </div>

              {user?.role === "Assessor" && (
                <Link
                  href="/assessor"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                  role="menuitem"
                  onClick={() => setDropdownOpen(false)}
                >
                  <ClipboardCheck className="h-4 w-4 text-[var(--color-gray-500)]" />
                  Switch to Assessor View
                </Link>
              )}

              {(user?.role === "Admin" || user?.role === "Compliance") && (
                <>
                  <div className="mt-1 border-t border-[var(--color-border)] pt-1">
                    <p className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
                      Admin
                    </p>
                  </div>
                  {user?.role === "Admin" && (
                    <Link
                      href="/dashboard/settings#user-management"
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                      role="menuitem"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <Users className="h-4 w-4 text-[var(--color-gray-500)]" />
                      Manage team
                    </Link>
                  )}
                  <Link
                    href="/dashboard/feedback"
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                    role="menuitem"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <Inbox className="h-4 w-4 text-[var(--color-gray-500)]" />
                    Feedback inbox
                  </Link>
                  <div className="my-1 border-t border-[var(--color-border)]" />
                </>
              )}

              <Link
                href="/dashboard/settings"
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                role="menuitem"
                onClick={() => setDropdownOpen(false)}
              >
                <Settings className="h-4 w-4 text-[var(--color-gray-500)]" />
                Settings
              </Link>
              <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    signOut({ redirectUrl: "/sign-in" });
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4 text-[var(--color-gray-500)]" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
