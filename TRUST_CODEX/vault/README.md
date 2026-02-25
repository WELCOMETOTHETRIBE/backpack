# Evidence Vault tooling

This folder contains tooling and conventions for the encrypted fileshare evidence vault.

- Vault layout definition: `VAULT_LAYOUT.md`
- Sync evidence runs into the vault: `Sync-EvidenceToVault.ps1`

## Typical usage (Windows VM / enclave host)

```powershell
# Sync all evidence runs from C:\evidence into the vault
powershell -ExecutionPolicy Bypass -File C:\CODEX\TRUST_CODEX\vault\Sync-EvidenceToVault.ps1

# Sync only one run
powershell -ExecutionPolicy Bypass -File C:\CODEX\TRUST_CODEX\vault\Sync-EvidenceToVault.ps1 -RunId 20260212-010203
```

