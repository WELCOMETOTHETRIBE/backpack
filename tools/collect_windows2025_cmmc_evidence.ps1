<#
collect_windows2025_cmmc_evidence.ps1

Purpose:
- Read-only (validation-only) evidence collection for CMMC L2 / NIST SP 800-171 controls
- Focused on "System-Enforced (Class A)" controls still "Planned / Partially Evidenced" in SCTM
- Produces assessor-friendly CLI artifacts + key policy exports

Safety:
- Never modifies policy, registry, or system configuration
- Best-effort: captures command failures into the evidence artifacts
- Avoids external dependencies; uses built-in Windows tools/cmdlets only
#>

[CmdletBinding()]
param(
  # Output directory on the target Windows Server (default: current working directory)
  [Parameter(Mandatory = $false)]
  [string]$OutDir = (Get-Location).Path,

  # Run identifier used to ensure unique filenames (default: timestamp)
  [Parameter(Mandatory = $false)]
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),

  # Skip zip creation (some locked-down hosts disable Compress-Archive)
  [Parameter(Mandatory = $false)]
  [switch]$NoZip
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Continue'

function Test-IsAdmin {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function New-Dir([string]$Path) {
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Sanitize-FileName([string]$Name) {
  # Keep letters, numbers, dash, underscore, dot
  $s = ($Name -replace '[^A-Za-z0-9\.\-_]+','-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($s)) { return 'artifact' }
  return $s
}

function Write-Header([string]$Path, [hashtable]$Meta) {
  $lines = @()
  $lines += "Collected: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
  foreach ($k in ($Meta.Keys | Sort-Object)) {
    $lines += ("{0}: {1}" -f $k, $Meta[$k])
  }
  $lines += ""
  $lines | Out-File -FilePath $Path -Encoding utf8
}

function Write-Section([string]$Path, [string]$Title, [scriptblock]$Cmd) {
  Add-Content -Path $Path -Encoding utf8 -Value ("=== {0} ===" -f $Title)
  try {
    $out = & $Cmd 2>&1 | Out-String
    if ([string]::IsNullOrWhiteSpace($out)) { $out = "(no output)" }
    Add-Content -Path $Path -Encoding utf8 -Value $out.TrimEnd()
  } catch {
    Add-Content -Path $Path -Encoding utf8 -Value ("ERROR: {0}" -f $_.Exception.Message)
  }
  Add-Content -Path $Path -Encoding utf8 -Value ""
}

function Try-Run([scriptblock]$Cmd, [string]$FallbackText) {
  try { & $Cmd } catch { $FallbackText }
}

function Cmd-Exists([string]$Name) {
  try { return [bool](Get-Command -Name $Name -ErrorAction Stop) } catch { return $false }
}

$isAdmin = Test-IsAdmin

$EvidenceRoot = Join-Path $OutDir 'evidence'
$RunRoot = Join-Path $EvidenceRoot $RunId
$ContextDir = Join-Path $RunRoot '_context'

New-Dir $ContextDir
foreach ($fam in @('AC','AU','CM','IA','MA','MP','RA','SC','SI')) {
  New-Dir (Join-Path $RunRoot $fam)
}

## ----------------------------
## Context / platform snapshots
## ----------------------------

$contextMeta = @{
  run_id = $RunId
  out_dir = $OutDir
  is_admin = $isAdmin
}

$contextSummary = Join-Path $ContextDir 'context-summary.txt'
Write-Header -Path $contextSummary -Meta $contextMeta

Write-Section $contextSummary 'OS (CIM)' {
  Try-Run { Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,InstallDate,LastBootUpTime | Format-List * } 'Get-CimInstance Win32_OperatingSystem unavailable'
}

Write-Section $contextSummary 'ComputerInfo (best-effort)' {
  Try-Run { Get-ComputerInfo | Select-Object CsName,WindowsProductName,WindowsVersion,OsBuildNumber,OsArchitecture,WindowsInstallationType,TimeZone,CsDomain,CsPartOfDomain,HyperVisorPresent | Format-List * } 'Get-ComputerInfo unavailable'
}

$osCaption = $null
try { $osCaption = (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption } catch { $osCaption = '' }
$isServer2025 = ($osCaption -match 'Windows Server 2025')
Write-Section $contextSummary 'Windows Server 2025 detection' { "Caption: $osCaption`nDetectedServer2025: $isServer2025" }

Write-Section $contextSummary 'Domain join / Entra join (best-effort)' {
  $out = @()
  try { $out += (Get-CimInstance Win32_ComputerSystem | Select-Object Name,Domain,PartOfDomain,DomainRole | Format-List * | Out-String) } catch { $out += "Win32_ComputerSystem unavailable" }
  if (Cmd-Exists 'dsregcmd.exe') {
    $out += "`n-- dsregcmd /status (if Entra/AAD join is in scope) --"
    $out += (& dsregcmd.exe /status 2>&1 | Out-String)
  } else {
    $out += "`ndsregcmd.exe not present"
  }
  $out -join "`n"
}

Write-Section $contextSummary 'Installed roles/features (best-effort)' {
  if (Cmd-Exists 'Get-WindowsFeature') {
    Get-WindowsFeature | Where-Object Installed | Select-Object Name,DisplayName,Installed | Sort-Object Name | Format-Table -AutoSize
  } else {
    & dism.exe /online /Get-Features /Format:Table 2>&1
  }
}

Write-Section $contextSummary 'Firewall profiles (CLI)' {
  if (Cmd-Exists 'Get-NetFirewallProfile') {
    Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction,NotifyOnListen,LogAllowed,LogBlocked | Format-Table -AutoSize
  } else {
    & netsh.exe advfirewall show allprofiles 2>&1
  }
}

Write-Section $contextSummary 'WinRM configuration (CLI)' {
  if (Cmd-Exists 'winrm.cmd') {
    & winrm.cmd get winrm/config/service 2>&1
    "`n"
    & winrm.cmd get winrm/config/listener 2>&1
  } else {
    "winrm.cmd not present"
  }
}

Write-Section $contextSummary 'RDP policy keys (CLI)' { & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' /s 2>&1 }

Write-Section $contextSummary 'TLS / SCHANNEL protocol posture (CLI)' {
  & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols' /s 2>&1
}

Write-Section $contextSummary 'Defender status (best-effort)' {
  if (Cmd-Exists 'Get-MpComputerStatus') {
    Get-MpComputerStatus | Format-List *
  } else {
    "Defender cmdlets unavailable (Get-MpComputerStatus not found)"
  }
}

Write-Section $contextSummary 'Windows Update policy keys (CLI)' {
  & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' /s 2>&1
  "`n"
  & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' /s 2>&1
}

Write-Section $contextSummary 'Audit policy (auditpol)' { & auditpol.exe /get /category:* 2>&1 }
Write-Section $contextSummary 'Event log channels (wevtutil gl Security/System/Application)' {
  & wevtutil.exe gl Security 2>&1
  "`n"
  & wevtutil.exe gl System 2>&1
  "`n"
  & wevtutil.exe gl Application 2>&1
}

## secedit export (Local Security Policy)
$SecpolCfg = Join-Path $ContextDir 'secpol.cfg'
$SecpolTxt = Join-Path $ContextDir 'secpol-export.txt'
try {
  & secedit.exe /export /cfg $SecpolCfg /quiet 2>&1 | Out-Null
  "secedit export OK -> $SecpolCfg" | Out-File -FilePath $SecpolTxt -Encoding utf8
} catch {
  ("ERROR exporting secedit policy: {0}" -f $_.Exception.Message) | Out-File -FilePath $SecpolTxt -Encoding utf8
}

## gpresult snapshots (if available)
$GpDir = Join-Path $ContextDir 'gpresult'
New-Dir $GpDir
try { & gpresult.exe /r /scope computer 2>&1 | Out-File -FilePath (Join-Path $GpDir 'gpresult-computer.txt') -Encoding utf8 } catch {}
try { & gpresult.exe /r /scope user 2>&1 | Out-File -FilePath (Join-Path $GpDir 'gpresult-user.txt') -Encoding utf8 } catch {}
try { & gpresult.exe /h (Join-Path $GpDir 'gpresult-computer.html') /scope computer 2>&1 | Out-Null } catch {}

## ----------------------------
## Control-focused evidence
## ----------------------------

function New-ControlArtifact([hashtable]$Control) {
  $id = $Control.id
  $family = $Control.family
  $slug = $Control.slug
  $path = Join-Path (Join-Path $RunRoot $family) ("{0}-{1}.txt" -f (Sanitize-FileName $id), (Sanitize-FileName $slug))

  $meta = @{
    control_id = $id
    family = $family
    title = $Control.title
    validation_method = $Control.method
    pass_criteria = ($Control.pass -join ' | ')
    gui_checklist = ($Control.gui -join ' ; ')
    related_context = "_context\\context-summary.txt ; _context\\secpol.cfg ; _context\\gpresult\\gpresult-computer.txt"
  }
  Write-Header -Path $path -Meta $meta

  foreach ($section in $Control.sections) {
    Write-Section -Path $path -Title $section.title -Cmd $section.cmd
  }
  return $path
}

## Helper scriptblocks reused across controls
$sbLocalUsers = { Try-Run { Get-LocalUser | Select-Object Name,Enabled,LastLogon,PasswordExpires,PasswordLastSet,UserMayChangePassword | Sort-Object Name | Format-Table -AutoSize } (& net.exe user 2>&1 | Out-String) }
$sbLocalAdmins = { Try-Run { Get-LocalGroupMember -Group 'Administrators' | Select-Object Name,ObjectClass,PrincipalSource | Format-Table -AutoSize } (& net.exe localgroup administrators 2>&1 | Out-String) }
$sbRemoteDesktopUsers = { Try-Run { Get-LocalGroupMember -Group 'Remote Desktop Users' | Select-Object Name,ObjectClass,PrincipalSource | Format-Table -AutoSize } (& net.exe localgroup "Remote Desktop Users" 2>&1 | Out-String) }
$sbNetAccounts = { & net.exe accounts 2>&1 }

$sbUac = {
  & reg.exe query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v EnableLUA 2>&1
  & reg.exe query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v ConsentPromptBehaviorAdmin 2>&1
  & reg.exe query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v PromptOnSecureDesktop 2>&1
}

$sbRdpNla = { & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' /v UserAuthentication 2>&1 }
$sbRdpSecurityLayer = { & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' /v SecurityLayer 2>&1 }

$sbRdpRedirection = {
  $k = 'HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'
  & reg.exe query $k /v fDisableClip 2>&1
  & reg.exe query $k /v fDisableCdm 2>&1
  & reg.exe query $k /v fDisableLPT 2>&1
  & reg.exe query $k /v fDisablePNPRedir 2>&1
  & reg.exe query $k /v fDisableCcm 2>&1
}

$sbInteractiveLogonNotice = {
  & reg.exe query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v legalnoticecaption 2>&1
  & reg.exe query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v legalnoticetext 2>&1
}

$sbInactivityTimeout = { & reg.exe query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v InactivityTimeoutSecs 2>&1 }
$sbScreenSaverPolicy = { & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop' /s 2>&1 }

$sbWinrm = {
  if (Cmd-Exists 'winrm.cmd') {
    & winrm.cmd get winrm/config/service 2>&1
    "`n"
    & winrm.cmd get winrm/config/listener 2>&1
  } else { "winrm.cmd not present" }
}

$sbFirewallAllProfiles = { & netsh.exe advfirewall show allprofiles 2>&1 }

$sbAuditpolAll = { & auditpol.exe /get /category:* 2>&1 }
$sbAuditpolLogon = { & auditpol.exe /get /subcategory:'Logon' 2>&1 }
$sbAuditpolAccountLogon = { & auditpol.exe /get /subcategory:'Kerberos Authentication Service' 2>&1 }

$sbSecurityLogSample = { & wevtutil.exe qe Security /c:10 /rd:true /f:text 2>&1 }
$sbSecurityLog4624 = { & wevtutil.exe qe Security "/q:*[System[(EventID=4624)]]" /c:5 /rd:true /f:text 2>&1 }
$sbSecurityLog4625 = { & wevtutil.exe qe Security "/q:*[System[(EventID=4625)]]" /c:5 /rd:true /f:text 2>&1 }
$sbEventLogSecurityChannel = { & wevtutil.exe gl Security 2>&1 }

$sbAuditLogAcls = {
  & icacls.exe "$env:WINDIR\System32\winevt\Logs" 2>&1
  "`n"
  & icacls.exe "$env:WINDIR\System32\winevt\Logs\Security.evtx" 2>&1
}

$sbUserRightsExtract = {
  if (Test-Path $SecpolCfg) {
    Select-String -Path $SecpolCfg -Pattern '^Se[A-Za-z0-9]+Right\s*=' -ErrorAction SilentlyContinue | ForEach-Object { $_.Line }
  } else {
    "secpol.cfg not present; secedit export likely failed"
  }
}

$sbApplocker = {
  if (Cmd-Exists 'Get-AppLockerPolicy') {
    try { Get-AppLockerPolicy -Effective -Xml } catch { "Get-AppLockerPolicy failed: $($_.Exception.Message)" }
  } else {
    "Get-AppLockerPolicy not available"
  }
}

$sbWdac = {
  $p = "$env:WINDIR\System32\CodeIntegrity\CiPolicies\Active"
  if (Test-Path $p) {
    Get-ChildItem -Path $p -File | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize
  } else {
    "WDAC active policy path not present: $p"
  }
}

$sbInstallerRestrictions = {
  & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer' /s 2>&1
  "`n"
  & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer' /v DisableMSI 2>&1
  "`n"
  & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer' /v AlwaysInstallElevated 2>&1
  "`n"
  & reg.exe query 'HKCU\SOFTWARE\Policies\Microsoft\Windows\Installer' /v AlwaysInstallElevated 2>&1
}

$sbNtlmPosture = {
  & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\Lsa' /v LmCompatibilityLevel 2>&1
  & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\Lsa' /v NoLmHash 2>&1
}

$sbBitLocker = {
  if (Cmd-Exists 'Get-BitLockerVolume') {
    Get-BitLockerVolume | Select-Object MountPoint,VolumeType,ProtectionStatus,EncryptionMethod,LockStatus,AutoUnlockEnabled | Format-Table -AutoSize
  } elseif (Cmd-Exists 'manage-bde.exe') {
    & manage-bde.exe -status 2>&1
  } else {
    "BitLocker commands unavailable (Get-BitLockerVolume/manage-bde)"
  }
}

$sbFvePolicy = { & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\FVE' /s 2>&1 }
$sbUsbStor = { & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR' 2>&1 }
$sbRemovableStoragePolicies = { & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices' /s 2>&1 }

$sbSmbConfig = {
  if (Cmd-Exists 'Get-SmbServerConfiguration') {
    Get-SmbServerConfiguration | Select-Object EnableSMB1Protocol,EnableSMB2Protocol,RequireSecuritySignature,EncryptData,RejectUnencryptedAccess | Format-List *
    "`n"
    Get-SmbClientConfiguration | Select-Object EnableSecuritySignature,RequireSecuritySignature | Format-List *
  } else {
    "SMB cmdlets unavailable"
  }
  "`n"
  & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' /v RequireSecuritySignature 2>&1
  & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters' /v RequireSecuritySignature 2>&1
}

$sbNetConfigServer = { & net.exe config server 2>&1 }

$sbRdpSessionTimeouts = {
  $k = 'HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'
  & reg.exe query $k /v MaxIdleTime 2>&1
  & reg.exe query $k /v MaxDisconnectionTime 2>&1
  & reg.exe query $k /v MaxConnectionTime 2>&1
}

$sbCertificates = {
  if (Cmd-Exists 'Get-ChildItem') {
    "LocalMachine\\My"
    Get-ChildItem -Path Cert:\LocalMachine\My -ErrorAction SilentlyContinue | Select-Object Subject,Issuer,NotAfter,Thumbprint | Format-Table -AutoSize
    "`nLocalMachine\\Root"
    Get-ChildItem -Path Cert:\LocalMachine\Root -ErrorAction SilentlyContinue | Select-Object Subject,NotAfter,Thumbprint | Format-Table -AutoSize
  } else {
    "Certificate PSDrive unavailable"
  }
}

$sbEventForwarding = {
  if (Cmd-Exists 'wecutil.exe') {
    & wecutil.exe es 2>&1
    "`n"
    try { & wecutil.exe gs 2>&1 } catch {}
  } else {
    "wecutil.exe not present"
  }
}

$sbDefenderPreferences = {
  if (Cmd-Exists 'Get-MpPreference') { Get-MpPreference | Format-List * } else { "Get-MpPreference not available" }
}

## Control definitions (ONLY the missing Class A + Planned/Partially Evidenced set)
$Controls = @(
  # --- AC ---
  @{ id='AC.L2-3.1.1'; family='AC'; title='Limit system access to authorized users, processes, devices'; method='CLI+GUI'; slug='authorized-access';
     pass=@('No unauthorized accounts in local privileged groups', 'Logon rights assignments exclude Everyone/Guests where applicable');
     gui=@('secpol.msc -> Local Policies -> User Rights Assignment', 'lusrmgr.msc -> Groups', 'Server Manager -> Local Users and Groups (if present)');
     sections=@(
       @{ title='Local users'; cmd=$sbLocalUsers },
       @{ title='Local Administrators group'; cmd=$sbLocalAdmins },
       @{ title='Remote Desktop Users group'; cmd=$sbRemoteDesktopUsers },
       @{ title='User rights assignments (from secedit export)'; cmd=$sbUserRightsExtract }
     )
  },
  @{ id='AC.L2-3.1.2'; family='AC'; title='Limit access to transactions/functions'; method='CLI-partial+GUI'; slug='transactions-functions';
     pass=@('System-level logon/privilege boundaries evidenced; application-specific RBAC requires GUI/app evidence');
     gui=@('secpol.msc -> User Rights Assignment', 'Application/admin console role mapping (screenshot)');
     sections=@(
       @{ title='User rights assignments (from secedit export)'; cmd=$sbUserRightsExtract },
       @{ title='UAC posture'; cmd=$sbUac },
       @{ title='Local privileged group membership'; cmd=$sbLocalAdmins }
     )
  },
  @{ id='AC.L2-3.1.3'; family='AC'; title='Control flow of CUI'; method='CLI+GUI'; slug='cui-flow-rdp-redirection';
     pass=@('RDP clipboard/drive/device redirection disabled via policy keys (expected fDisable* = 1)', 'Removable storage restricted/disabled');
     gui=@('gpedit.msc -> Computer Configuration -> Administrative Templates -> Windows Components -> Remote Desktop Services -> RDP Session Host -> Device and Resource Redirection', 'secpol.msc');
     sections=@(
       @{ title='RDP device/resource redirection policy keys'; cmd=$sbRdpRedirection },
       @{ title='Removable storage policies'; cmd=$sbRemovableStoragePolicies },
       @{ title='USBSTOR service (mass storage)'; cmd=$sbUsbStor }
     )
  },
  @{ id='AC.L2-3.1.5'; family='AC'; title='Least privilege'; method='CLI+GUI'; slug='least-privilege';
     pass=@('Local Administrators group contains only authorized admins', 'UAC enabled (EnableLUA=1)');
     gui=@('lusrmgr.msc -> Groups -> Administrators', 'secpol.msc -> Security Options (UAC policies)');
     sections=@(
       @{ title='Local Administrators group'; cmd=$sbLocalAdmins },
       @{ title='UAC posture'; cmd=$sbUac },
       @{ title='whoami /priv (current token privileges)'; cmd={ & whoami.exe /priv 2>&1 } }
     )
  },
  @{ id='AC.L2-3.1.6'; family='AC'; title='Non-privileged accounts'; method='CLI+GUI'; slug='non-privileged-accounts';
     pass=@('Standard users are not members of Administrators', 'Built-in Administrator disabled or tightly controlled (per baseline)');
     gui=@('lusrmgr.msc -> Users and Groups', 'secpol.msc -> Security Options -> Accounts: Administrator account status');
     sections=@(
       @{ title='Local users'; cmd=$sbLocalUsers },
       @{ title='Local Administrators group'; cmd=$sbLocalAdmins }
     )
  },
  @{ id='AC.L2-3.1.7'; family='AC'; title='Prevent privileged function execution'; method='CLI-partial+GUI'; slug='prevent-privileged-execution';
     pass=@('Privilege boundaries evidenced (UAC + rights assignments); requires functional test evidence for specific privileged actions');
     gui=@('UAC policy screenshots (secpol.msc)', 'Screenshot: attempt privileged action from non-admin account -> access denied prompt/log');
     sections=@(
       @{ title='UAC posture'; cmd=$sbUac },
       @{ title='User rights assignments (from secedit export)'; cmd=$sbUserRightsExtract },
       @{ title='Audit policy (for privilege use / logon)'; cmd=$sbAuditpolAll }
     )
  },
  @{ id='AC.L2-3.1.9'; family='AC'; title='Privacy/security notices'; method='CLI+GUI'; slug='interactive-logon-notice';
     pass=@('legalnoticecaption and legalnoticetext present and non-empty');
     gui=@('secpol.msc -> Local Policies -> Security Options -> Interactive logon: Message title/text');
     sections=@(
       @{ title='Interactive logon notice registry keys'; cmd=$sbInteractiveLogonNotice }
     )
  },
  @{ id='AC.L2-3.1.10'; family='AC'; title='Session lock'; method='CLI+GUI'; slug='session-lock';
     pass=@('InactivityTimeoutSecs is set (>0) and aligns with baseline', 'Screen saver policies enforce secure lock (ScreenSaverIsSecure=1) where applicable');
     gui=@('secpol.msc -> Security Options -> Interactive logon: Machine inactivity limit', 'gpedit.msc -> Control Panel -> Personalization (screen saver timeout/secure) (if used)');
     sections=@(
       @{ title='Machine inactivity limit (InactivityTimeoutSecs)'; cmd=$sbInactivityTimeout },
       @{ title='Screensaver-related policy keys'; cmd=$sbScreenSaverPolicy }
     )
  },
  @{ id='AC.L2-3.1.13'; family='AC'; title='Cryptographic remote access'; method='CLI+GUI'; slug='crypto-remote-access';
     pass=@('RDP uses NLA and secure layer (UserAuthentication=1; SecurityLayer is TLS/Negotiate per baseline)', 'WinRM disallows unencrypted (AllowUnencrypted=false) if enabled');
     gui=@('System Properties -> Remote (RDP settings)', 'Windows Defender Firewall with Advanced Security (inbound rules)', 'WinRM policy (if used)');
     sections=@(
       @{ title='RDP NLA'; cmd=$sbRdpNla },
       @{ title='RDP security layer'; cmd=$sbRdpSecurityLayer },
       @{ title='WinRM config'; cmd=$sbWinrm },
       @{ title='Firewall profiles'; cmd=$sbFirewallAllProfiles }
     )
  },
  @{ id='AC.L2-3.1.14'; family='AC'; title='Managed access control points'; method='CLI+GUI'; slug='managed-access-control-points';
     pass=@('Firewall profiles enabled; inbound rules are explicitly managed', 'No unexpected listening services/ports (assessor compares to baseline)');
     gui=@('wf.msc -> Windows Defender Firewall with Advanced Security', 'VPN/jump access configuration (screenshot)');
     sections=@(
       @{ title='Firewall profiles (netsh)'; cmd=$sbFirewallAllProfiles },
       @{ title='Listening ports (netstat)'; cmd={ & netstat.exe -ano 2>&1 } }
     )
  },
  @{ id='AC.L2-3.1.15'; family='AC'; title='Authorize remote privileged commands'; method='CLI-partial+GUI'; slug='remote-privileged-commands';
     pass=@('Remote management endpoints enumerated and access controlled (PSSession configs); authorization enforced via IAM (GUI evidence)');
     gui=@('PowerShell Remoting endpoints (as needed)', 'Privileged access management (Entra/PIM/MFA) screenshot');
     sections=@(
       @{ title='PowerShell session configurations'; cmd={ Try-Run { Get-PSSessionConfiguration | Select Name,Permission,RunAsUser | Format-Table -AutoSize } 'Get-PSSessionConfiguration unavailable' } },
       @{ title='WinRM config'; cmd=$sbWinrm },
       @{ title='Local Administrators group'; cmd=$sbLocalAdmins }
     )
  },
  @{ id='AC.L2-3.1.18'; family='AC'; title='Control mobile devices'; method='CLI-partial+GUI'; slug='mobile-devices';
     pass=@('Server-side removable storage is restricted; mobile device management evidence required for endpoints');
     gui=@('MDM/Intune device compliance + configuration profile screenshot', 'Conditional Access policy screenshot (if used)');
     sections=@(
       @{ title='Removable storage policies'; cmd=$sbRemovableStoragePolicies },
       @{ title='USBSTOR service'; cmd=$sbUsbStor }
     )
  },
  @{ id='AC.L2-3.1.19'; family='AC'; title='Encrypt CUI on mobile devices'; method='CLI-partial+GUI'; slug='mobile-device-encryption';
     pass=@('Server-side media controls evidenced; mobile device encryption must be evidenced in MDM');
     gui=@('MDM/Intune: device encryption compliance report screenshot/export');
     sections=@(
       @{ title='BitLocker status (server)'; cmd=$sbBitLocker },
       @{ title='BitLocker policy keys (FVE)'; cmd=$sbFvePolicy }
     )
  },
  @{ id='AC.L2-3.1.20'; family='AC'; title='Verify external systems'; method='CLI-partial+GUI'; slug='verify-external-systems';
     pass=@('Connection/authentication posture evidenced (NLA/TLS); external system verification requires boundary/IAM evidence');
     gui=@('Azure Bastion / jump access control screenshot', 'Conditional Access/MFA screenshot', 'Approved systems list (export/screenshot)');
     sections=@(
       @{ title='RDP NLA'; cmd=$sbRdpNla },
       @{ title='TLS/SCHANNEL protocols'; cmd={ & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols' /s 2>&1 } },
       @{ title='Firewall profiles'; cmd=$sbFirewallAllProfiles }
     )
  },
  @{ id='AC.L2-3.1.22'; family='AC'; title='Control CUI on public systems'; method='CLI-partial+GUI'; slug='public-systems';
     pass=@('Server restrictions evidenced; control of CUI on public systems typically requires governance + DLP/MDM evidence');
     gui=@('DLP policy screenshot/export (if applicable)', 'Policy/SOP reference for public system restrictions');
     sections=@(
       @{ title='RDP redirection controls (CUI exfil paths)'; cmd=$sbRdpRedirection },
       @{ title='Removable storage policies'; cmd=$sbRemovableStoragePolicies }
     )
  },

  # --- AU ---
  @{ id='AU.L2-3.3.2'; family='AU'; title='Unique user traceability'; method='CLI+GUI'; slug='unique-user-traceability';
     pass=@('Audit subcategory Logon enabled (Success/Failure per baseline)', 'Security log contains 4624/4625 with Account Name fields');
     gui=@('Local Security Policy -> Advanced Audit Policy Configuration', 'Event Viewer -> Windows Logs -> Security (screenshot)');
     sections=@(
       @{ title='auditpol: Logon'; cmd=$sbAuditpolLogon },
       @{ title='Security events: sample 4624 (logon success)'; cmd=$sbSecurityLog4624 },
       @{ title='Security events: sample 4625 (logon failure)'; cmd=$sbSecurityLog4625 }
     )
  },
  @{ id='AU.L2-3.3.4'; family='AU'; title='Alert on audit logging failure'; method='CLI-partial+GUI'; slug='alert-audit-failure';
     pass=@('Evidence of log capacity/retention collected; alerting requires SIEM/Sentinel/MDE rules evidence');
     gui=@('SIEM/Sentinel: alert rule for audit failure/log full (screenshot/export)', 'Event Viewer showing relevant event IDs (e.g., 1104/1108 if present)');
     sections=@(
       @{ title='Security log channel config (wevtutil gl Security)'; cmd=$sbEventLogSecurityChannel },
       @{ title='CrashOnAuditFail (if used)'; cmd={ & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\Lsa' /v CrashOnAuditFail 2>&1 } },
       @{ title='Event forwarding subscriptions (WEF)'; cmd=$sbEventForwarding }
     )
  },
  @{ id='AU.L2-3.3.5'; family='AU'; title='Correlate audit records'; method='CLI-partial+GUI'; slug='correlate-audit-records';
     pass=@('Forwarding/collection configuration evidenced; correlation occurs in SIEM (GUI evidence required)');
     gui=@('SIEM/Sentinel: correlated incident view (screenshot)', 'Data connector/agent health (screenshot)');
     sections=@(
       @{ title='Event forwarding subscriptions (WEF)'; cmd=$sbEventForwarding },
       @{ title='Security log sample'; cmd=$sbSecurityLogSample }
     )
  },
  @{ id='AU.L2-3.3.6'; family='AU'; title='Audit record reduction/reporting'; method='CLI-partial+GUI'; slug='audit-reduction-reporting';
     pass=@('Local eventing config evidenced; reduction/reporting performed by collector/SIEM (GUI evidence required)');
     gui=@('SIEM/Sentinel: report/dashboard export (screenshot/export)');
     sections=@(
       @{ title='Event forwarding subscriptions (WEF)'; cmd=$sbEventForwarding },
       @{ title='Security log channel config'; cmd=$sbEventLogSecurityChannel }
     )
  },
  @{ id='AU.L2-3.3.8'; family='AU'; title='Protect audit information'; method='CLI+GUI'; slug='protect-audit-info';
     pass=@('Audit log file ACLs restrict access to SYSTEM/Administrators (and approved readers)', 'SeSecurityPrivilege is restricted (from secedit export)');
     gui=@('Event Viewer log properties (Security.evtx permissions) screenshot', 'secpol.msc -> User Rights Assignment -> Manage auditing and security log');
     sections=@(
       @{ title='Audit log directory/file ACLs (icacls)'; cmd=$sbAuditLogAcls },
       @{ title='User rights assignments (from secedit export)'; cmd=$sbUserRightsExtract }
     )
  },
  @{ id='AU.L2-3.3.9'; family='AU'; title='Limit audit logging management'; method='CLI+GUI'; slug='limit-audit-mgmt';
     pass=@('Only approved roles/groups can manage audit policy/logs (SeSecurityPrivilege, Event Log Readers membership)');
     gui=@('secpol.msc -> User Rights Assignment', 'lusrmgr.msc -> Groups -> Event Log Readers');
     sections=@(
       @{ title='Event Log Readers group membership'; cmd={ Try-Run { Get-LocalGroupMember -Group 'Event Log Readers' | Format-Table -AutoSize } (& net.exe localgroup "Event Log Readers" 2>&1 | Out-String) } },
       @{ title='User rights assignments (from secedit export)'; cmd=$sbUserRightsExtract }
     )
  },

  # --- CM ---
  @{ id='CM.L2-3.4.5'; family='CM'; title='Change access restrictions'; method='CLI+GUI'; slug='change-access-restrictions';
     pass=@('Privileged groups/rights enumerated; only authorized admins have change-related rights');
     gui=@('secpol.msc -> User Rights Assignment', 'lusrmgr.msc -> Administrators');
     sections=@(
       @{ title='Local Administrators group'; cmd=$sbLocalAdmins },
       @{ title='User rights assignments (from secedit export)'; cmd=$sbUserRightsExtract }
     )
  },
  @{ id='CM.L2-3.4.6'; family='CM'; title='Least functionality'; method='CLI+GUI'; slug='least-functionality';
     pass=@('Installed roles/features match approved baseline', 'No unexpected services/ports for the enclave role');
     gui=@('Server Manager -> Roles and Features (screenshot)', 'Windows Services snap-in: verify nonessential disabled (screenshot)');
     sections=@(
       @{ title='Installed roles/features'; cmd={ if (Cmd-Exists 'Get-WindowsFeature') { Get-WindowsFeature | Where-Object Installed | Select Name,DisplayName | Format-Table -AutoSize } else { & dism.exe /online /Get-Features /Format:Table 2>&1 } } },
       @{ title='Listening ports (netstat)'; cmd={ & netstat.exe -ano 2>&1 } },
       @{ title='Selected services'; cmd={ Get-Service -ErrorAction SilentlyContinue | Select Name,Status,StartType | Sort Name | Format-Table -AutoSize } }
     )
  },
  @{ id='CM.L2-3.4.7'; family='CM'; title='Restrict nonessential programs'; method='CLI+GUI'; slug='restrict-nonessential-programs';
     pass=@('AppLocker/WDAC policy present/enforcing (where used)', 'Software inventory matches baseline');
     gui=@('Local Security Policy -> Application Control Policies (AppLocker) screenshots', 'WDAC policy deployment evidence (if used)');
     sections=@(
       @{ title='AppLocker effective policy (XML)'; cmd=$sbApplocker },
       @{ title='WDAC active policies (best-effort)'; cmd=$sbWdac },
       @{ title='Installed software inventory (uninstall keys)'; cmd={
          $paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
          $items = foreach ($p in $paths) { Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate }
          $items | Sort-Object DisplayName | Format-Table -AutoSize
       } }
     )
  },
  @{ id='CM.L2-3.4.8'; family='CM'; title='Software restriction policy'; method='CLI+GUI'; slug='software-restriction-policy';
     pass=@('SRP/AppLocker/WDAC policies evidenced (where used)');
     gui=@('gpedit.msc -> Windows Settings -> Security Settings -> Software Restriction Policies (if used)', 'AppLocker policy screenshots (if used)');
     sections=@(
       @{ title='SRP policy registry (Safer\\CodeIdentifiers)'; cmd={ & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Safer\CodeIdentifiers' /s 2>&1 } },
       @{ title='AppLocker effective policy (XML)'; cmd=$sbApplocker },
       @{ title='WDAC active policies (best-effort)'; cmd=$sbWdac }
     )
  },
  @{ id='CM.L2-3.4.9'; family='CM'; title='Control user-installed software'; method='CLI+GUI'; slug='control-user-installed-software';
     pass=@('DisableMSI is set per baseline (commonly 2)', 'AlwaysInstallElevated is not enabled in HKLM/HKCU');
     gui=@('gpedit.msc -> Windows Installer policies (DisableMSI)', 'AppLocker/WDAC policy screenshots');
     sections=@(
       @{ title='Windows Installer restriction policy'; cmd=$sbInstallerRestrictions },
       @{ title='AppLocker effective policy (XML)'; cmd=$sbApplocker }
     )
  },

  # --- IA ---
  @{ id='IA.L2-3.5.2'; family='IA'; title='Authenticate users'; method='CLI+GUI'; slug='authenticate-users';
     pass=@('Guest account disabled; authentication policy enforced; RDP uses NLA');
     gui=@('secpol.msc -> Security Options -> Accounts policies', 'System Properties -> Remote (NLA) screenshot');
     sections=@(
       @{ title='Local users'; cmd=$sbLocalUsers },
       @{ title='RDP NLA'; cmd=$sbRdpNla },
       @{ title='Account policy (net accounts)'; cmd=$sbNetAccounts }
     )
  },
  @{ id='IA.L2-3.5.3'; family='IA'; title='MFA for privileged accounts'; method='CLI-partial+GUI'; slug='mfa-privileged';
     pass=@('OS posture collected; MFA enforcement must be evidenced in IAM (Entra/CA/PIM or MFA provider)');
     gui=@('Entra Conditional Access policy requiring MFA for admin roles (screenshot/export)', 'PIM role activation settings (screenshot/export)', 'MFA provider logs/screenshot');
     sections=@(
       @{ title='Entra join status (dsregcmd, if present)'; cmd={ if (Cmd-Exists 'dsregcmd.exe') { & dsregcmd.exe /status 2>&1 } else { 'dsregcmd.exe not present' } } },
       @{ title='Local Administrators group (who is privileged locally)'; cmd=$sbLocalAdmins }
     )
  },
  @{ id='IA.L2-3.5.4'; family='IA'; title='Replay-resistant authentication'; method='CLI-partial+GUI'; slug='replay-resistant-auth';
     pass=@('NTLM posture hardened (LmCompatibilityLevel >= 5; NoLmHash=1)', 'Replay resistance for privileged access typically requires MFA/CA evidence');
     gui=@('Entra/IdP auth method policy (screenshot/export)', 'RDP NLA requirement screenshot');
     sections=@(
       @{ title='NTLM posture (LmCompatibilityLevel/NoLmHash)'; cmd=$sbNtlmPosture },
       @{ title='RDP NLA'; cmd=$sbRdpNla }
     )
  },
  @{ id='IA.L2-3.5.5'; family='IA'; title='Prevent identifier reuse'; method='CLI-partial+GUI'; slug='prevent-identifier-reuse';
     pass=@('Identifier lifecycle controls are typically IAM/process-based; OS-only CLI is insufficient');
     gui=@('IAM identity lifecycle policy + evidence (screenshot/export)', 'Helpdesk/IAM workflow screenshot showing no immediate reuse');
     sections=@(
       @{ title='Local user inventory (for context)'; cmd=$sbLocalUsers }
     )
  },
  @{ id='IA.L2-3.5.6'; family='IA'; title='Disable identifiers after inactivity'; method='CLI-partial+GUI'; slug='disable-inactive-identifiers';
     pass=@('Inactivity disablement is typically IAM-driven; OS-only CLI is insufficient');
     gui=@('IAM inactivity policy screenshot/export', 'Report of disabled stale accounts (export/screenshot)');
     sections=@(
       @{ title='Local users (for context)'; cmd=$sbLocalUsers }
     )
  },
  @{ id='IA.L2-3.5.8'; family='IA'; title='Prohibit password reuse'; method='CLI+GUI'; slug='password-history';
     pass=@('net accounts shows password history length >= baseline (non-zero, commonly >=24)');
     gui=@('secpol.msc -> Account Policies -> Password Policy (Password history length)');
     sections=@(
       @{ title='Account policy (net accounts)'; cmd=$sbNetAccounts }
     )
  },
  @{ id='IA.L2-3.5.9'; family='IA'; title='Temporary passwords'; method='CLI-partial+GUI'; slug='temporary-passwords';
     pass=@('Temporary password process is procedural; CLI provides supporting account policy context only');
     gui=@('Helpdesk/IAM workflow for issuing temporary passwords + forced change at next logon (screenshot)', 'Sample redacted ticket record (screenshot/export)');
     sections=@(
       @{ title='Account policy (net accounts)'; cmd=$sbNetAccounts },
       @{ title='Local users (PasswordLastSet/Expires context)'; cmd=$sbLocalUsers }
     )
  },
  @{ id='IA.L2-3.5.10'; family='IA'; title='Cryptographically-protected passwords'; method='CLI+GUI'; slug='crypto-protected-passwords';
     pass=@('NoLmHash=1 (LM hashes not stored)', 'NTLM posture hardened (LmCompatibilityLevel per baseline)');
     gui=@('secpol.msc -> Security Options -> Network security settings');
     sections=@(
       @{ title='NTLM posture (LmCompatibilityLevel/NoLmHash)'; cmd=$sbNtlmPosture }
     )
  },
  @{ id='IA.L2-3.5.11'; family='IA'; title='Obscure authentication feedback'; method='CLI+GUI'; slug='obscure-auth-feedback';
     pass=@('DontDisplayLastUserName=1 (commonly) and related interactive logon policies set per baseline');
     gui=@('secpol.msc -> Security Options -> Interactive logon: Do not display last user name');
     sections=@(
       @{ title='DontDisplayLastUserName'; cmd={ & reg.exe query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v DontDisplayLastUserName 2>&1 } }
     )
  },

  # --- MA ---
  @{ id='MA.L2-3.7.1'; family='MA'; title='Perform maintenance'; method='CLI-partial+GUI'; slug='perform-maintenance';
     pass=@('OS context collected; maintenance execution evidence is procedural (tickets/change records) + logs');
     gui=@('Ticketing/change record export (redacted)', 'Screenshot: maintenance window/approval record');
     sections=@(
       @{ title='Installed updates (hotfixes)'; cmd={ Try-Run { Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object HotFixID,InstalledOn,Description | Format-Table -AutoSize } 'Get-HotFix unavailable' } },
       @{ title='System event log sample (recent)'; cmd={ & wevtutil.exe qe System /c:25 /rd:true /f:text 2>&1 } }
     )
  },
  @{ id='MA.L2-3.7.2'; family='MA'; title='Controls on maintenance tools'; method='CLI-partial+GUI'; slug='maintenance-tools-controls';
     pass=@('Remote/admin tooling inventory collected; authorization controls require tool-specific GUI evidence');
     gui=@('Remote support tool admin console: authorized technicians + MFA screenshot', 'RMM agent policy/export screenshot');
     sections=@(
       @{ title='Installed software inventory (uninstall keys)'; cmd={
          $paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
          $items = foreach ($p in $paths) { Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate }
          $items | Sort-Object DisplayName | Format-Table -AutoSize
       } },
       @{ title='Remote-access related services (WinRM/RDP/SSH)'; cmd={ Get-Service WinRM,TermService,sshd -ErrorAction SilentlyContinue | Select Name,Status,StartType | Format-Table -AutoSize } }
     )
  },
  @{ id='MA.L2-3.7.5'; family='MA'; title='MFA for nonlocal maintenance'; method='CLI-partial+GUI'; slug='mfa-nonlocal-maintenance';
     pass=@('OS remote access posture collected; MFA enforcement must be evidenced in IAM/remote access tooling');
     gui=@('Bastion/MFA enforcement screenshot', 'Conditional Access/MFA policy screenshot');
     sections=@(
       @{ title='RDP NLA'; cmd=$sbRdpNla },
       @{ title='WinRM config'; cmd=$sbWinrm }
     )
  },

  # --- MP ---
  @{ id='MP.L2-3.8.1'; family='MP'; title='Protect system media'; method='CLI-partial+GUI'; slug='protect-system-media';
     pass=@('Disk encryption posture collected; physical media protections require procedural evidence');
     gui=@('Media storage/handling SOP reference', 'If applicable: screenshot of storage location controls / provider attestation');
     sections=@(
       @{ title='BitLocker status'; cmd=$sbBitLocker }
     )
  },
  @{ id='MP.L2-3.8.2'; family='MP'; title='Limit access to CUI on media'; method='CLI-partial+GUI'; slug='limit-access-media';
     pass=@('Removable storage restrictions evidenced; access control to stored media is procedural');
     gui=@('Removable storage policy screenshots', 'Backup storage access controls screenshot/export');
     sections=@(
       @{ title='Removable storage policies'; cmd=$sbRemovableStoragePolicies },
       @{ title='BitLocker status'; cmd=$sbBitLocker }
     )
  },
  @{ id='MP.L2-3.8.3'; family='MP'; title='Sanitize/destroy media'; method='CLI-partial+GUI'; slug='sanitize-destroy-media';
     pass=@('Sanitization/destruction is procedural; CLI cannot prove destruction');
     gui=@('Sanitization/destruction record template + sample record (redacted)', 'Vendor certificate of destruction (if used)');
     sections=@(
       @{ title='Storage inventory context (logical volumes)'; cmd={ Try-Run { Get-Volume | Select DriveLetter,FileSystemLabel,FileSystem,SizeRemaining,Size | Format-Table -AutoSize } 'Get-Volume unavailable' } }
     )
  },
  @{ id='MP.L2-3.8.4'; family='MP'; title='Mark media with CUI markings'; method='CLI-partial+GUI'; slug='mark-media';
     pass=@('Marking is procedural; CLI cannot evidence physical labels');
     gui=@('Photo/screenshot evidence of media labeling standard + sample media label (if in scope)');
     sections=@(
       @{ title='N/A (procedural) - include SOP and photos in evidence zip'; cmd={ 'This control requires procedural evidence (SOP + photos). CLI artifact is a placeholder.' } }
     )
  },
  @{ id='MP.L2-3.8.5'; family='MP'; title='Control access during transport'; method='CLI-partial+GUI'; slug='transport-controls';
     pass=@('Transport controls are procedural; CLI cannot prove chain-of-custody');
     gui=@('Chain-of-custody form + sample (redacted)', 'Secure courier/provider process evidence (if applicable)');
     sections=@(
       @{ title='N/A (procedural) - include transport records in evidence zip'; cmd={ 'This control requires procedural evidence (transport/chain-of-custody). CLI artifact is a placeholder.' } }
     )
  },
  @{ id='MP.L2-3.8.6'; family='MP'; title='Cryptographic protection on digital media'; method='CLI+GUI'; slug='crypto-digital-media';
     pass=@('BitLocker protection ON for data volumes (ProtectionStatus: On)', 'FVE policy keys present per baseline');
     gui=@('Control Panel -> BitLocker Drive Encryption (screenshot)', 'gpedit.msc -> BitLocker policies (screenshot)');
     sections=@(
       @{ title='BitLocker status'; cmd=$sbBitLocker },
       @{ title='BitLocker (FVE) policy keys'; cmd=$sbFvePolicy }
     )
  },
  @{ id='MP.L2-3.8.8'; family='MP'; title='Prohibit portable storage without owner'; method='CLI+GUI'; slug='prohibit-portable-storage';
     pass=@('USB mass storage disabled (USBSTOR Start=4) and/or RemovableStorageDevices policies deny access');
     gui=@('gpedit.msc -> Removable Storage Access (screenshots)', 'Device Manager -> USB Mass Storage disabled (if used) screenshot');
     sections=@(
       @{ title='USBSTOR service'; cmd=$sbUsbStor },
       @{ title='Removable storage policies'; cmd=$sbRemovableStoragePolicies }
     )
  },
  @{ id='MP.L2-3.8.9'; family='MP'; title='Protect backup CUI'; method='CLI-partial+GUI'; slug='protect-backup-cui';
     pass=@('Backup tooling status collected; protection of backup media requires tool/provider evidence');
     gui=@('Backup solution console: encryption + access control screenshot/export', 'Storage account/backup vault access controls screenshot (if applicable)');
     sections=@(
       @{ title='Windows Server Backup status (wbadmin)'; cmd={ if (Cmd-Exists 'wbadmin.exe') { & wbadmin.exe get status 2>&1; "`n"; & wbadmin.exe get versions 2>&1 } else { 'wbadmin.exe not present' } } },
       @{ title='BitLocker status (backup volumes)'; cmd=$sbBitLocker }
     )
  },

  # --- RA ---
  @{ id='RA.L2-3.11.2'; family='RA'; title='Scan for vulnerabilities'; method='CLI-partial+GUI'; slug='vulnerability-scan';
     pass=@('Host security context collected; vulnerability scanning requires scanner report evidence');
     gui=@('Vulnerability scanner report export (dated) showing this asset + findings', 'Scanner agent health screenshot');
     sections=@(
       @{ title='Installed updates (hotfixes)'; cmd={ Try-Run { Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object HotFixID,InstalledOn,Description | Format-Table -AutoSize } 'Get-HotFix unavailable' } },
       @{ title='Defender status'; cmd={ if (Cmd-Exists 'Get-MpComputerStatus') { Get-MpComputerStatus | Select AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,NISEnabled,RealTimeProtectionEnabled,FullScanAge,QuickScanAge,SignatureAge | Format-List * } else { 'Defender cmdlets unavailable' } } },
       @{ title='Installed software inventory (uninstall keys)'; cmd={
          $paths = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
          $items = foreach ($p in $paths) { Get-ItemProperty -Path $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate }
          $items | Sort-Object DisplayName | Format-Table -AutoSize
       } }
     )
  },
  @{ id='RA.L2-3.11.3'; family='RA'; title='Remediate vulnerabilities'; method='CLI-partial+GUI'; slug='vulnerability-remediation';
     pass=@('Patch/update posture collected; remediation evidence requires change/ticket + scanner re-scan evidence');
     gui=@('Ticket/change record for remediation (redacted)', 'Scanner re-scan report showing closure (export/screenshot)');
     sections=@(
       @{ title='Installed updates (hotfixes)'; cmd={ Try-Run { Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object HotFixID,InstalledOn,Description | Format-Table -AutoSize } 'Get-HotFix unavailable' } },
       @{ title='Windows Update policy keys'; cmd={ & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' /s 2>&1 } }
     )
  },

  # --- SC ---
  @{ id='SC.L2-3.13.2'; family='SC'; title='Architectural designs'; method='CLI-partial+GUI'; slug='architecture-designs';
     pass=@('OS network/firewall posture collected; architectural design evidence requires diagrams/docs');
     gui=@('Approved enclave network diagram (screenshot/pdf)', 'Boundary data flow diagram (screenshot/pdf)');
     sections=@(
       @{ title='IP configuration'; cmd={ & ipconfig.exe /all 2>&1 } },
       @{ title='Routes'; cmd={ & route.exe print 2>&1 } },
       @{ title='Firewall profiles'; cmd=$sbFirewallAllProfiles }
     )
  },
  @{ id='SC.L2-3.13.3'; family='SC'; title='Separate user/system management'; method='CLI-partial+GUI'; slug='separate-management';
     pass=@('Administrative separation evidenced via privileged group membership + UAC; organizational separation requires IAM evidence');
     gui=@('IAM admin role assignments (screenshot/export)', 'Local Administrators membership screenshot');
     sections=@(
       @{ title='Local Administrators group'; cmd=$sbLocalAdmins },
       @{ title='UAC posture'; cmd=$sbUac }
     )
  },
  @{ id='SC.L2-3.13.4'; family='SC'; title='Prevent unauthorized information transfer'; method='CLI+GUI'; slug='prevent-unauthorized-transfer';
     pass=@('RDP redirection disabled (fDisableClip/fDisableCdm = 1)', 'Removable storage restricted/disabled');
     gui=@('gpedit.msc -> RDP redirection policies (screenshots)', 'gpedit.msc -> Removable Storage Access (screenshots)');
     sections=@(
       @{ title='RDP redirection policies'; cmd=$sbRdpRedirection },
       @{ title='Removable storage policies'; cmd=$sbRemovableStoragePolicies }
     )
  },
  @{ id='SC.L2-3.13.5'; family='SC'; title='Implement subnetworks'; method='CLI-partial+GUI'; slug='subnetworks';
     pass=@('Host network configuration collected; subnetwork implementation requires network evidence');
     gui=@('VNet/Subnet configuration screenshot/export', 'Network segmentation diagram (screenshot/pdf)');
     sections=@(
       @{ title='IP configuration'; cmd={ & ipconfig.exe /all 2>&1 } },
       @{ title='Routes'; cmd={ & route.exe print 2>&1 } }
     )
  },
  @{ id='SC.L2-3.13.9'; family='SC'; title='Terminate network connections'; method='CLI+GUI'; slug='terminate-connections';
     pass=@('RDP idle/disconnect timeouts configured per baseline (MaxIdleTime/MaxDisconnectionTime)', 'SMB autodisconnect configured per baseline (net config server)');
     gui=@('gpedit.msc -> RDP Session Host -> Session Time Limits (screenshots)');
     sections=@(
       @{ title='RDP session time limits policy keys'; cmd=$sbRdpSessionTimeouts },
       @{ title='SMB server autodisconnect (net config server)'; cmd=$sbNetConfigServer }
     )
  },
  @{ id='SC.L2-3.13.10'; family='SC'; title='Cryptographic key management'; method='CLI-partial+GUI'; slug='key-management';
     pass=@('Certificate/key material inventory collected; key management procedures require governance/tool evidence');
     gui=@('KMS/HSM/key vault configuration screenshot/export (if used)', 'Certificate lifecycle policy evidence (screenshot/pdf)');
     sections=@(
       @{ title='Local machine certificate stores (My/Root)'; cmd=$sbCertificates },
       @{ title='BitLocker key protectors (if manage-bde is present)'; cmd={ if (Cmd-Exists 'manage-bde.exe') { & manage-bde.exe -protectors -get C: 2>&1 } else { 'manage-bde not present (or no C: volume)' } } }
     )
  },
  @{ id='SC.L2-3.13.12'; family='SC'; title='Collaborative computing devices'; method='CLI+GUI'; slug='collaborative-computing';
     pass=@('Remote Assistance is disabled (fAllowToGetHelp=0) and collaborative redirection is restricted per baseline');
     gui=@('System Properties -> Remote -> Remote Assistance (screenshot)', 'gpedit.msc -> Remote Assistance policies (screenshots)');
     sections=@(
       @{ title='Remote Assistance policy keys'; cmd={
          & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' /v fAllowToGetHelp 2>&1
          & reg.exe query 'HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' /v fAllowUnsolicited 2>&1
       } },
       @{ title='RDP redirection (collaboration vectors)'; cmd=$sbRdpRedirection }
     )
  },
  @{ id='SC.L2-3.13.13'; family='SC'; title='Control mobile code'; method='CLI+GUI'; slug='mobile-code';
     pass=@('Application control policy present/enforcing (AppLocker/WDAC) where used');
     gui=@('AppLocker policy screenshots', 'WDAC deployment evidence (if used)');
     sections=@(
       @{ title='AppLocker effective policy (XML)'; cmd=$sbApplocker },
       @{ title='WDAC active policies (best-effort)'; cmd=$sbWdac }
     )
  },
  @{ id='SC.L2-3.13.15'; family='SC'; title='Protect authenticity of communications'; method='CLI+GUI'; slug='authenticity-of-communications';
     pass=@('SMB signing required (RequireSecuritySignature=1) per baseline', 'TLS protocols hardened per baseline');
     gui=@('Group Policy: Microsoft network client/server: digitally sign communications (screenshots)', 'TLS policy documentation screenshot/export');
     sections=@(
       @{ title='SMB signing and SMB configuration'; cmd=$sbSmbConfig },
       @{ title='TLS/SCHANNEL protocols'; cmd={ & reg.exe query 'HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols' /s 2>&1 } }
     )
  },
  @{ id='SC.L2-3.13.16'; family='SC'; title='Protect CUI at rest'; method='CLI+GUI'; slug='cui-at-rest';
     pass=@('BitLocker protection ON for data volumes storing CUI', 'Encryption method meets baseline (e.g., XTS-AES 256) if specified');
     gui=@('BitLocker Drive Encryption screenshots (per volume)');
     sections=@(
       @{ title='BitLocker status'; cmd=$sbBitLocker },
       @{ title='BitLocker policy keys (FVE)'; cmd=$sbFvePolicy }
     )
  },

  # --- SI ---
  @{ id='SI.L2-3.14.3'; family='SI'; title='Monitor security alerts'; method='CLI-partial+GUI'; slug='monitor-alerts';
     pass=@('Local security telemetry sources evidenced; alert monitoring requires SOC/MDE/SIEM evidence');
     gui=@('MDE/Sentinel alert queue screenshot (dated)', 'Alert rule configuration screenshot/export');
     sections=@(
       @{ title='Defender status (local)'; cmd={ if (Cmd-Exists 'Get-MpComputerStatus') { Get-MpComputerStatus | Select AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,IoavProtectionEnabled,NISEnabled | Format-List * } else { 'Defender cmdlets unavailable' } } },
       @{ title='Event forwarding subscriptions (WEF)'; cmd=$sbEventForwarding }
     )
  },
  @{ id='SI.L2-3.14.5'; family='SI'; title='Periodic/real-time scans'; method='CLI+GUI'; slug='av-scans';
     pass=@('Real-time monitoring not disabled (DisableRealtimeMonitoring=False)', 'Scheduled scan settings present per baseline');
     gui=@('Windows Security -> Virus & threat protection settings (screenshot)', 'MDE policy screenshot (if centrally managed)');
     sections=@(
       @{ title='Defender preferences (scan + realtime settings)'; cmd=$sbDefenderPreferences }
     )
  },
  @{ id='SI.L2-3.14.7'; family='SI'; title='Identify unauthorized use'; method='CLI+GUI'; slug='unauthorized-use';
     pass=@('Audit Logon enabled; Security log shows 4625 failures and relevant account details');
     gui=@('Event Viewer -> Security log filtered for 4625 (screenshot)', 'Audit policy screenshots (Advanced Audit Policy Configuration)');
     sections=@(
       @{ title='auditpol: Logon'; cmd=$sbAuditpolLogon },
       @{ title='Security events: sample 4625 (failed logons)'; cmd=$sbSecurityLog4625 }
     )
  }
)

## Execute controls
$indexPath = Join-Path $RunRoot 'evidence-index.txt'
"RunId: $RunId" | Out-File -FilePath $indexPath -Encoding utf8
"IsAdmin: $isAdmin" | Add-Content -Path $indexPath -Encoding utf8
"DetectedServer2025: $isServer2025" | Add-Content -Path $indexPath -Encoding utf8
"" | Add-Content -Path $indexPath -Encoding utf8

foreach ($c in $Controls) {
  $artifact = New-ControlArtifact -Control $c
  ("{0}`t{1}`t{2}" -f $c.family, $c.id, (Split-Path -Leaf $artifact)) | Add-Content -Path $indexPath -Encoding utf8
}

## Manifest + hashes
$manifest = Join-Path $RunRoot 'manifest.txt'
$hashes = Join-Path $RunRoot 'hashes.sha256.txt'
Get-ChildItem -Path $RunRoot -Recurse -File |
  Select-Object FullName,Length,LastWriteTime |
  Sort-Object FullName |
  Format-Table -AutoSize |
  Out-File -FilePath $manifest -Encoding utf8

Get-ChildItem -Path $RunRoot -Recurse -File | ForEach-Object {
  try {
    $h = Get-FileHash -Algorithm SHA256 -Path $_.FullName
    "{0}  {1}" -f $h.Hash, ($_.FullName.Substring($RunRoot.Length).TrimStart('\')) | Add-Content -Path $hashes -Encoding utf8
  } catch {
    "ERROR hashing {0}: {1}" -f $_.FullName, $_.Exception.Message | Add-Content -Path $hashes -Encoding utf8
  }
}

## Zip
if (-not $NoZip) {
  $zipPath = Join-Path $EvidenceRoot ("evidence-$RunId.zip")
  try {
    if (Cmd-Exists 'Compress-Archive') {
      Compress-Archive -Path (Join-Path $RunRoot '*') -DestinationPath $zipPath -Force
      "ZIP created: $zipPath" | Add-Content -Path $contextSummary -Encoding utf8
    } else {
      "Compress-Archive not available; skipping zip" | Add-Content -Path $contextSummary -Encoding utf8
    }
  } catch {
    ("ZIP creation failed: {0}" -f $_.Exception.Message) | Add-Content -Path $contextSummary -Encoding utf8
  }
}

"Evidence root: $RunRoot"

