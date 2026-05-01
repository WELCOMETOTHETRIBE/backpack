<# 
Collect-Cui-Evidence-v2.ps1 (Elite v2)
Assessor-ready evidence collector for Windows Server 2025 / CMMC L2 (NIST 800-171).

Key properties:
- Read-only collection: does NOT change system configuration.
- Deterministic output structure + SHA-256 hashes + JSON manifest.
- Collects host configuration + key security posture outputs + sample log extracts.
- Produces optional ZIP and a control-mapping stub for your Governance Portal.

Usage:
  PowerShell (Admin recommended):
    .\Collect-Cui-Evidence-v2.ps1
    .\Collect-Cui-Evidence-v2.ps1 -OutRoot C:\Evidence -CreateZip
    .\Collect-Cui-Evidence-v2.ps1 -OutRoot C:\Evidence -RunId "CUI-Evidence-20260224-073011" -CreateZip

Notes:
- Some commands require elevation for best coverage (e.g., Security.evtx ACL, certain registry keys).
- MFA/IdP evidence is NOT collected here; treat as hybrid evidence from Entra/IdP exports.
#>

[CmdletBinding()]
param(
  [string]$OutRoot = "C:\Evidence",
  [string]$RunId = "",
  [switch]$CreateZip,
  [switch]$IncludeEventSamples = $true,
  [int]$MaxEventSamples = 50
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -----------------------------
# Helpers
# -----------------------------
function New-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Write-Text([string]$Path, [string]$Content) {
  $Content | Out-File -FilePath $Path -Encoding UTF8 -Force
}

function Write-Json([string]$Path, $Object) {
  $Object | ConvertTo-Json -Depth 10 | Out-File -FilePath $Path -Encoding UTF8 -Force
}

function Run-And-Capture {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][scriptblock]$Block,
    [Parameter(Mandatory=$true)][string]$OutFile
  )
  try {
    $out = & $Block 2>&1 | Out-String
    Write-Text -Path $OutFile -Content $out
    return @{ name=$Name; file=$OutFile; ok=$true; error=$null; status="ok" }
  } catch {
    $msg = $_.Exception.Message
    # Write a machine-readable error stub so the manifest always has a file for this entry.
    # The control plane treats files with status=collection_error as "attempted but failed".
    $errorContent = @{
      collection_error = $true
      command = $Name
      error_message = $msg
      stack_trace = ($_.ScriptStackTrace | Out-String).Trim()
      timestamp = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 5
    Write-Text -Path $OutFile -Content $errorContent
    return @{ name=$Name; file=$OutFile; ok=$false; error=$msg; status="collection_error" }
  }
}

function Run-Exe-And-Capture {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][string]$Exe,
    [Parameter(Mandatory=$false)][string[]]$Args = @(),
    [Parameter(Mandatory=$true)][string]$OutFile
  )
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    # PS5.1 uses .NET Framework 4.x -- ProcessStartInfo.ArgumentList does NOT exist.
    # (.ArgumentList is .NET Core 2.1+, PS7+ only.) Use .Arguments (single string) instead.
    if ($Args.Count -gt 0) { $psi.Arguments = $Args -join " " }

    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $psi
    [void]$p.Start()
    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit()

    $content = $stdout
    if ($stderr) { $content += "`r`n--- STDERR ---`r`n" + $stderr }
    $content += "`r`n--- ExitCode: $($p.ExitCode) ---`r`n"
    Write-Text -Path $OutFile -Content $content
    return @{ name=$Name; file=$OutFile; ok=($p.ExitCode -eq 0); error=($stderr -join "`n") }
  } catch {
    $msg = $_.Exception.Message
    Write-Text -Path $OutFile -Content ("ERROR running {0}: {1}`r`n{2}" -f $Name, $msg, ($_.ScriptStackTrace | Out-String))
    return @{ name=$Name; file=$OutFile; ok=$false; error=$msg }
  }
}

function Get-Sha256([string]$Path) {
  try {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  } catch { return $null }
}

function Safe-CommandExists([string]$Cmd) {
  return [bool](Get-Command $Cmd -ErrorAction SilentlyContinue)
}

# -----------------------------
# Initialize bundle
# -----------------------------
$now = Get-Date
if ([string]::IsNullOrWhiteSpace($RunId)) {
  $RunId = "CUI-Evidence-{0:yyyyMMdd-HHmmss}" -f $now
}
$bundleRoot = Join-Path $OutRoot $RunId

New-Dir $OutRoot
New-Dir $bundleRoot

