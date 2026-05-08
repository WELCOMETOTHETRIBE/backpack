# Sample Outputs

This folder describes the structure of evidence and validation outputs. **No live credentials or sensitive data are included.**

## Where Full Sample Runs Live

When this package is used from the full **cui-pilot** repository tree, full evidence runs are stored under:

- **evidence/runs/\<RunId\>/raw/CUI-Evidence-\<RunId\>/**

Example: `evidence/runs/20260228-001105/raw/CUI-Evidence-20260228-001105/`

Each run contains the directory structure documented in **01_ARCHITECTURE.md** (host/, policy/, audit/, network/, crypto/, defender/, storage/, apps/, azure/, meta/).

## OS Evidence Bundle Layout (per run)

```
CUI-Evidence-<RunId>/
├── README.txt
├── host/
│   ├── systeminfo.txt
│   ├── computerinfo.txt
│   ├── whoami-all.txt
│   ├── secureboot.txt
│   ├── tpm.txt
│   ├── deviceguard.txt
│   ├── time-sync.txt
│   ├── hotfixes.txt
│   ├── installed-roles-features.txt
│   ├── installed-software.txt
│   ├── services-security-relevant.txt
│   ├── services-remote.txt
│   ├── windows-update-policy.txt
│   └── windows-update-services.txt
├── policy/
│   ├── account-policy.txt
│   ├── local-accounts.txt
│   ├── local-groups.txt
│   ├── local-admins.txt
│   ├── local-remote-desktop-users.txt
│   ├── secpol.cfg
│   ├── secedit-export.txt
│   ├── user-rights-assignments.txt
│   ├── uac-policy.txt
│   ├── lsa.txt
│   ├── ntlm-policy.txt
│   ├── interactive-logon-notice.txt
│   ├── machine-inactivity-limit.txt
│   ├── screensaver-policy.txt
│   ├── auth-ux-policy.txt
│   ├── gpresult-computer.txt
│   ├── gpresult-user.txt
│   ├── gpresult.html
│   └── rsop.xml
├── audit/
│   ├── auditpol.txt
│   ├── auditpol-subcategories.txt
│   ├── eventlog-security.txt
│   ├── eventlog-system.txt
│   ├── eventlog-application.txt
│   ├── security-evtx-acl.txt
│   ├── eventlog-security-sample.txt
│   ├── eventlog-system-sample.txt
│   └── eventlog-4625-failed-logons.txt
├── network/
│   ├── firewall.txt
│   ├── firewall-rules-summary.txt
│   ├── listening-ports.txt
│   ├── listening-processes.txt
│   ├── rdp-policy.txt
│   ├── rdp-tcp.txt
│   ├── smb-server-config.txt
│   ├── smb-client-config.txt
│   ├── smb-signing.txt
│   ├── smb-shares.txt
│   ├── smb1-feature.txt
│   └── name-resolution-policy.txt
├── crypto/
│   ├── fips.txt
│   ├── tls-ciphersuites.txt
│   └── schannel-protocols.txt
├── defender/
│   ├── defender-status.txt
│   ├── defender-preferences.txt
│   ├── defender-threat-detections.txt
│   └── defender-scan-ages.txt
├── storage/
│   ├── bitlocker-status.txt
│   ├── removable-storage-policies.txt
│   └── usbstor.txt
├── apps/
│   └── applocker-policy.txt
├── azure/
│   └── azure-artifacts-source.txt  (or merged Azure/Entra exports)
└── meta/
    ├── manifest.json
    ├── hashes.sha256.txt
    ├── collector.json
    ├── bundle.json
    ├── collector-transcript.txt
    └── control-mapping.stub.json
```

## Validation Report Outputs

- **validate_windows_server_hardening.py** (control-plane):  
  - `validation-report-windows-hardening.json`  
  - `validation-report-windows-hardening.txt`  

- **Test-CuiHardening.ps1** (in-VM):  
  - `CUI-Validation-<ts>/report.json`  
  - `CUI-Validation-<ts>/report.txt`  

Schema and field descriptions are in **08_DATA_DICTIONARY.md**.

## Azure/Entra Sample Output Location

Azure evidence (when collected) appears under:

- **evidence/runs/\<RunId\>/raw/azure/**  
  or inside a bundle at **azure/** or **CUI-AzureEntra-\<ts\>/**

Typical files: `role-assignments-all.json`, `nsg-list.json`, `nsg-rules-*.json`, `entra-signin.json`, `conditional-access-policies.json`, `keyvault-list.json`, `keyvault-*-properties.json`, `manifest.json`.
