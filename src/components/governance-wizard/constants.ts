import type { LucideIcon } from "lucide-react";
import {
  Shield,
  GraduationCap,
  FileText,
  Settings,
  Fingerprint,
  AlertTriangle,
  Wrench,
  HardDrive,
  Users,
  Lock,
  BarChart3,
  ClipboardCheck,
  Network,
  Activity,
} from "lucide-react";

/** 14 control families for NIST SP 800-171 Rev 2 (CMMC L2). */
export const CONTROL_FAMILIES: {
  code: string;
  name: string;
  plainName: string;
  controlPrefix: string;
  icon: LucideIcon;
}[] = [
  { code: "AC", name: "Access Control", plainName: "Who Can Access What", controlPrefix: "3.1", icon: Shield },
  { code: "AT", name: "Awareness and Training", plainName: "Training & Awareness", controlPrefix: "3.2", icon: GraduationCap },
  { code: "AU", name: "Audit and Accountability", plainName: "Activity Logs & Auditing", controlPrefix: "3.3", icon: FileText },
  { code: "CM", name: "Configuration Management", plainName: "System Configuration", controlPrefix: "3.4", icon: Settings },
  { code: "IA", name: "Identification and Authentication", plainName: "Proving Who You Are", controlPrefix: "3.5", icon: Fingerprint },
  { code: "IR", name: "Incident Response", plainName: "Responding to Incidents", controlPrefix: "3.6", icon: AlertTriangle },
  { code: "MA", name: "Maintenance", plainName: "System Maintenance", controlPrefix: "3.7", icon: Wrench },
  { code: "MP", name: "Media Protection", plainName: "Protecting Physical Media", controlPrefix: "3.8", icon: HardDrive },
  { code: "PS", name: "Personnel Security", plainName: "Personnel Security", controlPrefix: "3.9", icon: Users },
  { code: "PE", name: "Physical Protection", plainName: "Physical Security", controlPrefix: "3.10", icon: Lock },
  { code: "RA", name: "Risk Assessment", plainName: "Risk Assessment", controlPrefix: "3.11", icon: BarChart3 },
  { code: "CA", name: "Security Assessment", plainName: "Security Assessments", controlPrefix: "3.12", icon: ClipboardCheck },
  { code: "SC", name: "System and Communications Protection", plainName: "Network & Communications", controlPrefix: "3.13", icon: Network },
  { code: "SI", name: "System and Information Integrity", plainName: "System Health & Integrity", controlPrefix: "3.14", icon: Activity },
];

/** Control ID family prefix (e.g. "3.1" for 3.1.5, "3.10" for 3.10.1). Use this instead of startsWith(controlPrefix) to avoid 3.1 matching 3.10/3.11/3.12/3.13/3.14. */
export function getControlFamilyPrefix(controlId: string): string {
  const parts = controlId.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : controlId;
}
