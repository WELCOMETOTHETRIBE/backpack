export const INTAKE_STATUSES = [
  "Draft",
  "Pending Authorization",
  "Upload Scope Provisioned",
  "Awaiting Upload",
  "Uploaded",
  "Scan Pending",
  "Scan Clean",
  "Scan Failed",
  "Quarantined",
  "Hash Generated",
  "Ready for Vault Import",
  "Imported to Vault",
  "Reviewer Approved",
  "Access Revoked",
  "Evidence Package Generated",
  "Closed",
  "Exception",
  "Rejected",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_CLASSIFICATIONS = [
  "CUI",
  "FCI",
  "EXPORT_CONTROLLED",
  "UNKNOWN",
  "NOT_CONTROLLED",
] as const;

export type IntakeClassification = (typeof INTAKE_CLASSIFICATIONS)[number];

export const INTAKE_ACCESS_METHODS = ["ENTRA_B2B", "USER_DELEGATION_SAS"] as const;
export type IntakeAccessMethod = (typeof INTAKE_ACCESS_METHODS)[number];

const transitionMap: Record<IntakeStatus, IntakeStatus[]> = {
  Draft: ["Pending Authorization", "Rejected", "Exception"],
  "Pending Authorization": [
    "Upload Scope Provisioned",
    "Rejected",
    "Exception",
  ],
  "Upload Scope Provisioned": ["Awaiting Upload", "Exception", "Rejected"],
  "Awaiting Upload": ["Uploaded", "Exception", "Rejected"],
  Uploaded: ["Scan Pending", "Exception", "Rejected"],
  "Scan Pending": ["Scan Clean", "Scan Failed", "Quarantined", "Exception"],
  "Scan Clean": ["Hash Generated", "Exception"],
  "Scan Failed": ["Quarantined", "Exception"],
  Quarantined: ["Exception", "Rejected"],
  "Hash Generated": ["Ready for Vault Import", "Exception"],
  "Ready for Vault Import": ["Imported to Vault", "Exception"],
  "Imported to Vault": ["Reviewer Approved", "Exception"],
  "Reviewer Approved": ["Access Revoked", "Exception"],
  "Access Revoked": ["Evidence Package Generated", "Exception"],
  "Evidence Package Generated": ["Closed", "Exception"],
  Closed: [],
  Exception: ["Rejected", "Closed"],
  Rejected: [],
};

export function canTransitionIntakeStatus(
  currentStatus: IntakeStatus,
  nextStatus: IntakeStatus,
): boolean {
  if (currentStatus === nextStatus) return true;
  return transitionMap[currentStatus]?.includes(nextStatus) ?? false;
}
