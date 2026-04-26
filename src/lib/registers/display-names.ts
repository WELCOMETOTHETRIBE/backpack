/**
 * Register schema id → human-friendly name.
 *
 * Kept in its own module (no DB / server imports) so client components like
 * SCTMControlDetail can import the labels without dragging the `postgres`
 * server driver into the browser bundle.
 */
export const REGISTER_DISPLAY_NAMES: Record<string, string> = {
  access_authorization:    "User Access Register",
  role_assignment_matrix:  "Role Assignment Matrix",
  sod_matrix:              "Separation of Duties Matrix",
  authenticator_mgmt:      "MFA Enrollment Register",
  training_completion:     "Security Training Register",
  personnel_screening:     "Personnel Screening Register",
  termination:             "Termination Action Register",
  audit_log_review:        "Audit Log Review Register",
  audit_config:            "Key Management Register",
  control_monitoring:      "ConMon Activity Log",
  incident_log:            "Incident Response Register",
  maintenance_log:         "Maintenance Log",
  media_access:            "Media Accountability Register",
  media_destruction:       "Media Sanitization Register",
  visitor_log:             "Visitor Log",
  facility_access:         "Facility Access Log",
  baseline_config:         "Authorized Software Register",
  change_log:              "Change Control Register",
  risk_register:           "Risk Register",
  assessment_findings:     "Security Assessment Register",
  poam:                    "POA&M Register",
  vuln_remediation:        "Vulnerability Remediation Register",
  policy_review:           "SSP & Policy Review Register",
  technical_compliance_run: "Technical Compliance Log",
};
