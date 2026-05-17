/**
 * Register schema id → human-friendly name.
 *
 * Kept in its own module (no DB / server imports) so client components like
 * SCTMControlDetail can import the labels without dragging the `postgres`
 * server driver into the browser bundle.
 */
export const REGISTER_DISPLAY_NAMES: Record<string, string> = {
  access_authorization:          "User Access Register",
  role_assignment_matrix:        "Role Assignment Matrix",
  sod_matrix:                    "Separation of Duties Matrix",
  authenticator_mgmt:            "MFA Enrollment Register",
  remote_access_authorization:   "Remote Access Register",
  external_system_connections:   "External System Connections",
  portable_storage_authorization: "Portable Storage Register",
  wireless_ssid_authorization:   "Wireless SSID Register",
  service_account_inventory:     "Service Account Register",
  identity_inventory:            "Identity Inventory",
  training_completion:           "Security Training Register",
  personnel_screening:           "Personnel Screening Register",
  termination:                   "Termination Action Register",
  audit_log_review:              "Audit Log Review Register",
  audit_config:                  "Audit Config Register",
  control_monitoring:            "ConMon Activity Log",
  technical_compliance_run:      "Technical Compliance Log",
  incident_log:                  "Incident Response Register",
  maintenance_log:               "Maintenance Log",
  change_log:                    "Change Control Register",
  media_access:                  "Media Accountability Register",
  media_destruction:             "Media Sanitization Register",
  visitor_log:                   "Visitor Log",
  facility_access:               "Facility Access Log",
  baseline_config:               "Baseline Config Register",
  risk_register:                 "Risk Register",
  assessment_findings:           "Security Assessment Register",
  poam:                          "POA&M Register",
  vuln_remediation:              "Vulnerability Remediation Register",
  policy_review:                 "SSP & Policy Review Register",
};
