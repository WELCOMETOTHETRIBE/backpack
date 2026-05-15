import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Shield,
  FileText,
  Network,
  CheckCircle2,
  Activity,
  Settings,
  FileStack,
  BookCheck,
  GraduationCap,
  MessageSquare,
  Archive,
  Upload,
  Gauge,
  Inbox,
} from "lucide-react";

import type { BreadcrumbItem } from "@/components/ui/app-shell";

export type DashboardNavIcon = ComponentType<{ className?: string }>;

export type DashboardNavItem = {
  name: string;
  href: string;
  icon: DashboardNavIcon;
  /** Boundary scoping indicator on Overview when known */
  statusDot?: "green" | "amber" | null;
};

export type DashboardNavGroup = {
  label: string | null;
  items: DashboardNavItem[];
};

/** Route labels for dashboard header / breadcrumbs (longest-prefix match for nested paths). */
export const DASHBOARD_ROUTE_LABELS: Record<string, { section: string; title: string }> = {
  "/dashboard": { section: "", title: "Overview" },
  "/dashboard/controls": { section: "Assessment", title: "SCTM" },
  "/dashboard/cae": { section: "Assessment", title: "Adjudication Engine" },
  "/dashboard/registers": { section: "Assessment", title: "Registers" },
  "/dashboard/intake": { section: "Assessment", title: "CUI Intake" },
  "/dashboard/artifacts": { section: "Assessment", title: "Artifacts" },
  "/dashboard/evidence/upload-manifest": { section: "Assessment", title: "Upload Manifest" },
  "/dashboard/poam": { section: "Assessment", title: "POA&M" },
  "/dashboard/documents": { section: "Program", title: "Documents" },
  "/dashboard/ssp": { section: "Program", title: "SSP" },
  "/dashboard/training": { section: "Program", title: "Training" },
  "/dashboard/supply-chain": { section: "Program", title: "Supply Chain" },
  "/dashboard/readiness": { section: "Program", title: "Readiness" },
  "/dashboard/monitoring": { section: "Program", title: "Monitoring" },
  "/dashboard/reporting": { section: "Program", title: "Reporting" },
  "/dashboard/boundary": { section: "Infrastructure", title: "System Boundary" },
  "/dashboard/adjudication": { section: "Assessment", title: "Adjudication" },
  "/dashboard/evidence": { section: "Infrastructure", title: "Evidence" },
  "/dashboard/evidence-engine": { section: "Assessment", title: "Evidence Engine" },
  "/dashboard/feedback": { section: "", title: "Feedback" },
  "/dashboard/settings": { section: "", title: "Settings" },
};

export function getDashboardRouteLabel(pathname: string | null): {
  section: string;
  title: string;
} {
  if (!pathname) return { section: "", title: "Overview" };
  if (DASHBOARD_ROUTE_LABELS[pathname]) return DASHBOARD_ROUTE_LABELS[pathname];

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "dashboard" && segments.length >= 2) {
    for (let depth = segments.length - 1; depth >= 1; depth--) {
      const base = `/${segments.slice(0, depth + 1).join("/")}`;
      if (DASHBOARD_ROUTE_LABELS[base]) return DASHBOARD_ROUTE_LABELS[base];
    }
  }
  return { section: "", title: "Overview" };
}

export function getDashboardBreadcrumbItems(pathname: string | null): BreadcrumbItem[] {
  const { section, title } = getDashboardRouteLabel(pathname);
  if (!section) return [{ label: title }];
  return [{ label: section }, { label: title }];
}

export function buildDashboardNav(boundaryComplete?: boolean | null): DashboardNavGroup[] {
  let overviewStatus: "green" | "amber" | null | undefined;
  if (boundaryComplete === true) overviewStatus = "green";
  else if (boundaryComplete === false) overviewStatus = "amber";

  return [
    {
      label: "Compliance",
      items: [
        {
          name: "Overview",
          href: "/dashboard",
          icon: LayoutDashboard,
          statusDot: overviewStatus ?? null,
        },
        { name: "SCTM", href: "/dashboard/controls", icon: Shield },
        { name: "Adjudication Engine", href: "/dashboard/cae", icon: Gauge },
        { name: "Registers", href: "/dashboard/registers", icon: BookCheck },
        { name: "CUI Intake", href: "/dashboard/intake", icon: Inbox },
        { name: "Artifacts", href: "/dashboard/artifacts", icon: Archive },
        {
          name: "Upload Manifest",
          href: "/dashboard/evidence/upload-manifest",
          icon: Upload,
        },
        { name: "POA&M", href: "/dashboard/poam", icon: FileText },
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
