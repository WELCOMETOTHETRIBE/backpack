"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";

import { AppShell } from "@/components/ui/app-shell";
import { DashboardUserMenu } from "@/components/dashboard/DashboardUserMenu";
import { buildDashboardNav, getDashboardBreadcrumbItems } from "@/lib/dashboard-nav";
import { MacTechFooter } from "@/components/MacTechFooter";

type SessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
};

export function DashboardChrome({
  user,
  boundaryComplete,
  children,
}: {
  user: SessionUser | undefined;
  boundaryComplete?: boolean | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const navGroups = buildDashboardNav(boundaryComplete);
  const crumbs = getDashboardBreadcrumbItems(pathname);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(href + "/"));

  return (
    <AppShell
      layout="fill"
      className="h-full min-h-0"
      brand="Trust Codex"
      subname="CMMC Level 2"
      brandHref="/dashboard"
      storageKey="codex-dashboard-shell-collapsed"
      logo={
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500">
          <Shield className="h-4 w-4 text-white" aria-hidden />
        </span>
      }
      topbar={
        <AppShell.Topbar>
          <AppShell.Breadcrumbs items={crumbs} />
          <AppShell.Search placeholder="Search…" />
          <AppShell.Actions>
            <DashboardUserMenu user={user} />
          </AppShell.Actions>
        </AppShell.Topbar>
      }
      sidebar={
        <>
          {navGroups.map((group, gi) => (
            <AppShell.Section key={gi} label={group.label ?? undefined}>
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <AppShell.Item
                    key={item.name}
                    href={item.href}
                    active={active}
                    badge={
                      item.name === "Overview" && item.statusDot === "amber"
                        ? "!"
                        : undefined
                    }
                    icon={<Icon className="h-4 w-4" />}
                  >
                    {item.name}
                  </AppShell.Item>
                );
              })}
            </AppShell.Section>
          ))}
          <AppShell.Spacer />
          <p className="px-3 pb-3 text-[10px] font-medium leading-relaxed text-[var(--mt-text-4)]">
            NIST SP 800-171 Rev 2 · CMMC v2.0
          </p>
        </>
      }
    >
      <div className="flex min-h-full min-w-0 flex-col bg-[var(--color-surface-muted)]">
        <div className="flex-1 p-8">{children}</div>
        <MacTechFooter />
      </div>
    </AppShell>
  );
}
