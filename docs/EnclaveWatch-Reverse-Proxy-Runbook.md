# EnclaveWatch UI Reverse-Proxy Auth — Runbook

**Status:** Live for MacTech (`cui-win-pilot-01`) as of 2026-05-03.
**Purpose:** Document the trust contract that lets a C3PAO assessor click
"View on EnclaveWatch" from a codex vuln_remediation register row and
land directly on the per-machine timeline view, without holding
Windows-domain credentials.

## Why this exists

The codex's vuln_remediation register page renders a "↗ EnclaveWatch"
deep-link button per row when `organizations.enclavewatch_base_url` is
set. The button opens `<base_url>/Vulnerabilities?machine=<machine_id>`
in a new tab. EnclaveWatch's UI was originally Windows-Negotiate-only
(loopback binding); this runbook describes the architecture that makes
the deep-link reachable for browser-only users.

## Trust chain (in order)

1. **Auditor browser** opens the deep-link.
2. **Caddy on the vault host** receives the request on `:443`.
   - Verifies source IP is on the configured allowlist; otherwise 403.
   - Challenges for HTTP basic auth (Caddy's bcrypt-hashed user table).
   - On valid creds: sets `X-Forwarded-By: Caddy` and
     `X-Forwarded-User: <basic-auth-username>` headers, then
     reverse-proxies to `https://127.0.0.1:9443`.
3. **EnclaveWatch's `ReverseProxy` auth scheme** (commit `3bde85e`,
   `MacTech-Solutions-LLC/enclavewatch:main`) handles the request:
   - Confirms the source IP is in `EnclaveWatch.ReverseProxy.TrustedRemoteIps`
     (loopback by default — defends against header spoofing from any
     non-trusted origin; spoofed `X-Forwarded-By` from a non-loopback
     source returns Fail and is auditable).
   - Confirms `X-Forwarded-By` matches the configured trusted value.
   - Resolves the `X-Forwarded-User` value through `UserRoleMap` (or
     `DefaultRoles` if unmapped) to assign authorization.
   - Passes the request to the application as if Negotiate had succeeded.

Negotiate auth remains active alongside ReverseProxy. Direct loopback
access on the vault host (without proxy headers) still requires Windows
domain credentials. ReverseProxy is additive, not a replacement.

## Auth-of-record

**Caddy.** The C3PAO's evidence chain is:
- IP allowlist hit (logged in `C:\Caddy\logs\access.log`)
- Basic auth username (logged, password hashed in Caddyfile)
- Forwarded request to EnclaveWatch with username header

EnclaveWatch trusts Caddy as the proxy; Caddy is the gate. Rotate the
basic-auth password (and/or expand the allowlist for additional
auditors) by editing `C:\Caddy\Caddyfile` on the vault and running
`Restart-Service CaddyService`.

## File and config inventory

### On the vault host (`cui-win-pilot-01`)

| Path | Purpose |
|---|---|
| `C:\Caddy\caddy.exe` | Caddy v2 binary |
| `C:\Caddy\Caddyfile` | Site config — `handle @allowed { basic_auth; reverse_proxy }` + IP allowlist |
| `C:\Caddy\caddy-svc.exe` + `caddy-svc.xml` | WinSW wrapper registering Caddy as a Windows service |
| `C:\Caddy\logs\access.log` | Per-request access log (JSON) |
| `C:\Caddy\logs\caddy-svc.err.log` | Caddy stderr (cert issuance, errors) |
| `C:\Program Files\MacTech\EnclaveWatch\appsettings.Production.json` | EnclaveWatch config — `EnclaveWatch.ReverseProxy.*` block |

Windows services involved:

| Service name | What it does |
|---|---|
| `CaddyService` | Runs Caddy as a Windows service via WinSW |
| `MacTechEnclaveWatch` | EnclaveWatch backend (Kestrel listening on 127.0.0.1:9443) |

Network rules:

| Layer | Rule |
|---|---|
| Azure NSG | `Allow-HTTPS-Caddy-ACME` (priority 950) :443 from Internet; `Allow-HTTP-ACME` (priority 951) :80 from Internet |
| Windows Firewall | `Caddy HTTPS Inbound` and `Caddy HTTP ACME Inbound` |

The :80 rule exists for ACME HTTP-01 / TLS-ALPN-01 cert renewal.
Public 443 is gated by Caddy's IP allowlist + basic auth, not the NSG.

