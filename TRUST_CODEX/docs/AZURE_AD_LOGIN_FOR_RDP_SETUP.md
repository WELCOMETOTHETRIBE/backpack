# Azure AD (Entra) login for RDP — setup guide

Use this to enable **sign-in with your Entra account** when connecting to your Windows Server VM via the Windows Remote Desktop app. Sign-in then goes through Entra ID, so **MFA (Security Defaults or Conditional Access) is enforced** at the RDP logon.

**Requirements:** Windows Server VM in Azure (2019 or later; 2025 supported). Your Entra user (e.g. patcaru@outlook.com) must be in the same tenant as the VM’s subscription.

---

## Checklist (overview)

- [ ] **Step 1** — Enable system-assigned managed identity on the VM  
- [ ] **Step 2** — Install the “Azure AD Login for Windows” extension on the VM  
- [ ] **Step 3** — Assign RBAC role “Virtual Machine User Login” or “Virtual Machine Administrator Login” to your user  
- [ ] **Step 4** — (If needed) Adjust RDP/NLA so Entra login works  
- [ ] **Step 5** — Connect from the Windows Remote Desktop app with your Entra account and confirm MFA  

---

## Step 1 — Enable system-assigned managed identity

1. In **Azure portal**, go to **Virtual machines** and open your Windows Server VM.
2. In the left menu, select **Identity**.
3. Under **System assigned**, set **Status** to **On**.
4. Click **Save** and confirm. Wait until Status shows **On**.

**Why:** The Azure AD Login extension uses the VM’s managed identity to register the VM with Entra for RDP sign-in.

---

## Step 2 — Install the Azure AD Login for Windows extension

1. On the same VM, in the left menu select **Extensions + applications** (or **Extensions**).
2. Click **+ Add** (or **+ Create**).
3. Search for **Azure AD Login** or **AADLoginForWindows**.
4. Select **Azure AD Login for Windows** (publisher: Microsoft Corporation) and click **Next**.
5. Accept defaults and click **Review + create**, then **Create**.
6. Wait until the extension shows **Succeeded** (may take a few minutes).

**Troubleshooting:** If the extension fails, check that system-assigned identity is On and that the VM can reach Azure (outbound). Retry from the Extensions blade.

---

## Step 3 — Assign RBAC so your user can sign in

You must grant your Entra user (or a group) permission to “log in” to the VM. Do this at the **VM** level (or resource group if you prefer).

1. On the VM blade, select **Access control (IAM)** in the left menu.
2. Click **+ Add** → **Add role assignment**.
3. **Role** tab: search for **Virtual Machine User Login**.
   - For normal user access: choose **Virtual Machine User Login**.
   - For administrator access (e.g. local Admins): choose **Virtual Machine Administrator Login**.
4. Click **Next**.
5. **Members** tab: leave **User, group, or service principal** selected, click **+ Select members**.
6. Search for your account (e.g. patcaru@outlook.com) or a group, select it, click **Select**.
7. Click **Review + assign** → **Review + assign** again.

Your user (or group) can now sign in to this VM with their Entra credentials.

---

## Step 4 — RDP and Network Level Authentication (NLA)

- **Remote Desktop** must be enabled on the VM (it usually is for Azure Windows VMs).
- **CMMC AC.L2-3.1.3:** We keep **NLA enabled** on the VM. Do not disable NLA for compliance.
- **Entra (work) account and error 0x3107:** If you see “We couldn’t connect … your credentials did not work. The remote machine is AAD joined. If you are using your work account you must disable Network Level Authentication”:
  1. **Do not disable NLA.** Instead, ensure **Step 2** (AAD Login for Windows extension) and **Step 3** (role **Virtual Machine User Login** or **Virtual Machine Administrator Login** for your Entra user, e.g. `Patrick@MacTechSolutions256.onmicrosoft.com**) are done on this VM.
  2. Connect using the **Windows** Remote Desktop app (mstsc): enter the VM IP, then when prompted for credentials use your **Entra UPN** (e.g. `Patrick@MacTechSolutions256.onmicrosoft.com`) and password. The client can use Entra with NLA when the extension and RBAC are in place.
  3. Alternatively use **Azure Bastion** (if deployed): Connect → Bastion and sign in with Entra in the browser; no NLA credential conflict.
- If you cannot use Entra for RDP (e.g. extension not installed yet), use a **local account** (e.g. the VM’s local admin) and password; NLA works with local accounts and compliance is unchanged.

---

## Step 5 — Connect with the Windows Remote Desktop app using Entra

1. On your PC, open **Remote Desktop** (Windows App or `mstsc.exe`).
2. Enter the VM’s **IP address** or **hostname** (e.g. from Azure VM → Networking, or use the VM’s public IP if you’re not on a VPN).
3. Click **Connect**.
4. When the logon screen appears, **do not** enter a local account. Enter:
   - **User name:** your Entra UPN, e.g. `patcaru@outlook.com` (or your tenant primary domain).
   - **Password:** your Entra password.
   - Or, if the client shows **“Sign in with a work or school account”** or **“Use another account”**, choose that and enter your Entra email.
5. Sign in. You should see the **Entra/MFA prompt** (Authenticator app or phone) before the session opens. Complete MFA.
6. You should then be logged into the VM.

**If the client doesn’t show an option for work/school account:** Type your full UPN in the User name field (e.g. `patcaru@outlook.com`) and your Entra password. The client will send the sign-in to Entra.

**If you still get “local only” logon:** Ensure the extension is Succeeded, RBAC is assigned to this VM (or its resource group), and (if needed) NLA is disabled per Step 4. Try connecting again from a different network or after a short wait for RBAC to propagate.

---

## Optional — Azure CLI

If you use Azure CLI and want to script part of this:

```bash
# Set variables
RESOURCE_GROUP="your-resource-group"
VM_NAME="your-vm-name"
USER_EMAIL="patcaru@outlook.com"

# Enable system-assigned managed identity
az vm identity assign --resource-group $RESOURCE_GROUP --name $VM_NAME

# Add AAD Login extension
az vm extension set \
  --resource-group $RESOURCE_GROUP \
  --vm-name $VM_NAME \
  --name AADLoginForWindows \
  --publisher Microsoft.Azure.ActiveDirectory

# Assign "Virtual Machine Administrator Login" to your user (use Virtual Machine User Login for non-admin)
VM_ID=$(az vm show --resource-group $RESOURCE_GROUP --name $VM_NAME --query id -o tsv)
USER_ID=$(az ad user show --id $USER_EMAIL --query id -o tsv)
az role assignment create \
  --role "Virtual Machine Administrator Login" \
  --assignee $USER_ID \
  --scope $VM_ID
```

Then do Step 4 (NLA) on the VM if needed, and Step 5 from your PC.

---

## Reference

- [Sign in to a Windows VM in Azure using Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/devices/howto-vm-sign-in-azure-ad-windows)
- Runbook: **Enable MFA in Microsoft Entra ID** and **Enforce MFA when using the Windows RDP app** in `docs/EVIDENCE_RUNBOOK.md`
