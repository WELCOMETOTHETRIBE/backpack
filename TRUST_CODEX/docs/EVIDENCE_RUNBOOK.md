# Evidence Runbook — VPN + RDP Access Path

This runbook gives **exact commands and steps** to generate the evidence types referenced in the Evidence Index. Access to the enclave is **VPN + RDP to VM** (no Azure Bastion).

---

## Quick start: run the runbook and collect artifacts

1. **From repo root** (creates a RunId and runs Azure export if `az` is available):
   ```bash
   python3 TRUST_CODEX/tools/run_evidence_runbook.py --out-root evidence/runs
   ```
   This creates `evidence/runs/<RunId>/` with `run.json`, Azure artifacts (if `az` is installed and logged in), and `VM_INSTRUCTIONS.md`.

2. **On the enclave VM** (VPN + RDP): run the commands in `evidence/runs/<RunId>/VM_INSTRUCTIONS.md` — i.e. run `Run-CuiBulkEvidenceAndValidate.ps1` in `C:\hardening\codex-scripts\`, then copy the VM output into the run’s `raw/` or sync to the evidence vault.

3. **Optional:** From a machine with Azure CLI, run `TRUST_CODEX/tools/export_azure_evidence.sh` with `RUN_ID` and `OUT_DIR` set (or run `run_evidence_runbook.py` there) to collect role assignments and NSG rules into the same run. The script is configured for C3PAO: it defaults `AZURE_RG=rg-cui-pilot-envclave`, writes a compliance-oriented `manifest.json`, and `EVIDENCE_COLLECTION.txt` in the output dir for assessors.

### Run via SSH (no RDP)

From a machine that can SSH to the enclave VM (VPN or same network), you can run hardening (optional), collect, validate, and pull artifacts in one go:

```bash
# Required: point to your Windows VM and SSH key
export TRUST_CODEX_VM_HOST=20.57.129.142   # or your VM IP
export TRUST_CODEX_VM_USER=admin_patrick
# Use passphrase-protected key for MFA (see docs/SSH_MFA_KEY_SETUP.md):
export TRUST_CODEX_SSH_KEY=~/.ssh/enclave_mfa_key
# Or legacy key: TRUST_CODEX_SSH_KEY=~/.ssh/mactech-cmmc-windows-vm

# Optional: run hardening before collect+validate (recommended for pre-submission)
export TRUST_CODEX_RUN_HARDENING=1

