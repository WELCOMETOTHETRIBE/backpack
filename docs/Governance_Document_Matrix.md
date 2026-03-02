# Governance Document Matrix

**Single source of truth:** `docs/Governance_Document_Matrix.csv`. The CSV includes a **Controls Mapped** column (semicolon-separated control IDs, e.g. `3.1.1;3.1.2;3.1.4`) that defines which controls each document satisfies. Edit the CSV and run `npm run sync-matrix` to update the app.

Governance documents required for **Gov Pure**, **Gov Hybrid**, and **Tech/Hybrid**, with the MACTech document that serves as each artifact and a **Missing** indicator when no MACTech artifact exists.

- **Gov Pure** — Required for the 18 governance-only controls (policy/documentation only).
- **Gov Hybrid** — Required when adjudicating hybrid governance controls (policy + technical evidence).
- **Tech/Hybrid** — Required to close PARTIAL controls (OS/technical evidence + this governance document).

Paths in the MACTech column are relative to the **mactech** repo root.

| Governance Document | Gov Pure | Gov Hybrid | Tech/Hybrid | MACTech Document | Missing |
|--------------------|:--------:|:----------:|:-----------:|------------------|:-------:|
| Access Control Policy | ✓ | ✓ | | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-210_Access_Control_Policy.md | |
| Awareness and Training Policy | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-219_Awareness_and_Training_Policy.md | |
| Security Awareness Training Procedure | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-227_Security_Awareness_Training_Procedure.md | |
| Audit and Accountability Policy | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-218_Audit_and_Accountability_Policy.md | |
| Audit Log Review Procedure | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-226_Audit_Log_Review_Procedure.md | |
| Configuration Management Policy | ✓ | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-220_Configuration_Management_Policy.md | |
| Configuration Change Procedure | ✓ | ✓ | | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-225_Configuration_Change_Awareness_Procedure.md | |
| Incident Response Policy | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-215_Incident_Response_Policy.md | |
| Incident Response Testing Procedure | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-232_Incident_Response_Testing_Procedure.md | |
| Maintenance Policy | ✓ | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-221_Maintenance_Policy.md | |
| Personnel Security Policy | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-222_Personnel_Security_Policy.md | |
| Personnel Screening Procedure | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-233_Personnel_Screening_Procedure.md | |
| Risk Assessment Policy | ✓ | | | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-223_Risk_Assessment_Policy.md | |
| Security Assessment Policy | ✓ | ✓ | | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-224_Security_Assessment_Policy.md | |
| Procedures for Configuration Management | | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-CMP-001_Configuration_Management_Plan.md | |
| Identification and Authentication Policy | | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md | |
| Procedures for User Identification and Authentication | | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md | |
| Procedures for Remote Access | | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md | |
| Procedures for Authenticator Management | | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md | |
| Procedures for establishing, changing, and revoking authenticators | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md | |
| Procedures for Malicious Code Protection | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-214_System_Integrity_Policy.md | |
| Policy for authentication feedback (obscure feedback) | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-228_Authentication_Feedback_Obscure_Policy.md | |
| Procedures for System Monitoring | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-239_System_Monitoring_Procedure.md | |
| Procedures for session/connection termination | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-240_Session_Connection_Termination_Procedure.md | |
| Procedures for mobile code/script control | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-241_Mobile_Code_Script_Control_Procedure.md | |
| Procedures for transmission integrity (SMB signing/crypto) | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-242_Transmission_Integrity_SMB_Procedure.md | |
| Gov docs for separation of duties and system management | | ✓ | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-243_Separation_System_Management_Procedure.md | |
| Gov docs for information transfer controls | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-244_Information_Transfer_Controls_Procedure.md | |
| Network/security architecture documentation and procedures | | | ✓ | compliance/cmmc/level2/01-system-scope/ | |
| Gov docs for RDP/collaborative device use and restrictions | | | ✓ | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-245_RDP_Collaborative_Device_Restrictions_Procedure.md | |

---

## Summary

- **Gov Pure:** 14 documents (13 core policies/procedures for the 18 governance controls).
- **Gov Hybrid:** 10 documents (Access Control, Configuration Management, Maintenance, Security Assessment, plus procedures for configuration, identification/auth, remote access).
- **Tech/Hybrid:** 20 documents (all above that close PARTIAL controls; MACTech artifacts exist for all).

*This table is generated from `src/lib/governance/governance-document-matrix.ts`. Update that file and re-run the app or script to refresh the dashboard matrix view.*
