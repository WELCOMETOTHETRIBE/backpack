# IA.L2-3.5.4, 3.5.5, 3.5.6 — Entra ID implementation narrative

**Controls:** NIST SP 800-171 Rev.2  
- **3.5.4** — Employ replay-resistant authentication mechanisms for network access to privileged and nonprivileged accounts.  
- **3.5.5** — Prevent reuse of identifiers for a defined period.  
- **3.5.6** — Disable identifiers after a defined period of inactivity.

**Document purpose:** Describes how **Microsoft Entra ID** (Azure AD) is used to satisfy these requirements for the CUI pilot and what evidence must be collected. Supports hardening and compliance; use with MAC-POL-211 and the Evidence Runbook.

---

## 1. Implementation summary

The pilot uses **Microsoft Entra ID** as the identity provider for enclave access (VPN + RDP or Azure AD login for RDP). Entra provides:

- **Replay-resistant authentication (3.5.4):** MFA (and Conditional Access) ensures that reuse of captured credentials (e.g. password alone) is insufficient; time-bound tokens and second factors resist replay.
- **Prevent identifier reuse (3.5.5):** Entra does not allow the same user principal (UPN/object ID) to be reassigned to a different person; when an account is removed or repurposed, a new identifier is used. Account lifecycle is managed in Entra (create/disable/delete).
- **Disable identifiers after inactivity (3.5.6):** Entra supports sign-in reporting and, with Azure AD P1/P2 or Microsoft 365, can use Conditional Access or external process to disable or flag accounts after a defined period of inactivity (e.g. no sign-in for 90 days). Organization policy defines the period and procedure.

Evidence required for assessors: **Conditional Access / MFA policy export** and **sign-in logs** showing that MFA and authentication policies are applied and that identity lifecycle is managed.

---

## 2. How each control is satisfied

### 2.1 IA.L2-3.5.4 — Replay-resistant authentication

- **Mechanism:** MFA (Security Defaults or Conditional Access) and modern authentication (OAuth 2.0 / OpenID Connect) with short-lived tokens. Stolen or replayed credentials (e.g. password only) do not grant access without the second factor and valid token.
- **Evidence:** Conditional Access policies requiring MFA; sign-in logs showing “MFA requirement” satisfied for sign-ins to resources in the access path (e.g. Azure portal, VPN, or Azure AD login for RDP).

### 2.2 IA.L2-3.5.5 — Prevent identifier reuse

- **Mechanism:** Entra user objects are unique (UPN, object ID). When a user leaves or an account is retired, the account is disabled or deleted; the same UPN/identifier is not reassigned to another person. New users receive new accounts.
- **Evidence:** Policy or procedure (e.g. MAC-POL-211, MAC-SOP-222) stating that identifiers are not reused; optionally directory export or screenshot showing account lifecycle (disabled/deleted accounts). Sign-in and Conditional Access exports support that only current, approved identities are in use.

### 2.3 IA.L2-3.5.6 — Disable identifiers after inactivity

- **Mechanism:** Organization defines a period of inactivity (e.g. 90 days). Using Entra sign-in logs (or automation), accounts with no sign-in for that period are disabled or flagged for review. Entra supports this via reporting and, with P1/P2, Conditional Access or identity lifecycle policies.
- **Evidence:** Policy or procedure stating the inactivity period and that identifiers are disabled after that period; sign-in logs (or report) used to identify inactive accounts; optional screenshot or export of disabled accounts or review log.

---

## 3. Required evidence (assessment-ready)

For IA.L2-3.5.4, 3.5.5, and 3.5.6 the Evidence Index and CLASS_A_IMPLEMENTATION_PLAN expect:

| Evidence | Description | Where to store |
|----------|-------------|----------------|
| Conditional Access / MFA policy export | JSON or screenshot of policies that require MFA and apply to enclave access path | `evidence/runs/<RunId>/raw/azure/conditional-access-policies.json` (or equivalent) |
| Sign-in logs | Export of recent sign-ins (who, when, MFA result, resource) | `evidence/runs/<RunId>/raw/azure/entra-signin.json` (or CSV) |

**Current gap:** The Azure export script (`export_azure_evidence.sh`) writes `entra-signin.json` via `az ad signin list` (which may be empty or require additional permissions). Conditional Access policy export is **manual** or via Microsoft Graph — see **§4** and **EVIDENCE_RUNBOOK.md**.

Until these artifacts are present and non-empty (or explicitly documented as N/A with justification), these controls are **not fully defensible** in an assessment. Hardening steps: (1) Export CA policies and sign-in logs per runbook; (2) Store in the run’s `raw/azure/` folder; (3) Re-run validator and attach to control bundle.

---

## 4. How to collect evidence (runbook summary)

- **Sign-in logs:** See **EVIDENCE_RUNBOOK.md §2 (Entra sign-in logs)** and **§5a**. Options: Azure portal → Entra → Monitoring → Sign-in logs → Download; or Microsoft Graph (`Get-MgAuditLogSignIn` / SignInLog.Read.All); or `az ad signin list` if available for the tenant.
- **Conditional Access policies:** See **EVIDENCE_RUNBOOK.md § “Export Conditional Access policies”** (below). Export via Microsoft Graph (ConditionalAccess.Read.All) or manual export/screenshot from Entra → Protection → Conditional Access; save as `conditional-access-policies.json` or equivalent in the run’s `raw/azure/` folder.

---

## 5. References

- **Evidence Index:** `tables/EVIDENCE_INDEX.md` — IA.L2-3.5.4, 3.5.5, 3.5.6 rows.
- **Implementation plan:** `tables/CLASS_A_IMPLEMENTATION_PLAN.md` — Entra Conditional Access/MFA and sign-in logs.
- **Policy:** MAC-POL-211 (Identification and Authentication); MAC-SOP-222 (if applicable); MAC-SEC-108 (MFA Implementation Guide).
- **Runbook:** `docs/EVIDENCE_RUNBOOK.md` — Enable MFA, §2 Sign-in logs, §5a Azure/Entra module, and “Export Conditional Access policies” section.