bash TRUST_CODEX/tools/run_evidence_runbook_via_ssh.sh
```

The script uses PowerShell on the VM for all steps (no Unix `test`/`mkdir`). It generates a RunId locally, runs collect + validate with that RunId on the VM, then pulls `CUI-Evidence-<RunId>` and `CUI-Validation-<RunId>` into `evidence/runs/<RunId>/raw/`.

### Test SSH connection

Before running the runbook or Continuous Drift Guard, verify SSH with the same env:

```bash
export TRUST_CODEX_VM_HOST=20.57.129.142 TRUST_CODEX_VM_USER=admin_patrick TRUST_CODEX_SSH_KEY=~/.ssh/enclave_mfa_key
bash TRUST_CODEX/tools/connect_vm_ssh.sh
```

(Use `~/.ssh/enclave_mfa_key` for MFA key; see **docs/SSH_MFA_KEY_SETUP.md** for setup and passphrase.)

### Continuous Drift Guard

To detect configuration drift (e.g. a hardening check that was PASS later failing):

1. **Establish a baseline** (after a known-good run):
   ```bash
   # Use current VM state as baseline:
   bash TRUST_CODEX/tools/continuous_drift_guard.sh baseline
   # Or use an existing run as baseline:
   bash TRUST_CODEX/tools/continuous_drift_guard.sh baseline --run-dir evidence/runs/20260213-004500
   ```
2. **Run a drift check** (e.g. on a schedule or before assessments):
   ```bash
   bash TRUST_CODEX/tools/continuous_drift_guard.sh check
   ```
   This runs collect+validate on the VM, compares the validation report to the baseline, and reports **regressions** (checks that were PASS and are now FAIL). Exit code 1 if any regression. Last check is stored under `evidence/drift_guard/last_check/`.

---

## Enable MFA in Microsoft Entra ID

MFA is enforced at the identity layer (Entra ID). Users sign in to Entra before reaching the enclave (VPN + RDP), so enabling MFA in the tenant protects enclave access.

### Option A — Security defaults (simplest)

**Direct link:** [Entra Properties (manage security defaults)](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Properties)

1. Sign in to the **Azure portal** (or [Entra admin center](https://entra.microsoft.com)) with an account that can manage Entra (e.g. Global Administrator, Security Administrator).
2. Go to **Microsoft Entra ID** → **Properties** (or open the direct link above).
3. At the bottom of the blade, select **Manage security defaults**.
4. Set **Security defaults** to **Enabled**.
5. Click **Save**.

Result: All users will be required to register for MFA; admins and risky sign-ins will be prompted for MFA. No Azure AD Premium license required.

**Note:** Security defaults cannot be enabled if the tenant already has **Conditional Access** policies. If you see that restriction, use Option B (Conditional Access) instead.

**Limitation:** Less granular than Conditional Access (e.g. you can’t require MFA only for a specific app or group).

### Option B — Conditional Access (recommended for CUI)

Requires **Azure AD P1** (or P2) or Microsoft 365 license that includes it.

1. **Microsoft Entra ID** → **Protection** → **Conditional Access** → **+ New policy**.
2. **Name:** e.g. `CUI Enclave — Require MFA`.
3. **Users:** Include **All users** or a group that contains everyone who may access the enclave (e.g. `CUI-Enclave-Users`). Exclude break-glass accounts if you use them.
4. **Target resources:**  
   - **Cloud apps** → Include **All cloud apps**, or scope to the app(s) used for VPN/sign-in if you know them.  
   - To require MFA for any sign-in that could lead to enclave access, **All cloud apps** is fine.
5. **Conditions (optional):** Add **Sign-in risk** or **Location** if you want (e.g. require MFA when not on corporate network).
6. **Grant:** **Grant access** → check **Require multifactor authentication** → **Select**.
7. **Enable policy:** **On** → **Create**.

Users in scope will be prompted to register and use MFA on next sign-in. Test with a non-admin account first.

### Require MFA for privileged accounts (IA.L2-3.5.3)

Create a second policy that targets **Directory role** (e.g. Global Administrator, Privileged Role Administrator, or a custom role used for enclave admin):

1. **Conditional Access** → **+ New policy**.
2. **Users** → Include **Directory role** → choose the privileged role(s).
3. **Cloud apps** → **All cloud apps** (or scope as above).
4. **Grant** → **Require multifactor authentication**.
5. Enable and create.

### After MFA is enabled

- **Evidence:** Export Conditional Access policies (Entra → Protection → Conditional Access → export or screenshot policies) and sign-in logs (see **§2. Entra sign-in logs** below). Store in the evidence vault; the Evidence Index expects “Entra Conditional Access/MFA policy export + sign-in logs” for IA.L2-3.5.2, 3.5.3, 3.5.4, 3.5.5, 3.5.6, 3.5.8, 3.5.9 and MA.L2-3.7.x.
- **Verification:** In **Sign-in logs**, filter by a test user and confirm **MFA requirement** / **Authentication requirement** shows MFA satisfied for sign-ins after the policy is on.
- **POA&M:** Until MFA is fully implemented, IA.L2-3.5.3 is tracked in the **POA&M** (Trust Codex Manual → POA&M tab). Close the POA&M item per **MAC-SOP-231** when MFA is enforced and evidence is in the vault. See also **MAC-SEC-108** (MFA Implementation Guide).

### Demo MFA — where the 2nd factor comes from

Security defaults are on when the portal shows **"Security defaults: Enabled"**. To see MFA in action and understand where the second factor comes from:

**1. Register an MFA method (one-time)**  
The first time Entra asks for MFA, it will **walk you through registration**. You choose how you want to receive the second factor:

- **Microsoft Authenticator (recommended):** Install [Microsoft Authenticator](https://www.microsoft.com/en-us/security/mobile-authenticator-app) on your phone. When you sign in, you either tap **Approve** on a notification, or open the app and type the **6-digit code** shown there. So: **2nd factor = your phone (Authenticator app)**.
- **Phone (SMS or call):** Enter your mobile number. At sign-in you get a **code by text** or a **phone call** to approve. So: **2nd factor = code or call on that phone**.

**2. Trigger the MFA prompt so you can demo it**

- **Option A — Incognito/private window:** Open a new **private or incognito** browser window. Go to [https://portal.azure.com](https://portal.azure.com) (or [https://entra.microsoft.com](https://entra.microsoft.com)) and sign in with your account. Entra will treat it as a new sign-in and prompt for MFA. You'll see the second factor on the method you registered (Authenticator notification/code or SMS/call).
- **Option B — Sign out and sign in again:** In the Azure portal, click your profile (top right) → **Sign out**. Sign in again; for admins or when risk is detected, Entra often asks for MFA again.
- **Option C — Different browser or device:** Sign in from another browser or device; that usually triggers an MFA challenge.

**3. At the actual MFA step**

- **If you chose Authenticator:** You'll see "Approve sign-in request" or "Enter the code from your app." Check your **phone** — open Authenticator and either approve the notification or type the 6-digit code into the browser.
- **If you chose phone:** You'll get an **SMS with a code** or a **phone call**; enter the code or answer the call as instructed.

So: **the 2nd factor is whatever you registered** — your phone (Authenticator app or SMS/call). You don't get it "from" the portal; you get it on the device you set up during registration.

### Why you don't see MFA when using the Windows (Remote Desktop) app to the VM

When you open the **Remote Desktop** app (or "Windows app" for RDP), connect to the VM, and type a **local Windows username and password** (e.g. the VM's local admin account), that sign-in **does not go through Entra ID**. It goes straight to the VM's local Windows logon. Entra MFA (and Security Defaults) only apply to **Entra sign-ins** (Azure portal, Microsoft 365, VPN that uses Entra, etc.). So you won't be prompted for MFA at the RDP logon screen when using local credentials — that's expected.

**Ways to get MFA in the path when accessing the VM:**

1. **VPN that requires Entra sign-in**  
   If you connect to a **VPN** that uses **Entra ID** (or Azure AD) to sign in *before* you can reach the network where the VM lives, you get MFA at the **VPN step**. After that, when you RDP to the VM with local creds, MFA has already happened. So: **MFA at VPN → then RDP with local account**. Check whether your VPN is configured to use Entra; if yes, sign in to the VPN first and you should see the MFA prompt there.

2. **Sign in to the VM with your Entra account (Azure AD login for RDP)**  
   If the VM is **Azure AD–joined** (or hybrid joined), you can sign in at the RDP logon screen using your **Entra account** (e.g. patcaru@outlook.com) instead of a local account. That sign-in goes through Entra, so **Security Defaults / MFA will apply**.  
   - On the RDP connection screen, look for an option like **"Sign in with a work or school account"** or **"Use another account"** and enter your Entra email. You may need to enable **Azure AD login** on the VM (Windows Server: join to Azure AD or configure for "Sign in with Azure AD" for RDP).  
   - This requires the VM to be Azure AD–joined and your Entra user to have logon rights on that VM.

3. **Use Azure Bastion (optional)**  
   If you used **Azure Bastion** to RDP, the Bastion connection uses Entra sign-in, so MFA runs there. Your runbook uses VPN + RDP, so this is only if you switch to Bastion.

**Summary:** Local logon at the VM = no Entra = no MFA. To see MFA when using the Windows RDP app, either use a VPN that signs in with Entra first, or sign in to the VM with your Entra account (Azure AD login) if the VM is set up for it.

### Enforce MFA when using the Windows RDP app

To get **MFA enforced** in the same flow as the Windows (Remote Desktop) app, the RDP sign-in must go through Entra ID. Two ways to do that:

---

**Option 1 — VPN that requires Entra sign-in (simplest)**

If the only way to reach the VM is through a **VPN** that uses **Entra ID** to sign in:

1. You open the VPN app and sign in with your Entra account (e.g. patcaru@outlook.com). Entra (and Security Defaults / MFA) run here — you get the MFA prompt.
2. After VPN is connected, you open the **Remote Desktop** app and connect to the VM using the **local** account. MFA already happened at step 1.

So MFA is enforced **before** you can use RDP. Configure your VPN (e.g. Azure VPN Gateway with Entra authentication, or a VPN that supports SAML/OpenID to Entra) so that connecting requires Entra sign-in. Then enforce MFA for that VPN app in Entra (Security Defaults or Conditional Access).

---

**Option 2 — Azure AD login for RDP (sign in to the VM with your Entra account)**

Here the **RDP logon** uses Entra ID, so MFA is enforced at the RDP step. This applies to **Windows Server VMs in Azure** (and similar setups).

**→ Full step-by-step setup:** see **[Azure AD login for RDP — setup guide](AZURE_AD_LOGIN_FOR_RDP_SETUP.md)** (checklist, portal steps, optional Azure CLI).

**On the Azure VM (one-time):**

1. **Enable system-assigned managed identity** on the VM (Azure portal → VM → Identity → System assigned → On).
2. **Install the Azure AD login extension** on the VM:
   - Azure portal → your VM → **Extensions + applications** → **+ Add** → search for **Azure AD Login for Windows** (or **AADLoginForWindows**) → Add. Wait for it to succeed.
3. **Assign RBAC** so your Entra user can sign in:
   - VM → **Access control (IAM)** → **+ Add** → **Add role assignment**.
   - Role: **Virtual Machine User Login** (for normal user) or **Virtual Machine Administrator Login** (for admin).
   - Assign access to: **User** (or group) → select your account (e.g. patcaru@outlook.com) → Save.

**On the VM (Windows Server) — allow Entra auth for RDP:**

4. If the VM still uses **Network Level Authentication (NLA)** and Entra login fails, you may need to allow non-NLA for this scenario (or use an RDP client that supports Entra with NLA). See Microsoft docs below; some setups require NLA off for Entra credential flow.
5. Ensure **Remote Desktop** is enabled and (if applicable) that the **Azure AD** security group or RBAC is the source of who can log on.

**From your PC — connect with the Windows Remote Desktop app:**

6. Open **Remote Desktop** and connect to the VM (IP or hostname).
7. At the logon screen, **do not** use a local account. Use:
   - **User name:** your Entra UPN (e.g. `patcaru@outlook.com` or your tenant primary domain).
   - **Password:** your Entra password. (Or choose “Sign in with a work or school account” / “Use another account” if the client shows it and enter your Entra email.)
8. The sign-in goes through Entra, so you’ll get the **MFA prompt** (Authenticator or phone) before the session starts. After that, you’re logged into the VM.

**Official reference:** [Sign in to a Windows VM in Azure using Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/devices/howto-vm-sign-in-azure-ad-windows).

---

**Summary**

| Goal | Approach |
|------|----------|
| MFA before RDP | Use a VPN that requires Entra sign-in (and MFA); then RDP with local account. |
| MFA at RDP | Use Azure AD login for RDP: install AAD Login extension, assign VM Login role, sign in to the VM with your Entra account in the Windows RDP app. |

---

## 1. VM session config (Windows evidence bundle)

**What it is:** RDP/session policy, account policy, firewall, and other VM configuration collected on the enclave host.

**How to generate:**

1. On the enclave VM, open PowerShell (elevated if required for some collectors).
2. Run the Codex evidence collector:
   ```powershell
   C:\hardening\codex-scripts\Collect-Cui-Evidence.ps1 -OutDir "C:\evidence\CUI-Evidence-<RunId>"
   ```
   Or use the bulk runner that sets RunId automatically:
   ```powershell
   C:\hardening\codex-scripts\Run-CuiBulkEvidenceAndValidate-Elevated.ps1
   ```
3. Run the validator (same RunId):
   ```powershell
   C:\hardening\codex-scripts\Test-CuiHardening.ps1 -EvidenceDir "C:\evidence\CUI-Evidence-<RunId>"
   ```
4. Output: timestamped folder under `C:\evidence\` containing e.g. `rdp-policy.txt`, `rdp-tcp.txt`, `account-policy.txt`, `firewall.txt`, `manifest.txt`, `hashes.sha256.txt`, etc. Copy or sync to the evidence vault per `vault/Sync-EvidenceToVault.ps1`.

**Cadence:** Monthly + per change (see Evidence Index per control).

**Where stored:** Evidence vault `\\EvidenceVault\CUI-Enclave\runs\<RunId>\raw\CUI-Evidence-<RunId>\`; per-control bundles under `controls\<ControlId>\<RunId>\bundle.zip`.

---

## 2. Entra sign-in logs

**What it is:** Azure AD / Entra ID sign-in activity (who signed in, when, from where, MFA result) to support access control and session monitoring.

**How to generate:**

1. Azure portal: **Microsoft Entra ID** → **Monitoring** → **Sign-in logs**.
2. Set filters (e.g. date range, resource = your tenant).
3. Export via **Download** (CSV) or use Microsoft Graph API:
   ```powershell
   # Requires MgGraph or Az module and appropriate permissions (e.g. SignInLog.Read.All)
   Connect-MgGraph -Scopes "AuditLog.Read.All","User.Read.All"
   Get-MgAuditLogSignIn -Top 1000 | Export-Csv -Path "entra-signin-<date>.csv" -NoTypeInformation
   ```
   Or Azure CLI (if available for your tenant):
   ```bash
   az ad signin list --top 1000 -o table  # or -o json for export
   ```
4. Save export with a timestamp; store in the evidence vault under the relevant control(s) or in the run raw folder if part of a combined run.

**Cadence:** Monthly + per policy change (see Evidence Index).

**Where stored:** Evidence vault under controls that require Entra evidence (e.g. AC.L2-3.1.1, IA.L2-3.5.x) or in run raw as `evidence/runs/<RunId>/raw/azure/entra-signin.json` (or CSV). For the Azure/Entra 7-control module, use the same run `raw/azure/` folder as the rest of the Azure export.

**Required for IA.L2-3.5.4, 3.5.5, 3.5.6:** Sign-in logs (with MFA result when applicable) are required evidence. Ensure the export includes recent sign-ins and that the file is non-empty for the run used in assessment. If `az ad signin list` returns empty, use portal Download or Microsoft Graph (SignInLog.Read.All) and save the file into the run’s `raw/azure/` directory with the same RunId as the rest of the Azure evidence.

---

## 2a. Export Conditional Access policies (IA 3.5.4–3.5.6, 3.5.3, MA 3.7.5)

**What it is:** A copy of the Conditional Access (and MFA-related) policies that apply to enclave access. Required for assessor-ready evidence for IA.L2-3.5.3, 3.5.4, 3.5.5, 3.5.6 and MA.L2-3.7.5.

**How to generate:**

**Option A — Azure portal (manual, no special license):**

1. Sign in to [Azure portal](https://portal.azure.com) or [Entra admin center](https://entra.microsoft.com) with an account that can view Conditional Access (e.g. Security Administrator, Conditional Access Administrator, Global Reader).
2. Go to **Microsoft Entra ID** → **Protection** → **Conditional Access** → **Policies**.
3. For each policy that applies to enclave access (e.g. “Require MFA for all users” or “Require MFA for privileged roles”):
   - Open the policy and use **Export** if available, or
   - Capture a **screenshot** of the policy blade (Name, Assignments, Grant controls, State), or
   - Manually copy policy details into a text/JSON file (policy name, included users/groups, cloud apps, grant controls, state = On/Off).
4. Save as `conditional-access-policies.json` or `conditional-access-policies.txt` (or `mfa-policy.json`) in the **same run folder** as the rest of Azure evidence: `evidence/runs/<RunId>/raw/azure/`.

**Option B — Microsoft Graph (automated, requires ConditionalAccess.Read.All):**

```powershell
# Install module if needed: Install-Module Microsoft.Graph.Authentication, Microsoft.Graph.Identity.SignIns -Scope CurrentUser
Connect-MgGraph -Scopes "ConditionalAccess.Read.All"
$policies = Get-MgIdentityConditionalAccessPolicy
$policies | ConvertTo-Json -Depth 10 | Set-Content -Path "evidence/runs/<RunId>/raw/azure/conditional-access-policies.json"
```

Replace `<RunId>` with the same run ID used for `export_azure_evidence.sh` (e.g. from `RUN_ID=$(date -u +%Y%m%d-%H%M%S)`).

**Option C — Azure CLI (limited):** There is no direct `az` command for Conditional Access policies. Use portal or Graph.

**Cadence:** Monthly + per policy change (see Evidence Index).

**Where stored:** `evidence/runs/<RunId>/raw/azure/conditional-access-policies.json` (or .txt). Attach to the same evidence run used for `role-assignments-all.json`, `entra-signin.json`, and `keyvault-list.json` so the validator and assessor can use one run for all 7 Azure/Entra controls.

**Reference:** Narrative linking Entra to 3.5.4, 3.5.5, 3.5.6: `docs/IA_L2_3_5_4_3_5_5_3_5_6_Entra_Implementation_Narrative.md`.

---

## 3. Role assignments (Azure / Entra)

**What it is:** RBAC and role assignments for the subscription/resource group (or Entra app/role assignments) to support least privilege and access control.

**How to generate:**

1. **Azure RBAC (subscription/resource group):**
   ```bash
   az role assignment list --all -o table
   az role assignment list --scope /subscriptions/<subId>/resourceGroups/<rg> -o json > role-assignments-<rg>.json
   ```
2. **Entra (directory roles):**
   - Azure portal: **Microsoft Entra ID** → **Roles and administrators** → export or screenshot.
   - Or Microsoft Graph: list directory role assignments and export.
3. Save with timestamp; store in vault.

**Cadence:** Monthly + per change.

**Where stored:** Evidence vault; include in run raw or under controls as above.

---

## 4. NSG / network rules (managed access control points)

**What it is:** Proof that RDP is not exposed to the public internet and is restricted to VPN/jump subnet (VPN + RDP access path).

**How to generate:**

```bash
az network nsg rule list --nsg-name "<nsgName>" --resource-group "<rg>" -o table
az network nsg list -g "<rg>" -o table
```

Document that RDP (3389) is allowed only from VPN gateway or jump subnet; no 0.0.0.0/0 on 3389.

**Cadence:** Monthly + per change.

**Where stored:** Evidence vault; can be part of Azure export run (e.g. `CUI-Azure-<RunId>\`).

---

## 5a. Azure/Entra 7-control module (collect + validate)

The **7 Azure/Entra controls** (IA.L2-3.5.3, 3.5.4, 3.5.5, 3.5.6, MA.L2-3.7.5, SC.L2-3.13.10, SC.L2-3.13.5) have a dedicated collect-and-validate flow.

**Collect (requires Azure CLI when available):**

```powershell
# On a machine with Azure CLI (az login) — e.g. VM or workstation
cd C:\evidence  # or wherever vm-scripts are (e.g. C:\Codex\TRUST_CODEX\vm-scripts)
.\Collect-AzureEntraEvidence.ps1 -OutRoot C:\evidence -ResourceGroup <your-rg>
```

- Writes to `C:\evidence\CUI-AzureEntra-<RunId>\` (or into `CUI-Evidence-<RunId>\azure-entra\` if you pass `-EvidenceDir`).
- Gathers: role assignments, Entra sign-in list, NSG list/rules (if `-ResourceGroup` set), Key Vault list.
- **Conditional Access / MFA policy:** **Required for IA 3.5.4–3.5.6 defensibility.** Follow **§2a. Export Conditional Access policies** in this runbook: export via Entra portal (Protection → Conditional Access) or Microsoft Graph and save as `conditional-access-policies.json` in the **same** run folder (e.g. `raw/azure/` or `CUI-AzureEntra-<RunId>\`). If sign-in list is empty from CLI, use portal Download or Graph and save as `entra-signin.json` (or CSV) in the same folder.

**Validate:**

```powershell
.\Test-AzureEntraControls.ps1 -OutRoot C:\evidence -AzureEntraDir C:\evidence\CUI-AzureEntra-<RunId>
```

- Produces `CUI-Validation-AzureEntra-<RunId>\validation-report-azure-entra.txt` and `validation-report-azure-entra.json`.

**CMMC Control Plane (governance mapping and auditor quick view):** The **single file** you upload to the Control Plane is **`validation-report-azure-entra.json`**. Upload it via **Governance → Evidence** (Technical onboarding). Evidence stays in the customer enclave; only this report is sent. The report includes **`report_sha256`** (integrity of the report) and **`inputs`** (per-artifact filename, sha256, size) for verification; the Control Plane displays the report hash for auditors when present.

- **Checks:** Key Vault (SC.L2-3.13.10) and NSG / no public RDP (SC.L2-3.13.5) pass when evidence artifacts are present. The **five IA/MA checks** (IA.L2-3.5.3, 3.5.4, 3.5.5, 3.5.6, MA.L2-3.7.5) pass **only if** (1) sign-in or Conditional Access evidence is present **and** (2) **MFA is attested in the enclave access path** (see below). Without (2), SSH key + RDP local = MFA-less access and those five checks **FAIL** (2 PASS, 5 FAIL total).

**MFA in access path attestation**

The validator requires **signed** MFA-in-path attestation for the five IA/MA controls to pass when using the attestation path (no CA+sign-in MFA evidence). Two files:

1. **`mfa-in-path-attested.txt`** — Attestation text (must exist and be non-empty). Add it **only after** MFA is actually in the path (e.g. VPN that requires Entra sign-in, or Azure AD login for RDP, or Bastion). Example content:

   ```
   MFA is enforced in the enclave access path. Access to the VM requires VPN with Entra sign-in (MFA) or Azure AD login for RDP. Date: YYYY-MM-DD.
   ```

2. **`mfa-in-path-attested.sig`** — Signature file. Must exist, be non-empty, and contain **`SIGNED_AT=`** (e.g. `SIGNED_AT=2026-02-28T19:40:42Z`). If the attestation is **written but not signed** (no .sig or .sig missing SIGNED_AT=), the five controls **FAIL** until the attestation is signed.

Without both files (or CA+sign-in MFA evidence), the validator reports **FAIL** for IA.L2-3.5.3, 3.5.4, 3.5.5, 3.5.6 and MA.L2-3.7.5. See `reports/AZURE_ENTRA_FIVE_CONTROLS_COMPLIANCE_STATUS.md`.

**To create the attestation (unsigned)** — then add .sig for pass:

```bash
# 1) Write attestation text (five controls will still FAIL until signed)
OUT_DIR=evidence/runs/<RunId>/raw/azure bash TRUST_CODEX/tools/write_mfa_attestation.sh
# Or: bash TRUST_CODEX/tools/write_mfa_attestation.sh evidence/runs/<RunId>/raw/azure

