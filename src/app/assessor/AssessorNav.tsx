"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { label: "Overview", href: "/assessor/overview" },
  { label: "Controls", href: "/assessor/controls" },
  { label: "POA&M", href: "/assessor/poam" },
  { label: "Evidence", href: "/assessor/evidence" },
  { label: "Governance", href: "/assessor/governance" },
  { label: "SSP", href: "/assessor/ssp" },
  { label: "Registers", href: "/assessor/registers" },
];

export function AssessorNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1" aria-label="Assessor navigation">
      {NAV_LINKS.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== "/assessor/overview" && pathname?.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