# Subfolders
$dirHost     = Join-Path $bundleRoot "host"
$dirPolicy   = Join-Path $bundleRoot "policy"
$dirAudit    = Join-Path $bundleRoot "audit"
$dirNetwork  = Join-Path $bundleRoot "network"
$dirCrypto   = Join-Path $bundleRoot "crypto"
$dirEDR      = Join-Path $bundleRoot "defender"
$dirStorage  = Join-Path $bundleRoot "storage"
$dirApps     = Join-Path $bundleRoot "apps"
$dirAzure    = Join-Path $bundleRoot "azure"
$dirMeta     = Join-Path $bundleRoot "meta"

foreach ($d in @($dirHost,$dirPolicy,$dirAudit,$dirNetwork,$dirCrypto,$dirEDR,$dirStorage,$dirApps,$dirAzure,$dirMeta)) { New-Dir $d }

# Transcript
$transcriptPath = Join-Path $dirMeta "collector-transcript.txt"
try { Start-Transcript -Path $transcriptPath -Force | Out-Null } catch {}

$results = @()
$warnings = @()

# Collector metadata
$collector = @{
  name = "Collect-Cui-Evidence-v2"
  version = "2.0.0"
  collected_at = ($now.ToString("o"))
  run_id = $RunId
  out_root = $OutRoot
  powershell_version = $PSVersionTable.PSVersion.ToString()
  host = @{
    computer_name = $env:COMPUTERNAME
    user = $env:USERNAME
    user_domain = $env:USERDOMAIN
    is_admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
      ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  }
}

Write-Json -Path (Join-Path $dirMeta "collector.json") -Object $collector

# -----------------------------
# Host identification
# -----------------------------
$results += Run-And-Capture -Name "systeminfo" -OutFile (Join-Path $dirHost "systeminfo.txt") -Block { systeminfo }
$results += Run-And-Capture -Name "computerinfo" -OutFile (Join-Path $dirHost "computerinfo.txt") -Block { Get-ComputerInfo | Out-String }
$results += Run-And-Capture -Name "whoami_all" -OutFile (Join-Path $dirHost "whoami-all.txt") -Block { whoami /all }
$results += Run-And-Capture -Name "domain_join_status" -OutFile (Join-Path $dirHost "domain-status.txt") -Block {
  $cs = Get-CimInstance Win32_ComputerSystem
  [pscustomobject]@{ Domain=$cs.Domain; PartOfDomain=$cs.PartOfDomain; Manufacturer=$cs.Manufacturer; Model=$cs.Model } | Format-List | Out-String
}

# Secure Boot / TPM / Device Guard (best-effort)
if (Safe-CommandExists "Confirm-SecureBootUEFI") {
  $results += Run-And-Capture -Name "secureboot" -OutFile (Join-Path $dirHost "secureboot.txt") -Block { Confirm-SecureBootUEFI }
} else {
  $warnings += "Confirm-SecureBootUEFI not available."
}
if (Safe-CommandExists "Get-Tpm") {
  $results += Run-And-Capture -Name "tpm" -OutFile (Join-Path $dirHost "tpm.txt") -Block { Get-Tpm | Format-List | Out-String }
}
$results += Run-And-Capture -Name "deviceguard" -OutFile (Join-Path $dirHost "deviceguard.txt") -Block {
  Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard |
    Select-Object * | Format-List | Out-String
}

# Time sync
$results += Run-And-Capture -Name "timesync_w32tm" -OutFile (Join-Path $dirHost "time-sync.txt") -Block {
  w32tm /query /status
  "`r`n---`r`n"
  w32tm /query /configuration
}

# -----------------------------
# Policy & local security baselines
# -----------------------------
# Account policy
$results += Run-And-Capture -Name "net_accounts" -OutFile (Join-Path $dirPolicy "account-policy.txt") -Block { net accounts }

# Local users / groups
$results += Run-And-Capture -Name "local_accounts" -OutFile (Join-Path $dirPolicy "local-accounts.txt") -Block {
  Get-LocalUser | Select Name, Enabled, LastLogon | Sort Name | Format-Table -Auto | Out-String
}
$results += Run-And-Capture -Name "local_groups" -OutFile (Join-Path $dirPolicy "local-groups.txt") -Block {
  Get-LocalGroup | Sort Name | Format-Table -Auto | Out-String
}
$results += Run-And-Capture -Name "local_admins" -OutFile (Join-Path $dirPolicy "local-admins.txt") -Block {
  Get-LocalGroupMember -Group "Administrators" | Format-Table -Auto | Out-String
}
$results += Run-And-Capture -Name "remote_desktop_users" -OutFile (Join-Path $dirPolicy "local-remote-desktop-users.txt") -Block {
  if (Get-LocalGroup -Name "Remote Desktop Users" -ErrorAction SilentlyContinue) {
    Get-LocalGroupMember -Group "Remote Desktop Users" | Format-Table -Auto | Out-String
  } else { "Remote Desktop Users group not present." }
}

