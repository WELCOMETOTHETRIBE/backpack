# Vault SSH Access Runbook

Companion to `EnclaveWatch-Reverse-Proxy-Runbook.md`. Use this when you need a shell on `vault-001.mactechsolutionsllc.com` for EnclaveWatch deploys, debugging, or admin work.

## Quick reference (the reflexive command)

```bash
ssh-add --apple-use-keychain ~/.ssh/enclave_mfa_key
ssh admin_patrick@vault-001.mactechsolutionsllc.com
```

The first line caches the key's passphrase in macOS Keychain; you only need to run it once per macOS login session (or after a Keychain reset). After that, SSH "just works" — no passphrase prompt, no MFA prompt, no Authenticator push.

## Why "MFA" is in the key name

The key file `~/.ssh/enclave_mfa_key` is the second-factor mechanism by itself. Two-factor decomposition:

- **Have**: the file `~/.ssh/enclave_mfa_key` on disk
- **Know**: the passphrase that decrypts it

There's no separate Authenticator push, no Windows password prompt, no Duo. The vault's SSH config requires the key; the key requires its passphrase. Possession + knowledge.

This means: anyone who has BOTH the key file AND the passphrase has a shell. Treat both as a unit. Don't share either casually.

## What's connected to what

| Path | Purpose |
|---|---|
| `~/.ssh/enclave_mfa_key` (private) | The 2FA key. Encrypted with a passphrase. |
| `~/.ssh/enclave_mfa_key.pub` (public) | Counterpart in `C:\ProgramData\ssh\administrators_authorized_keys` on the vault. |
| Passphrase | Stored in macOS Keychain after `ssh-add --apple-use-keychain`. Originally set when the key was generated; recoverable from your password manager if Keychain is reset. |
| User on vault | `admin_patrick` (a local Windows admin account on the vault VM, not your Microsoft / Entra identity). |
| Hostname | `vault-001.mactechsolutionsllc.com` → currently resolves to `20.57.129.142`. |

## Failure modes and recovery

### "Bad passphrase"

You've forgotten the passphrase or are typing it wrong. Recovery options:

1. Check 1Password / your password manager for "enclave_mfa_key" or "vault SSH"
2. Check Keychain Access (Cmd+Space → "Keychain Access") for an item named `SSH: /Users/patrick/.ssh/enclave_mfa_key` — the passphrase is stored there if you ever ran `ssh-add --apple-use-keychain` successfully
3. If genuinely lost: generate a new keypair and push the new public key to the vault via Cloud Shell `az vm run-command` (see "New key" section below)

### "Permission denied (publickey,password,keyboard-interactive)"

The key file was accepted but the server still wants more. This usually means:

- `ssh-add --apple-use-keychain` hasn't been run THIS session
- macOS keychain was reset and lost the cached passphrase
- The key file got rotated and your local copy is stale

Re-run the quick-reference commands above.

### "Connection refused" or timeout

- Confirm DNS: `dig +short vault-001.mactechsolutionsllc.com` should return `20.57.129.142` (or whatever the current IP is — Azure rotates it on stop/start cycles)
- Caddy reverse-proxy or NSG rules may have changed; see `EnclaveWatch-Reverse-Proxy-Runbook.md`

### Lost the passphrase entirely (key replacement)

Generate a new keypair on the Mac:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/vault-deploy-2026-MM-DD -C "vault-deploy-2026-MM-DD"
```

Push the new public key to the vault via Cloud Shell (browser, https://shell.azure.com):
```bash
cat > /tmp/add-ssh-key.ps1 << 'EOF'
$keyPath = "C:\ProgramData\ssh\administrators_authorized_keys"
$publicKey = "<paste contents of ~/.ssh/vault-deploy-XXX.pub here>"
if (-not (Test-Path $keyPath)) { New-Item -Path $keyPath -ItemType File -Force | Out-Null }
$existing = Get-Content $keyPath -ErrorAction SilentlyContinue
if ($existing -notcontains $publicKey) { Add-Content -Path $keyPath -Value $publicKey }
$acl = Get-Acl $keyPath
$acl.SetAccessRuleProtection($true, $false)
$acl.Access | ForEach-Object { [void]$acl.RemoveAccessRule($_) }
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators","FullControl","Allow")))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM","FullControl","Allow")))
Set-Acl -Path $keyPath -AclObject $acl
Restart-Service sshd
"DONE"
EOF
az vm run-command invoke \
  --resource-group rg-cui-pilot-envclave \
  --name cui-win-pilot-01 \
  --command-id RunPowerShellScript \
  --scripts @/tmp/add-ssh-key.ps1
```

The old `enclave_mfa_key` becomes orphaned but harmless (its public counterpart is still in `administrators_authorized_keys` but anyone using it would still need the lost passphrase). To fully revoke: SSH in with the new key, manually remove the old line from `administrators_authorized_keys`.

## Shared with the EnclaveWatch dev

When the EnclaveWatch dev needs to deploy:

1. They have their own copy of `enclave_mfa_key` with the passphrase already in their own keychain
2. If they hit "passphrase required" again (Mac restart, keychain reset), Patrick refreshes their cached passphrase by sharing the secret via secure channel (1Password share, encrypted message, etc.)
3. Or generate a separate deploy key just for them via the "New key" flow above

## Permanent Azure resource references

| Resource | Identifier |
|---|---|
| Subscription | `3601ba7f-cdac-4f0a-92ab-05e92a4ca810` |
| Resource Group | `rg-cui-pilot-envclave` |
| VM Name | `cui-win-pilot-01` |
| OS | Windows Server with OpenSSH for Windows 9.5 |
| Public DNS | `vault-001.mactechsolutionsllc.com` |
| Current Public IP | `20.57.129.142` (Azure-assigned, may rotate) |

## Last verified working

- 2026-05-04 — `ssh-add --apple-use-keychain ~/.ssh/enclave_mfa_key` re-cached passphrase after macOS login keychain reset; subsequent SSH worked without prompts.
