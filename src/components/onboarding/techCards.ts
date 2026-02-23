/**
 * Onboarding Step 3: visual tech card grid.
 * Value keys are persisted to boundaryProfiles.selectedTechnologies.
 * Inheritance (getInheritedControls) only uses azure_gov and aws_govcloud.
 */
import type React from "react";
import type { LucideProps } from "lucide-react";
import {
  Monitor,
  Server,
  Apple,
  Box,
  Cloud,
  CloudCog,
  Fingerprint,
  Shield,
  ShieldCheck,
  Smartphone,
  Activity,
  Search,
  Mail,
  FileText,
  HardDrive,
} from "lucide-react";

export type TechCardItem = {
  value: string;
  label: string;
  description: string;
  icon: React.ComponentType<LucideProps & { className?: string }>;
};

export type TechCardGroup = {
  groupHeader: string;
  options: TechCardItem[];
};

export const ONBOARDING_TECH_CARDS: TechCardGroup[] = [
  {
    groupHeader: "Computers & Servers",
    options: [
      { value: "windows_workstation", label: "Windows Computers", description: "The computers your team uses day-to-day", icon: Monitor },
      { value: "windows_server", label: "Windows Servers", description: "Windows Server in your environment", icon: Server },
      { value: "macos", label: "Mac Computers", description: "Apple Macs used for work", icon: Apple },
      { value: "rhel", label: "Linux Servers", description: "Red Hat, CentOS, or other Linux servers", icon: Box },
    ],
  },
  {
    groupHeader: "Cloud Services",
    options: [
      { value: "azure_commercial", label: "Microsoft Azure", description: "Azure commercial cloud", icon: Cloud },
      { value: "azure_gov", label: "Azure Government", description: "Azure Government (FedRAMP)", icon: CloudCog },
      { value: "aws", label: "Amazon Web Services", description: "AWS commercial cloud", icon: Cloud },
      { value: "aws_govcloud", label: "AWS GovCloud (US)", description: "AWS GovCloud for government workloads", icon: CloudCog },
      { value: "gcp", label: "Google Cloud", description: "Google Cloud Platform", icon: Cloud },
    ],
  },
  {
    groupHeader: "Identity & Access",
    options: [
      { value: "entra_id", label: "Microsoft Entra ID (Active Directory)", description: "Microsoft identity and access", icon: Fingerprint },
      { value: "okta", label: "Okta", description: "Okta identity platform", icon: Fingerprint },
      { value: "on_prem_ad", label: "On-Premise Active Directory", description: "Active Directory on your own servers", icon: Fingerprint },
    ],
  },
  {
    groupHeader: "Endpoint Protection",
    options: [
      { value: "defender", label: "Microsoft Defender", description: "Defender for Endpoint or Cloud", icon: Shield },
      { value: "crowdstrike", label: "CrowdStrike", description: "CrowdStrike Falcon", icon: Shield },
      { value: "sentinelone", label: "SentinelOne", description: "SentinelOne endpoint security", icon: ShieldCheck },
    ],
  },
  {
    groupHeader: "Device Management",
    options: [
      { value: "intune", label: "Microsoft Intune", description: "Intune device management", icon: Smartphone },
      { value: "jamf", label: "JAMF (Mac Management)", description: "JAMF for Mac and iOS", icon: Apple },
    ],
  },
  {
    groupHeader: "Security Monitoring",
    options: [
      { value: "sentinel", label: "Microsoft Sentinel", description: "Microsoft Sentinel SIEM", icon: Activity },
      { value: "splunk", label: "Splunk", description: "Splunk Enterprise or Cloud", icon: Activity },
    ],
  },
  {
    groupHeader: "Vulnerability Scanning",
    options: [
      { value: "tenable", label: "Tenable / Nessus", description: "Tenable.io or Tenable.sc", icon: Search },
      { value: "qualys", label: "Qualys", description: "Qualys vulnerability management", icon: Search },
    ],
  },
  {
    groupHeader: "Email & Collaboration",
    options: [
      { value: "m365", label: "Microsoft 365", description: "Microsoft 365 (Office 365)", icon: Mail },
      { value: "google_workspace", label: "Google Workspace", description: "Google Workspace", icon: Mail },
    ],
  },
  {
    groupHeader: "File Storage",
    options: [
      { value: "sharepoint", label: "SharePoint / OneDrive", description: "SharePoint or OneDrive", icon: FileText },
      { value: "nfs", label: "Network File Share (NFS/SMB)", description: "Network file shares", icon: HardDrive },
    ],
  },
];

/** All value keys from the onboarding tech cards (for allow-listing when persisting). */
export const ONBOARDING_TECH_VALUE_KEYS = new Set(
  ONBOARDING_TECH_CARDS.flatMap((g) => g.options.map((o) => o.value))
);