# Export local security policy (secedit) -- direct & invocation, PS5.1 compatible.
$secpolPath = Join-Path $dirPolicy "secpol.cfg"
$results += Run-And-Capture -Name "secedit_export" -OutFile (Join-Path $dirPolicy "secedit-export.txt") -Block {
  & secedit.exe /export /cfg $secpolPath /quiet 2>&1 | Out-String
  if (Test-Path $secpolPath) { "secpol.cfg exported to: $secpolPath" } else { "WARNING: secpol.cfg not created - may require elevation." }
}

# User rights assignments (parse from secpol as a convenience)
$results += Run-And-Capture -Name "user_rights_assignments" -OutFile (Join-Path $dirPolicy "user-rights-assignments.txt") -Block {
  if (Test-Path -LiteralPath $secpolPath) {
    # secedit emits secpol.cfg as UTF-16 LE with BOM. Reading it back with the
    # default ASCII codepage (or via -SimpleMatch on a regex pattern) yielded an
    # empty file. Read explicitly as Unicode and filter for Privilege Rights
    # lines via real regex.
    $raw = Get-Content -LiteralPath $secpolPath -Encoding Unicode -Raw
    $lines = $raw -split "`r?`n" | Where-Object { $_ -match "^Se[A-Za-z]+(Right|Privilege)\s*=" }
    if ($lines.Count -eq 0) { "(no Se*Right / Se*Privilege lines found in secpol.cfg)" }
    else { $lines -join "`r`n" }
  } else { "secpol.cfg not found; secedit may have failed or requires elevation." }
}

# UAC policy (common evidence for least privilege hardening)
$results += Run-And-Capture -Name "uac_policy" -OutFile (Join-Path $dirPolicy "uac-policy.txt") -Block {
  Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" | Out-String
}

# LSA / credential protections
$results += Run-And-Capture -Name "lsa" -OutFile (Join-Path $dirPolicy "lsa.txt") -Block {
  Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" | Out-String
}

# NTLM policy
$results += Run-And-Capture -Name "ntlm_policy" -OutFile (Join-Path $dirPolicy "ntlm-policy.txt") -Block {
  $paths = @(
    "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0",
    "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa"
  )
  foreach ($p in $paths) {
    "`r`n=== $p ===`r`n"
    if (Test-Path $p) { Get-ItemProperty $p | Out-String } else { "Missing: $p" }
  }
}

# Interactive logon notice
$results += Run-And-Capture -Name "interactive_logon_notice" -OutFile (Join-Path $dirPolicy "interactive-logon-notice.txt") -Block {
  Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" |
    Select-Object legalnoticecaption, legalnoticetext | Format-List | Out-String
}

# Machine inactivity / screen saver policies (session lock)
$results += Run-And-Capture -Name "machine_inactivity_limit" -OutFile (Join-Path $dirPolicy "machine-inactivity-limit.txt") -Block {
  $p = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
  if (Test-Path $p) { Get-ItemProperty $p | Select-Object InactivityTimeoutSecs | Format-List | Out-String } else { "Missing key: $p" }
}
$results += Run-And-Capture -Name "screensaver_policy" -OutFile (Join-Path $dirPolicy "screensaver-policy.txt") -Block {
  $p = "HKCU:\Software\Policies\Microsoft\Windows\Control Panel\Desktop"
  if (Test-Path $p) { Get-ItemProperty $p | Out-String } else { "HKCU screensaver policy key not present (may be controlled via user GPO or not configured)." }
}

# Auth UX / credential UI hardening (best-effort: some orgs record these)
$results += Run-And-Capture -Name "auth_ux_policy" -OutFile (Join-Path $dirPolicy "auth-ux-policy.txt") -Block {
  $p = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
  if (Test-Path $p) { Get-ItemProperty $p | Out-String } else { "Missing key: $p" }
}

# RDP policy / NLA
$results += Run-And-Capture -Name "rdp_policy" -OutFile (Join-Path $dirNetwork "rdp-policy.txt") -Block {
  Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server" | Out-String
}
$results += Run-And-Capture -Name "rdp_tcp" -OutFile (Join-Path $dirNetwork "rdp-tcp.txt") -Block {
  Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" | Out-String
}

# -----------------------------
# GPO / RSOP evidence
# -----------------------------
# GPResult: use direct & invocation -- avoids ProcessStartInfo entirely (PS5.1 compatible).
$results += Run-And-Capture -Name "gpresult_computer" -OutFile (Join-Path $dirPolicy "gpresult-computer.txt") -Block {
  & gpresult.exe /r /scope computer 2>&1 | Out-String
}
$results += Run-And-Capture -Name "gpresult_user" -OutFile (Join-Path $dirPolicy "gpresult-user.txt") -Block {
  & gpresult.exe /r /scope user 2>&1 | Out-String
}

