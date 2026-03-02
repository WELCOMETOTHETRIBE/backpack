# MacTech CUI Enclave Governance Documents

This folder contains the **System Boundary and Scope** and the **eight governance documents** for MacTech’s CUI enclave. All documents are production-grade and ready for deployment and sign-off.

**Boundary:** In scope are Microsoft Azure Government, Windows VM(s) hosted in it, and user access via Entra ID, VPN, and MFA only. User work computers and other clouds/on-premises systems are out of scope.

## Documents

| Document | Purpose |
|----------|---------|
| System_Boundary_and_Scope_MacTech_CUI_Enclave.md | Single source of truth for enclave boundary and scope |
| MAC-POL-228_Authentication_Feedback_Obscure_Policy.md | Policy for obscure authentication feedback (3.5.11) |
| MAC-SOP-239_System_Monitoring_Procedure.md | Security alert monitoring and unauthorized use (3.14.3, 3.14.7) |
| MAC-SOP-240_Session_Connection_Termination_Procedure.md | RDP/session timeouts and lock (3.13.9) |
| MAC-SOP-241_Mobile_Code_Script_Control_Procedure.md | Mobile code and script control (3.13.13) |
| MAC-SOP-242_Transmission_Integrity_SMB_Procedure.md | SMB signing and TLS (3.13.15) |
| MAC-SOP-243_Separation_System_Management_Procedure.md | User vs. system management separation (3.13.3) |
| MAC-SOP-244_Information_Transfer_Controls_Procedure.md | Information transfer controls (3.13.4) |
| MAC-SOP-245_RDP_Collaborative_Device_Restrictions_Procedure.md | RDP and collaborative device restrictions (3.13.12) |

## Production readiness

Each document includes:

- **Document control:** Document ID, version, effective date, classification, document owner, approval authority, next review date.
- **Revision history table** (version, date, description, author).
- **Approval block** with signature lines for Authorizing Official/CISO and Document Owner.
- **Concrete requirements** where applicable (e.g., 15-minute RDP idle timeout, daily alert review, 4-hour escalation for critical alerts, three-year retention).
- **References** to MAC-SCOPE-001, related policies (MAC-POL-xxx, MAC-SOP-xxx, MAC-FRM-204), and Records Retention Policy.

**Sign-off:** Fill in the approval block (Name, Signature, Date) for Authorizing Official/CISO and Document Owner. Effective date is upon approval. Next review is annually from effective date.

## Deployment

After internal approval and signature, copy these files into the **mactech** repo under `compliance/cmmc/level2/02-policies-and-procedures/` (or the path used in `docs/governance-inventory/artifact-label-to-document-mapping.json`). The mapping already points to these filenames so the Governance Document Matrix will show them as present once they exist in mactech.