# 2) Sign the attestation (adds mfa-in-path-attested.sig with SIGNED_AT= and SIGNED_BY=)
OUT_DIR=evidence/runs/<RunId>/raw/azure SIGNED_BY="Authorized signer name" bash TRUST_CODEX/tools/write_mfa_attestation_sig.sh
# Or: bash TRUST_CODEX/tools/write_mfa_attestation_sig.sh evidence/runs/<RunId>/raw/azure "Authorized signer"
```

**Hardening the 4 commonly failed Azure/Entra checks**

If the validation report shows **FAIL** for ENTRA-MFA, ENTRA-MFA-MA, AZ-KEYVAULT, or AZ-NSG, you can harden as follows:

| Check | Cause | Hardening |
|-------|--------|-----------|
| **ENTRA-MFA** / **ENTRA-MFA-MA** (IA.L2-3.5.3, MA.L2-3.7.5) | Missing sign-in/CA policy file or MFA not attested (or attestation unsigned) | 1) Run `export_azure_evidence.sh`. 2) Export sign-in/CA per **§2** / **§2a** into `raw/azure/`. 3) After MFA is in the path, run `write_mfa_attestation.sh` then `write_mfa_attestation_sig.sh` (attestation must be **signed** — .sig with SIGNED_AT= — for the five controls to pass). |
| **AZ-KEYVAULT** (SC.L2-3.13.10) | No Key Vault in subscription or empty `keyvault-list.json` | Create at least one Azure Key Vault in the subscription (e.g. in the enclave resource group). Enable soft delete and purge protection. Re-run `export_azure_evidence.sh` so `keyvault-list.json` is non-empty. See `docs/SC_L2_3_13_10_Key_Management_Narrative.md`. |
| **AZ-NSG** (SC.L2-3.13.5) | Missing `nsg-list.json` or RDP open to 0.0.0.0/0 | Run `export_azure_evidence.sh`. It defaults `AZURE_RG=rg-cui-pilot-envclave` for C3PAO and always exports NSG list + rules; if the RG has no NSGs, a subscription-wide fallback (via jq) exports rules. Ensure NSG rules deny RDP from 0.0.0.0/0 (or use Bastion/JIT and add attestations). |

**One command (collect then validate):**

```powershell
.\Run-AzureEntraCollectAndValidate.ps1 -OutRoot C:\evidence -ResourceGroup <your-rg>
```

Optional: merge into an existing evidence run: `-EvidenceDir C:\evidence\CUI-Evidence-20260213-123456`.

---

## 5. Integrity and provenance

- **VM bundle:** Use the `hashes.sha256.txt` produced by `Collect-Cui-Evidence.ps1`; vault sync records it in `run.json` as `hashes_file`.
- **Exports:** Hash any exported CSV/JSON (e.g. `Get-FileHash -Algorithm SHA256`) and store the hash list with the artifacts or in the bundle `integrity/` folder.

---

## 6. How to verify validation PASS per control

For each system-enforced control, the assessor can demand proof that the **validator** reported PASS for that control’s required checks.

1. **Location:** On the VM, open the validation run folder, e.g. `C:\evidence\CUI-Validation-<RunId>\`.
2. **Files:** `validation-report.json` (machine-readable) and `validation-report.txt` (human-readable) contain `control_results` with per-control pass/fail and, where applicable, `failed_checks` and `missing_files`.
3. **Rule:** Do **not** claim a control as Met if `validation-report.json` shows any **failed** required check for that control. See `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` for the list of controls with required validator checks (e.g. AC.L2-3.1.3 → RDP-REDIR; AC.L2-3.1.11 → INACTIVITY; IA.L2-3.5.10 → NTLMV2; IA.L2-3.5.11 → AUTH-UX).
4. **Remediation:** If a check fails, run hardening (`Invoke-CuiHardening.ps1` or `Run-CuiHardeningAndValidate-Elevated.ps1`), then re-run `Collect-Cui-Evidence.ps1` and `Test-CuiHardening.ps1` with the same RunId (or a new RunId), and re-check `validation-report.json`.

---

## 7. On the enclave VM: fix FAIL controls (RDP-REDIR, NTLMV2, AUTH-UX) and re-run

When the C3PAO snuff test reports **FAIL** for AC.L2-3.1.3, IA.L2-3.5.10, or IA.L2-3.5.11, fix them on the VM then regenerate evidence and validation.

**Step 1 — Run hardening (elevated PowerShell on the VM):**

```powershell
cd C:\hardening\codex-scripts
.\Run-CuiHardeningAndValidate-Elevated.ps1 -KeepRdpAccess $true
```

This applies RDP redirection disablement, NTLM v2 (LmCompatibilityLevel), and auth UX (e.g. don’t display last user). See `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` for what each check does.

**Step 2 — Generate new evidence and validation (new RunId):**

```powershell
.\Run-CuiBulkEvidenceAndValidate-Elevated.ps1
```

Or manually with a chosen RunId (e.g. `CUI-Evidence-20260212-120000`):

```powershell
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$evidenceDir = "C:\evidence\CUI-Evidence-$runId"
$validationDir = "C:\evidence\CUI-Validation-$runId"
.\Collect-Cui-Evidence.ps1 -OutDir $evidenceDir
.\Test-CuiHardening.ps1 -EvidenceDir $evidenceDir
# Validator writes to same path as -EvidenceDir by default or use -OutDir for validation output
```

Confirm `C:\evidence\CUI-Validation-<RunId>\validation-report.json` shows **pass: true** for AC.L2-3.1.3, IA.L2-3.5.10, and IA.L2-3.5.11 (and no failed_check_ids for those controls).

**Step 3 — Update SCTM from validator output (on your repo machine):**

Copy the validation run folder from the VM to the repo (e.g. into `evidence/runs/<RunId>/` or a known path). Then run:

```bash
python3 TRUST_CODEX/tools/ingest_validation_into_sctm.py --validation-report path/to/validation-report.json
```

This updates `sctm-data.json` and `tables/SCTM_FULL_STATUS_LIST.csv` so the Manual and closeout reflect PASS for controls that passed. Rebuild manual-data and re-run the snuff test:

```bash
python3 TRUST_CODEX/manual_app/build_manual_data.py
python3 TRUST_CODEX/tools/run_c3pao_snuff_test.py
```

---

## Control-based evidence (per-control artifacts)

Evidence is produced in **run-based** folders (`CUI-Evidence-<RunId>`, `CUI-Validation-<RunId>`). To orient evidence **by control** so each control has its own manifest and (optionally) folder of artifacts—for UI links, CLI, or folder navigation—run the control evidence builder after collect + validate.

**From repo** (after pulling a run into `evidence/runs/<RunId>/raw/`):

```bash
python3 TRUST_CODEX/tools/build_control_evidence.py --run-dir evidence/runs/<RunId> --out-root evidence
```

**On the VM** (after `Run-CuiBulkEvidenceAndValidate.ps1` has produced `C:\evidence\CUI-Evidence-<RunId>` and `CUI-Validation-<RunId>`):

```powershell
python build_control_evidence.py --evidence-dir C:\evidence\CUI-Evidence-<RunId> --validation-report C:\evidence\CUI-Validation-<RunId>\validation-report.json --out-root C:\evidence
```

**Outputs** (under `--out-root`, e.g. `C:\evidence` or repo `evidence/`):

- `controls/<control_id>/manifest.json` — control_id, run_id, evidence_dir, list of artifact file paths for that control only.
- `control_evidence_index.json` — index of all controls and their artifact paths (used by the Manual app to show “Artifacts (this control)” links).

Optional: `--copy-artifacts` copies each control’s artifact files into `controls/<control_id>/` so you can open that folder and see only that control’s evidence.

The Auditor Manual tab will show **Artifacts (this control)** with clickable links to the manifest and each artifact when this index is present (e.g. `C:\evidence\control_evidence_index.json` on the VM).

---

## Reference

- Evidence Index: `tables/EVIDENCE_INDEX.md`
- Vault layout: `vault/VAULT_LAYOUT.md`
- Validator alignment: `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`
- C3PAO snuff test: `tools/run_c3pao_snuff_test.py` → `reports/C3PAO_SNUFF_TEST_FINDINGS.md`
- Ingest validator → SCTM: `tools/ingest_validation_into_sctm.py` (after copying validation-report.json from VM)
- Control-based evidence: `tools/build_control_evidence.py` (extrapolates run → per-control manifests and index)
- **Enable MFA:** See section **Enable MFA in Microsoft Entra ID** in this runbook (Option A: security defaults; Option B: Conditional Access).