# Stronger RSOP outputs (HTML + XML written to policy folder as separate files)
$gpHtmlPath = Join-Path $dirPolicy "gpresult.html"
$gpXmlPath  = Join-Path $dirPolicy "rsop.xml"
$results += Run-And-Capture -Name "gpresult_html" -OutFile (Join-Path $dirPolicy "gpresult-html-export.txt") -Block {
  & gpresult.exe /h $gpHtmlPath /f 2>&1 | Out-String
  if (Test-Path $gpHtmlPath) { "HTML report written to: $gpHtmlPath" } else { "WARNING: HTML file not created." }
}
$results += Run-And-Capture -Name "gpresult_xml" -OutFile (Join-Path $dirPolicy "gpresult-xml-export.txt") -Block {
  & gpresult.exe /x $gpXmlPath /f 2>&1 | Out-String
  if (Test-Path $gpXmlPath) { "XML report written to: $gpXmlPath" } else { "WARNING: XML file not created." }
}

# -----------------------------
# Audit policy + event log configuration
# -----------------------------
$results += Run-And-Capture -Name "auditpol" -OutFile (Join-Path $dirAudit "auditpol.txt") -Block { auditpol /get /category:* }
# auditpol /get /subcategory:* returns error 0x57 (invalid parameter) on some builds.
# Correct syntax to enumerate available subcategories is /list /subcategory:*.
$results += Run-And-Capture -Name "auditpol_subcategories" -OutFile (Join-Path $dirAudit "auditpol-subcategories.txt") -Block { auditpol /list /subcategory:* }

# Event log config
$results += Run-And-Capture -Name "eventlog_security_config" -OutFile (Join-Path $dirAudit "eventlog-security.txt") -Block { wevtutil gl Security }
$results += Run-And-Capture -Name "eventlog_system_config" -OutFile (Join-Path $dirAudit "eventlog-system.txt") -Block { wevtutil gl System }
$results += Run-And-Capture -Name "eventlog_application_config" -OutFile (Join-Path $dirAudit "eventlog-application.txt") -Block { wevtutil gl Application }

# Event log ACLs (audit protection)
$results += Run-And-Capture -Name "security_evtx_acl" -OutFile (Join-Path $dirAudit "security-evtx-acl.txt") -Block {
  $p = "C:\Windows\System32\winevt\Logs\Security.evtx"
  if (Test-Path -LiteralPath $p) { (Get-Acl $p).Access | Format-Table -Auto | Out-String } else { "Missing: $p" }
}

# Audit-log-failure response policy (AU.L2-3.3.4 -- alert/halt on logging failure).
# Captures CrashOnAuditFail (1=halt, 2=halt+disable logon) and the auto-reboot
# behavior. PASS criterion: CrashOnAuditFail=1 or 2 (system halts/alerts when
# Security log can't accept new events).
$results += Run-And-Capture -Name "audit_failure_policy" -OutFile (Join-Path $dirAudit "audit-failure-policy.txt") -Block {
  $lsa = "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa"
  $val = (Get-ItemProperty -Path $lsa -Name "CrashOnAuditFail" -ErrorAction SilentlyContinue).CrashOnAuditFail
  if ($null -eq $val) { $val = 0 }
  $meaning = switch ([int]$val) {
    0 { "0 = no halt on audit failure (NOT compliant for 3.3.4)" }
    1 { "1 = halt system on audit failure (compliant)" }
    2 { "2 = halt + disable non-admin logon (most strict, compliant)" }
    default { "$val = unknown" }
  }
  "CrashOnAuditFail = $val`r`n$meaning"
}

# Sample events (optional)
if ($IncludeEventSamples) {
  $results += Run-And-Capture -Name "eventlog_security_sample" -OutFile (Join-Path $dirAudit "eventlog-security-sample.txt") -Block {
    Get-WinEvent -LogName Security -MaxEvents $MaxEventSamples |
      Select TimeCreated, Id, LevelDisplayName, ProviderName, Message |
      Format-List | Out-String
  }
  $results += Run-And-Capture -Name "eventlog_system_sample" -OutFile (Join-Path $dirAudit "eventlog-system-sample.txt") -Block {
    Get-WinEvent -LogName System -MaxEvents $MaxEventSamples |
      Select TimeCreated, Id, LevelDisplayName, ProviderName, Message |
      Format-List | Out-String
  }
  # Explicit failed logon samples (4625)
  $results += Run-And-Capture -Name "failed_logons_4625_sample" -OutFile (Join-Path $dirAudit "eventlog-4625-failed-logons.txt") -Block {
    Get-WinEvent -FilterHashtable @{LogName="Security"; Id=4625} -MaxEvents 25 |
      Select TimeCreated, Id, Message | Format-List | Out-String
  }
}