### On the codex (this repo)

| Field | Use |
|---|---|
| `organizations.enclavewatch_base_url` | When set, the codex renders the deep-link button on vuln_remediation register rows |

To enable for a new customer: install Caddy + ReverseProxy config on
their vault, then `UPDATE organizations SET enclavewatch_base_url =
'https://<vault-dns-name>' WHERE id = '<customer-org-id>'`. To disable:
set the column back to NULL.

## Cert renewal

Caddy auto-renews the Let's Encrypt cert ~30 days before expiry via
TLS-ALPN-01 (port 443) or HTTP-01 (port 80). Both NSG rules and both
firewall rules must remain in place for renewal to succeed.

Verify cert state at any time with:

```bash
openssl s_client -servername <vault-dns> -connect <vault-dns>:443 \
  </dev/null 2>/dev/null | openssl x509 -noout -dates
```

If renewal ever fails, look at `C:\Caddy\logs\caddy-svc.err.log`.

## Rotating basic-auth credentials

```powershell
# On the vault host (admin_patrick session)
$pw = -join ((48..57+65..90+97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
$hash = & C:\Caddy\caddy.exe hash-password --plaintext $pw
Write-Host "New password: $pw"
Write-Host "New hash:     $hash"
# Edit C:\Caddy\Caddyfile, replace the bcrypt hash on the `auditor` line,
# save, then:
Restart-Service CaddyService
```

Communicate the new password out-of-band to the auditor. There's only
ever one credential at a time today; if multi-auditor support is needed,
add a second `username hash` line under `basic_auth { ... }`.

## What a C3PAO will ask, and where to point them

| Question | Answer |
|---|---|
| "How is the EnclaveWatch UI protected?" | Three layers: Caddy IP allowlist, Caddy basic auth, EnclaveWatch role check (`Reviewer` only via `UserRoleMap`). |
| "Show me the access log." | `C:\Caddy\logs\access.log` (JSON, source IP + path + status + duration per request). |
| "Can someone outside the allowlist get in?" | No — Caddy returns 403 before basic auth fires. Confirmable from any non-allowlisted IP. |
| "Can someone forge the proxy header?" | No — EnclaveWatch's `ReverseProxy` auth checks `TrustedRemoteIps` (loopback only); a forged `X-Forwarded-By` from a non-loopback origin Fails (auditable). |
| "What if Caddy is bypassed?" | EnclaveWatch's Negotiate auth remains active. Direct connections to `127.0.0.1:9443` (only reachable from the vault host itself) still need Windows-domain credentials. |
| "Who has Admin role?" | Nobody via the proxy path. The proxied `auditor` user is mapped to `Reviewer` only. Admin must be explicitly added to `UserRoleMap` per-user. |

## Tear-down (to disable the deep-link cleanly)

```sql
-- 1. Hide the codex deep-link button
UPDATE organizations SET enclavewatch_base_url = NULL
WHERE id = '<customer-org-id>';
```

```powershell
# 2. (Optional) stop accepting public traffic on the vault
Stop-Service CaddyService
Set-Service CaddyService -StartupType Disabled
# Optional: az network nsg rule delete --name Allow-HTTPS-Caddy-ACME ...
# Optional: az network nsg rule delete --name Allow-HTTP-ACME ...
```

```jsonc
// 3. (Optional) revert EnclaveWatch to Negotiate-only by editing
// appsettings.Production.json and setting:
// "EnclaveWatch": { "ReverseProxy": { "Enabled": false, ... } }
// then Restart-Service MacTechEnclaveWatch
```

The original `appsettings.Production.json` is backed up alongside the
edited file with a timestamp suffix
(`appsettings.Production.json.bak-<YYYYMMDD-HHMMSS>`).

## Reference

- EnclaveWatch repo: `MacTech-Solutions-LLC/enclavewatch:main`
- Reverse-proxy auth scheme: commit `3bde85e`
- `VulnFindingTracker` (lifecycle source-of-truth):
  `src/EnclaveWatch.Infrastructure/Codex/VulnFindingTracker.cs`
- Codex schema field: `organizations.enclavewatch_base_url`
  (migration `0051_enclavewatch_base_url.sql`)
- Codex deep-link render site:
  `src/app/dashboard/evidence-engine/registers/[registerId]/page.tsx`
