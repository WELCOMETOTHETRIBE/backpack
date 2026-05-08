# Commands Used

All command-line tools referenced by hardening and evidence scripts. Grouped by environment.

---

## PowerShell (Windows VM)

| Command | Description |
|---------|-------------|
| Get-ComputerInfo | System and OS information |
| Get-LocalUser | Local user accounts |
| Get-LocalGroup | Local groups |
| Get-LocalGroupMember | Members of a local group (e.g. Administrators, Remote Desktop Users) |
| Get-CimInstance (Win32_ComputerSystem, Win32_DeviceGuard, etc.) | WMI/CIM system and device guard info |
| Get-ItemProperty | Registry values (FIPS, Schannel, LSA, UAC, RDP, Terminal Server, screensaver, Windows Update) |
| Get-ChildItem | Registry keys (e.g. SCHANNEL Protocols) |
| Get-NetFirewallProfile | Firewall profile state (Enabled, DefaultInboundAction, DefaultOutboundAction) |
| Get-NetFirewallRule | Firewall rules summary |
| Get-NetTCPConnection | Listening ports and owning process |
| Get-Process | Process details by PID |
| Get-Service | Services (all or filtered, e.g. WinRM, TermService) |
| Get-HotFix | Installed hotfixes |
| Get-WindowsFeature | Installed roles/features (Server) |
| Get-WindowsOptionalFeature | Optional features (e.g. SMB1Protocol) |
| Get-SmbServerConfiguration, Get-SmbClientConfiguration, Get-SmbShare | SMB server/client config and shares |
| Get-TlsCipherSuite | TLS cipher suites (when available) |
| Get-MpComputerStatus, Get-MpPreference, Get-MpThreatDetection | Windows Defender status and preferences |
| Get-BitLockerVolume | BitLocker volume status |
| Get-AppLockerPolicy | AppLocker effective policy (XML) |
| Get-FileHash | SHA-256 of files (manifest/hashes) |
| Get-Acl | ACL on Security.evtx (audit protection) |
| Get-WinEvent | Event log samples (Security, System, 4625) |
| Confirm-SecureBootUEFI | Secure Boot state (when available) |
| Get-Tpm | TPM info (when available) |
| Set-ItemProperty, New-ItemProperty | Registry changes (hardening) |
| Set-SmbServerConfiguration, Set-SmbClientConfiguration | SMB config (disable SMB1) |
| Set-NetFirewallProfile | Firewall profile (e.g. enable, default actions) |
| net accounts | Password/lockout policy (local) |
| net user Guest /active:no | Disable Guest account |
| secedit /export /cfg | Export security policy to file |
| auditpol /get /category:*, /subcategory:* | Audit policy |
| wevtutil gl Security|System|Application | Event log configuration |
| systeminfo | System information (CLI) |
| whoami /all | Current user and groups |
| w32tm /query /status, /query /configuration | Time sync |
| gpresult /r /scope computer|user | Resultant Set of Policy (text) |
| gpresult /h <path>, /x <path> | RSOP HTML and XML export |
| Start-Transcript, Stop-Transcript | PowerShell transcript (meta/collector-transcript.txt) |
| Compress-Archive | Create evidence ZIP |

---

## Azure CLI (az)

| Command | Description |
|---------|-------------|
| az login | Interactive login |
| az account show | Current account |
| az account get-access-token | Token for Graph API |
| az role assignment list --all | RBAC role assignments (subscription) |
| az role assignment list --scope <id> | Role assignments for a resource (e.g. Key Vault) |
| az ad signin list --top 500 | Entra sign-in list (preview) |
| az network nsg list -g <rg> | NSG list in resource group |
| az network nsg rule list --nsg-name <name> -g <rg> | NSG rules |
| az keyvault list | Key Vault list |
| az keyvault show --name <name> | Key Vault properties and access policies |
| az policy assignment list | Policy assignments (hardening) |
| az keyvault show --query "properties.accessPolicies" | Key Vault access policies |

---

## Microsoft Graph (HTTP)

| Endpoint / usage | Description |
|------------------|-------------|
| GET https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies | Conditional Access policies (used by export_azure_evidence.sh via curl + token from az account get-access-token) |

---

## Windows CLI (cmd / exe)

| Command | Description |
|---------|-------------|
| systeminfo | System information |
| whoami /all | User and group membership |
| net accounts | Account policy |
| secedit.exe /export /cfg <path> | Export secpol to file |
| auditpol /get /category:* | Audit policy |
| wevtutil gl <log> | Event log configuration |
| w32tm /query /status | Time sync |
| gpresult /r /scope computer | RSOP (computer) |
| gpresult /r /scope user | RSOP (user) |
| gpresult /h <path> /f | RSOP HTML |
| gpresult /x <path> /f | RSOP XML |

---

## Bash / Shell (Linux/macOS / WSL)

| Command | Description |
|---------|-------------|
| az | Same Azure CLI as above |
| jq | JSON query (e.g. nsg-list, keyvault-list in export_azure_evidence.sh) |
| curl | Graph API call for Conditional Access |
| ssh, scp | VM access and file transfer (runbooks, push_build_to_vm) |
| date -u +%Y%m%d-%H%M%S | RunId timestamp |
| python3 | Validators and tooling |

---

## Python (control-plane / TRUST_CODEX tools)

| Usage | Description |
|-------|-------------|
| json.load / json.dump | Manifest and report read/write |
| pathlib.Path, open() | File read (evidence files, manifest) |
| hashlib.sha256 | File hashes (validator integrity) |
| argparse | CLI (validate_windows_server_hardening.py) |
| zipfile | Extract ZIP bundle for validation |
| csv | Governance document list (check-governance-documents-presence.py) |
| subprocess | Invoke validator from tests |