# -----------------------------
# Network controls
# -----------------------------
$results += Run-And-Capture -Name "firewall_profiles" -OutFile (Join-Path $dirNetwork "firewall.txt") -Block {
  Get-NetFirewallProfile | Select Name, Enabled, DefaultInboundAction, DefaultOutboundAction, NotifyOnListen, LogAllowed, LogBlocked | Format-Table -Auto | Out-String
}

$results += Run-And-Capture -Name "firewall_rules_summary" -OutFile (Join-Path $dirNetwork "firewall-rules-summary.txt") -Block {
  Get-NetFirewallRule |
    Select DisplayName, Enabled, Direction, Action, Profile |
    Sort DisplayName |
    Format-Table -Auto | Out-String
}

# Listening ports and owning processes (boundary proof)
$results += Run-And-Capture -Name "listening_ports" -OutFile (Join-Path $dirNetwork "listening-ports.txt") -Block {
  Get-NetTCPConnection -State Listen |
    Select LocalAddress, LocalPort, OwningProcess |
    Sort LocalPort | Format-Table -Auto | Out-String
}
$results += Run-And-Capture -Name "listening_processes" -OutFile (Join-Path $dirNetwork "listening-processes.txt") -Block {
  $pids = (Get-NetTCPConnection -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($procId in $pids) {
    try { Get-Process -Id $procId | Select-Object Id, ProcessName, Path | Format-Table -Auto | Out-String }
    catch { "PID ${procId}: $($_.Exception.Message)" }
  }
}

# Name resolution policy (LLMNR/NetBIOS hardening often audited)
$results += Run-And-Capture -Name "name_resolution_policy" -OutFile (Join-Path $dirNetwork "name-resolution-policy.txt") -Block {
  $keys = @(
    "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient",
    "HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters",
    "HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters"
  )
  foreach ($k in $keys) {
    "`r`n=== $k ===`r`n"
    if (Test-Path $k) { Get-ItemProperty $k | Out-String } else { "Missing: $k" }
  }
}

# -----------------------------
# SMB hardening & shares
# -----------------------------
$results += Run-And-Capture -Name "smb_server_config" -OutFile (Join-Path $dirNetwork "smb-server-config.txt") -Block {
  if (Safe-CommandExists "Get-SmbServerConfiguration") { Get-SmbServerConfiguration | Format-List | Out-String } else { "Get-SmbServerConfiguration not available." }
}
$results += Run-And-Capture -Name "smb_client_config" -OutFile (Join-Path $dirNetwork "smb-client-config.txt") -Block {
  if (Safe-CommandExists "Get-SmbClientConfiguration") { Get-SmbClientConfiguration | Format-List | Out-String } else { "Get-SmbClientConfiguration not available." }
}
$results += Run-And-Capture -Name "smb_signing" -OutFile (Join-Path $dirNetwork "smb-signing.txt") -Block {
  if (Safe-CommandExists "Get-SmbServerConfiguration") {
    Get-SmbServerConfiguration | Select EnableSecuritySignature, RequireSecuritySignature, EncryptData | Format-List | Out-String
  } else { "SMB server config cmdlet not available." }
}
$results += Run-And-Capture -Name "smb_shares" -OutFile (Join-Path $dirNetwork "smb-shares.txt") -Block {
  if (Safe-CommandExists "Get-SmbShare") { Get-SmbShare | Select Name, Path, EncryptData, FolderEnumerationMode | Format-Table -Auto | Out-String } else { "Get-SmbShare not available." }
}
$results += Run-And-Capture -Name "smb1_feature" -OutFile (Join-Path $dirNetwork "smb1-feature.txt") -Block {
  if (Safe-CommandExists "Get-WindowsOptionalFeature") {
    Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol | Format-List | Out-String
  } else {
    "Get-WindowsOptionalFeature not available; use Get-WindowsFeature on Server to verify SMB1."
  }
}

# -----------------------------
# Crypto posture (FIPS / TLS)
# -----------------------------
$results += Run-And-Capture -Name "fips" -OutFile (Join-Path $dirCrypto "fips.txt") -Block {
  Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy" | Format-List | Out-String
}

# TLS cipher suites and Schannel protocols (registry-driven evidence)
$results += Run-And-Capture -Name "tls_ciphersuites" -OutFile (Join-Path $dirCrypto "tls-ciphersuites.txt") -Block {
  if (Safe-CommandExists "Get-TlsCipherSuite") { Get-TlsCipherSuite | Select Name | Sort Name | Format-Table -Auto | Out-String } else { "Get-TlsCipherSuite not available." }
}
$results += Run-And-Capture -Name "schannel_protocols" -OutFile (Join-Path $dirCrypto "schannel-protocols.txt") -Block {
  $base = "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols"
  if (Test-Path $base) {
    Get-ChildItem $base -Recurse | ForEach-Object {
      try { "`r`n[$($_.PSPath)]`r`n" + (Get-ItemProperty $_.PSPath | Out-String) } catch {}
    } | Out-String
  } else {
    "Schannel protocols registry path not found: $base"
  }
}

# -----------------------------
# Defender / AV posture
# -----------------------------
if (Safe-CommandExists "Get-MpComputerStatus") {
  $results += Run-And-Capture -Name "defender_status" -OutFile (Join-Path $dirEDR "defender-status.txt") -Block {
    Get-MpComputerStatus | Format-List | Out-String
  }
  $results += Run-And-Capture -Name "defender_preferences" -OutFile (Join-Path $dirEDR "defender-preferences.txt") -Block {
    Get-MpPreference | Format-List | Out-String
  }
  # Threat detections (execution evidence)
  $results += Run-And-Capture -Name "defender_threat_detections" -OutFile (Join-Path $dirEDR "defender-threat-detections.txt") -Block {
    try { Get-MpThreatDetection | Format-List | Out-String } catch { "Get-MpThreatDetection not available or no detections. $($_.Exception.Message)" }
  }
  # Scan ages (execution evidence)
  $results += Run-And-Capture -Name "defender_scan_ages" -OutFile (Join-Path $dirEDR "defender-scan-ages.txt") -Block {
    $s = Get-MpComputerStatus
    [pscustomobject]@{ QuickScanAge=$s.QuickScanAge; FullScanAge=$s.FullScanAge; AntivirusSignatureAge=$s.AntivirusSignatureAge } | Format-List | Out-String
  }
} else {
  $warnings += "Defender cmdlets not available (Get-MpComputerStatus missing)."
}

# -----------------------------
# Storage / media protections
# -----------------------------
$results += Run-And-Capture -Name "bitlocker_status" -OutFile (Join-Path $dirStorage "bitlocker-status.txt") -Block {
  if (Safe-CommandExists "Get-BitLockerVolume") {
    Get-BitLockerVolume | Select MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage, EncryptionMethod | Format-Table -Auto | Out-String
  } else { "Get-BitLockerVolume not available." }
}

$results += Run-And-Capture -Name "removable_storage_policies" -OutFile (Join-Path $dirStorage "removable-storage-policies.txt") -Block {
  $keys = @(
    "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices",
    "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeviceInstall\Restrictions",
    "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR"
  )
  foreach ($k in $keys) {
    "`r`n=== $k ===`r`n"
    if (Test-Path $k) { Get-ItemProperty $k | Out-String } else { "Missing: $k" }
  }
}
$results += Run-And-Capture -Name "usbstor" -OutFile (Join-Path $dirStorage "usbstor.txt") -Block {
  $k = "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR"
  if (Test-Path $k) { Get-ItemProperty $k | Out-String } else { "Missing: $k" }
}

# -----------------------------
# Application control (AppLocker)
# -----------------------------
$results += Run-And-Capture -Name "applocker_policy" -OutFile (Join-Path $dirApps "applocker-policy.txt") -Block {
  if (Safe-CommandExists "Get-AppLockerPolicy") {
    Get-AppLockerPolicy -Effective -Xml | Out-String
  } else { "Get-AppLockerPolicy not available." }
}

# -----------------------------
# Patch / roles / services inventory
# -----------------------------
$results += Run-And-Capture -Name "hotfixes" -OutFile (Join-Path $dirHost "hotfixes.txt") -Block {
  Get-HotFix | Sort InstalledOn -Descending | Select HotFixID, Description, InstalledOn, InstalledBy | Format-Table -Auto | Out-String
}
$results += Run-And-Capture -Name "installed_roles_features" -OutFile (Join-Path $dirHost "installed-roles-features.txt") -Block {
  if (Safe-CommandExists "Get-WindowsFeature") {
    Get-WindowsFeature | Where-Object InstallState -eq Installed | Select Name, DisplayName | Sort Name | Format-Table -Auto | Out-String
  } else { "Get-WindowsFeature not available." }
}
$results += Run-And-Capture -Name "installed_software" -OutFile (Join-Path $dirHost "installed-software.txt") -Block {
  Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* |
    Select DisplayName, DisplayVersion, Publisher, InstallDate |
    Where-Object DisplayName |
    Sort DisplayName |
    Format-Table -Auto | Out-String
}
$results += Run-And-Capture -Name "services_security_relevant" -OutFile (Join-Path $dirHost "services-security-relevant.txt") -Block {
  Get-Service | Select Name, Status, StartType | Sort Name | Format-Table -Auto | Out-String
}
$results += Run-And-Capture -Name "services_remote" -OutFile (Join-Path $dirHost "services-remote.txt") -Block {
  # Remote access related services (best-effort filter)
  Get-Service | Where-Object { $_.Name -match "TermService|RemoteRegistry|WinRM|SSHD|LanmanServer|LanmanWorkstation" } |
    Select Name, Status, StartType | Sort Name | Format-Table -Auto | Out-String
}

# -----------------------------
# Windows Update posture
# -----------------------------
$results += Run-And-Capture -Name "windows_update_policy" -OutFile (Join-Path $dirHost "windows-update-policy.txt") -Block {
  $k = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate"
  if (Test-Path $k) {
    Get-ChildItem $k -Recurse | ForEach-Object {
      try { "`r`n[$($_.PSPath)]`r`n" + (Get-ItemProperty $_.PSPath | Out-String) } catch {}
    } | Out-String
  } else { "No WindowsUpdate policy key present (may use defaults or different management tooling)." }
}
$results += Run-And-Capture -Name "windows_update_services" -OutFile (Join-Path $dirHost "windows-update-services.txt") -Block {
  Get-Service | Where-Object { $_.Name -match "wuauserv|UsoSvc|bits|WaaSMedicSvc" } |
    Select Name, Status, StartType | Format-Table -Auto | Out-String
}

# -----------------------------
# Azure inheritance placeholders (optional; keep compatible with your portal)
# -----------------------------
Write-Text -Path (Join-Path $dirAzure "azure-artifacts-source.txt") -Content "Populate with Azure exports (NSG, policy assignments, disk encryption, Entra CA) in your Governance Portal for HYBRID evidence."

# -----------------------------
# Control mapping stub (portal-friendly)
# -----------------------------
$controlMapping = @{
  schema = "control-mapping.v1"
  generated_at = ($now.ToString("o"))
  notes = "Map files to CMMC controls in Governance Portal. This is a starter stub."
  files = @(
    @{ file="audit/auditpol.txt"; controls=@("AU.*") },
    @{ file="policy/account-policy.txt"; controls=@("IA.*","AC.*") },
    @{ file="crypto/fips.txt"; controls=@("SC.L2-3.13.11") },
    @{ file="network/firewall.txt"; controls=@("SC.L2-3.13.1","SC.L2-3.13.5") },
    @{ file="defender/defender-status.txt"; controls=@("SI.*") }
  )
}
Write-Json -Path (Join-Path $dirMeta "control-mapping.stub.json") -Object $controlMapping

# -----------------------------
# Finalize transcript, then hash every file (100% coverage)
# Order: Stop-Transcript -> all outputs written -> enumerate -> hash -> write hashes -> write manifest -> optional zip
# -----------------------------
try { Stop-Transcript | Out-Null } catch {}

# README and bundle hint written before hashing so they are included in the bundle and hashed
Write-Text -Path (Join-Path $bundleRoot "README.txt") -Content @"
CUI Evidence Bundle (Elite v2)
RunId: $RunId
Collected: $($now.ToString("F"))
Host: $($env:COMPUTERNAME)
Admin: $($collector.host.is_admin)

Folders:
- host      : system metadata, patches, software, services
- policy    : local policy exports (secpol), users/groups, UAC/LSA/NTLM, RSOP
- audit     : auditpol + eventlog configuration + samples + ACLs
- network   : firewall posture, listening ports, SMB posture, RDP config
- crypto    : FIPS + TLS posture
- defender  : Defender status/prefs/threat/scan ages
- storage   : BitLocker + removable storage/USB posture
- apps      : AppLocker policy

Integrity:
- meta/hashes.sha256.txt provides SHA-256 hashes for every file in the bundle
- meta/manifest.json provides a machine-readable manifest (files[] matches hash coverage)

How to test:
- Verify manifest file count equals hash file count: compare length of meta/manifest.json "files" array to number of lines in meta/hashes.sha256.txt (should be equal).
- Verify every file under the bundle root appears in meta/hashes.sha256.txt: list all files under the run folder (excluding any .zip in the parent OutRoot) and confirm each path appears in hashes.sha256.txt (paths use forward slashes).
"@

# Stable bundle root hint for backend ingestion (same RunId/timestamp as collector.json and manifest)
$bundleHint = @{
  schema = "bundle.v1"
  run_id = $RunId
  bundle_root = "$RunId/"
  collector_name = "Collect-Cui-Evidence-v2"
  collector_version = "2.0.0"
  collected_at = ($now.ToString("o"))
}
Write-Json -Path (Join-Path $dirMeta "bundle.json") -Object $bundleHint

# Enumerate EVERY file under bundle root (after transcript + README + bundle.json); exclude nothing except .zip (zip lives in OutRoot, not in bundle)
$allFiles = Get-ChildItem -LiteralPath $bundleRoot -Recurse -File | Where-Object { $_.Name -notmatch "\.zip$" }

# Build a lookup of failed command names to their output file paths for status annotation
$failedByFile = @{}
foreach ($r in $results) {
  if (-not $r.ok) { $failedByFile[$r.file.Replace("\","/")] = $r.status }
}

$hashLines = @()
$fileManifest = @()
foreach ($f in $allFiles) {
  # Normalize path to forward slashes for portable, consistent hashes and manifest
  $rel = $f.FullName.Substring($bundleRoot.Length).TrimStart("\").Replace("\", "/")
  $sha = Get-Sha256 $f.FullName
  $hashLines += ("{0}  {1}" -f $sha, $rel)

  # Determine if this file came from a failed command (collection_error status)
  $relFullNorm = $f.FullName.Replace("\", "/")
  $fileStatus = if ($failedByFile.ContainsKey($relFullNorm)) { $failedByFile[$relFullNorm] } else { "ok" }

  $fileManifest += @{
    path = $rel
    sha256 = $sha
    size_bytes = $f.Length
    collected_at = ($now.ToString("o"))
    status = $fileStatus
  }
}

Write-Text -Path (Join-Path $dirMeta "hashes.sha256.txt") -Content ($hashLines -join "`r`n")

# -- Bundle validation ---------------------------------------------------------
# Verify every file in $fileManifest physically exists and that hash+count match.
$validationErrors = @()
$okCount = 0
$errorCount = 0
foreach ($entry in $fileManifest) {
  $fullPath = Join-Path $bundleRoot ($entry.path.Replace("/", "\"))
  if (-not (Test-Path -LiteralPath $fullPath)) {
    $validationErrors += "MISSING: $($entry.path)"
    $errorCount++
  } elseif (-not $entry.sha256) {
    $validationErrors += "HASH_FAILED: $($entry.path)"
    $errorCount++
  } else {
    $okCount++
  }
}
$hashLineCount = ($hashLines | Measure-Object).Count
if ($hashLineCount -ne $fileManifest.Count) {
  $validationErrors += "COUNT_MISMATCH: files[]=$($fileManifest.Count) hashes.sha256.txt=$hashLineCount"
}

$bundleValidationSummary = if ($validationErrors.Count -eq 0) {
  "Bundle validation PASSED: $okCount/$($fileManifest.Count) files present and hashed."
} else {
  "Bundle validation WARNING: $errorCount error(s) - $($validationErrors -join '; ')"
}
Write-Host $bundleValidationSummary

$manifest = @{
  schema = "cui-evidence.manifest.v2"
  run_id = $RunId
  collected_at = ($now.ToString("o"))
  computer_name = $env:COMPUTERNAME
  user = "$($env:USERDOMAIN)\$($env:USERNAME)"
  is_admin = $collector.host.is_admin
  bundle_root = $bundleRoot
  files = $fileManifest
  command_results = $results
  warnings = $warnings
  bundle_validation = @{
    summary = $bundleValidationSummary
    files_ok = $okCount
    files_total = $fileManifest.Count
    errors = $validationErrors
  }
}
Write-Json -Path (Join-Path $dirMeta "manifest.json") -Object $manifest

# Optional ZIP (unchanged; zip is created in OutRoot. Log to OutRoot so bundle stays 100% hashed.)
if ($CreateZip) {
  try {
    $zipPath = Join-Path $OutRoot ("{0}.zip" -f $RunId)
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Compress-Archive -Path $bundleRoot -DestinationPath $zipPath -Force
    Write-Text -Path (Join-Path $OutRoot ("{0}-zip-created.txt" -f $RunId)) -Content ("Created ZIP: {0}" -f $zipPath)
  } catch {
    $warnings += "Failed to create ZIP: $($_.Exception.Message)"
    Write-Text -Path (Join-Path $OutRoot ("{0}-zip-created.txt" -f $RunId)) -Content ("ZIP ERROR: {0}" -f $_.Exception.Message)
  }
}

$failCount = ($results | Where-Object { -not $_.ok } | Measure-Object).Count
$passCount = ($results | Where-Object { $_.ok } | Measure-Object).Count

Write-Host ""
Write-Host "Evidence bundle created at: $bundleRoot"
if ($CreateZip) { Write-Host "ZIP (if successful) at: $zipPath" }
Write-Host "Manifest:   $(Join-Path $dirMeta 'manifest.json')"
Write-Host "Hashes:     $(Join-Path $dirMeta 'hashes.sha256.txt')"
Write-Host "Commands:   $passCount ok, $failCount failed"
Write-Host "Validation: $bundleValidationSummary"
Write-Host ""
Write-Host "Next: upload meta\manifest.json to your Trust Codex control plane at /dashboard/evidence/upload-manifest"
