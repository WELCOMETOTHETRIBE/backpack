<# 
Collect-Cui-Evidence.ps1
Generates an assessor-friendly, timestamped evidence bundle for the Windows Server 2025 pilot VM.

Design intent:
- Read-only collection (does not change configuration)
- Server-safe; minimal dependencies; best-effort with clear errors
- Produces a bundle + a zip + a hashes manifest (SHA-256)
#>

param(
  [string]$OutRoot = "C:\evidence",

  # Optional: provide a shared run id so evidence and validation runs match.
  # Format: yyyyMMdd-HHmmss (recommended)
  [string]$RunId = ""
)

New-Item -ItemType Directory -Path $OutRoot -Force | Out-Null
$ts = if ($RunId) { $RunId } else { Get-Date -Format yyyyMMdd-HHmmss }
$bundle = Join-Path $OutRoot "CUI-Evidence-$ts"
New-Item -ItemType Directory -Path $bundle | Out-Null

function Write-TextFile {
  param([string]$Name, [scriptblock]$Cmd)
  $path = Join-Path $bundle "$Name.txt"
  try {
    & $Cmd 2>&1 | Out-File -FilePath $path -Encoding utf8
  } catch {
    "ERROR: $($_.Exception.Message)" | Out-File -FilePath $path -Encoding utf8
  }
}

### Baseline system + platform
Write-TextFile "systeminfo" { systeminfo }
Write-TextFile "hotfixes" { Get-HotFix | Sort-Object InstalledOn -Descending | Format-Table -AutoSize }
Write-TextFile "time-sync" { w32tm /query /status; ""; w32tm /query /configuration }
Write-TextFile "computerinfo" {
  try { Get-ComputerInfo | Select-Object CsName,WindowsProductName,WindowsVersion,OsBuildNumber,TimeZone,OsHardwareAbstractionLayer,HyperVisorPresent,WindowsInstallationType | Format-List * }
  catch { "Get-ComputerInfo unavailable" }
}
Write-TextFile "installed-roles-features" {
  try { Get-WindowsFeature | Where-Object Installed | Select-Object Name,DisplayName,Installed | Format-Table -AutoSize }
  catch { dism /online /Get-Features /Format:Table }
}
Write-TextFile "installed-software" {
  try {
    $paths = @(
      'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $items = foreach ($p in $paths) {
      Get-ItemProperty -Path $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName } |
        Select-Object DisplayName,DisplayVersion,Publisher,InstallDate
    }
    $items | Sort-Object DisplayName | Format-Table -AutoSize
  } catch {
    "Installed software inventory unavailable"
  }
}

### Effective policy snapshots (CM/AC/AU/IA supporting evidence)
Write-TextFile "gpresult-computer" {
  try { gpresult /r /scope computer }
  catch { "gpresult unavailable" }
}
Write-TextFile "gpresult-user" {
  try { gpresult /r /scope user }
  catch { "gpresult unavailable" }
}
Write-TextFile "whoami-all" {
  try { whoami /all }
  catch { "whoami unavailable" }
}

### Firewall / network posture
Write-TextFile "firewall" { netsh advfirewall show allprofiles }
Write-TextFile "firewall-rules-summary" {
  try { Get-NetFirewallRule | Group-Object Profile,Enabled,Direction,Action | Sort Count -Descending | Select Count,Name | Format-Table -AutoSize }
  catch { netsh advfirewall firewall show rule name=all }
}

### Cryptography / protocol posture
Write-TextFile "fips" { reg query HKLM\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy }
Write-TextFile "schannel-protocols" { reg query 'HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols' /s }
Write-TextFile "tls-ciphersuites" {
  try { Get-TlsCipherSuite | Select-Object Name,Exchange,Hash,Cipher,Certificate | Format-Table -AutoSize }
  catch { "Get-TlsCipherSuite unavailable" }
}

### Identity / local accounts
Write-TextFile "local-accounts" {
  try { Get-CimInstance Win32_UserAccount | Select Name,Disabled,Lockout | Format-Table -AutoSize }
  catch { net user }
}
Write-TextFile "local-admins" {
  try { Get-LocalGroupMember -Group 'Administrators' | Select Name,ObjectClass,PrincipalSource | Format-Table -AutoSize }
  catch { net localgroup administrators }
}
Write-TextFile "local-groups" {
  try { Get-LocalGroup | Select Name,Description | Sort Name | Format-Table -AutoSize }
  catch { net localgroup }
}
Write-TextFile "local-remote-desktop-users" {
  try { Get-LocalGroupMember -Group 'Remote Desktop Users' | Select Name,ObjectClass,PrincipalSource | Format-Table -AutoSize }
  catch { net localgroup \"Remote Desktop Users\" }
}
Write-TextFile "account-policy" { net accounts }

### Session lock / inactivity (AC 3.1.10 / 3.1.11 support)
Write-TextFile "machine-inactivity-limit" {
  reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v InactivityTimeoutSecs
}
Write-TextFile "screensaver-policy" {
  reg query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop' /s
}

### Authentication UX + NTLM posture (IA 3.5.* support)
Write-TextFile "auth-ux-policy" {
  reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v DontDisplayLastUserName
}
Write-TextFile "ntlm-policy" {
  reg query 'HKLM\SYSTEM\CurrentControlSet\Control\Lsa' /v LmCompatibilityLevel
  reg query 'HKLM\SYSTEM\CurrentControlSet\Control\Lsa' /v NoLmHash
}

### Interactive logon notice (AC 3.1.9 support)
Write-TextFile "interactive-logon-notice" {
  reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v legalnoticecaption
  reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v legalnoticetext
}

### LSA / credential protections
Write-TextFile "lsa" { reg query HKLM\System\CurrentControlSet\Control\Lsa }
Write-TextFile "uac-policy" {
  reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v ConsentPromptBehaviorAdmin
  reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v PromptOnSecureDesktop
  reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v DontDisplayLastUserName
}
Write-TextFile "name-resolution-policy" {
  reg query 'HKLM\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' /v EnableMulticast
}

### SMB posture (supports SC + CM)
Write-TextFile "smb-server-config" {
  try { Get-SmbServerConfiguration | Format-List * }
  catch { "Get-SmbServerConfiguration unavailable" }
}
Write-TextFile "smb-client-config" {
  try { Get-SmbClientConfiguration | Format-List * }
  catch { "Get-SmbClientConfiguration unavailable" }
}
Write-TextFile "smb1-feature" {
  try { Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol | Format-List * }
  catch { dism /online /Get-FeatureInfo /FeatureName:SMB1Protocol }
}
Write-TextFile "smb-signing" {
  reg query 'HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' /v RequireSecuritySignature
  reg query 'HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' /v EnableSecuritySignature
  reg query 'HKLM\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters' /v RequireSecuritySignature
  reg query 'HKLM\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters' /v EnableSecuritySignature
}
Write-TextFile "smb-shares" {
  try { Get-SmbShare | Select-Object Name,Path,Description,EncryptData,FolderEnumerationMode | Format-Table -AutoSize }
  catch { "Get-SmbShare unavailable" }
}

### RDP / session posture (policy keys)
Write-TextFile "rdp-policy" { reg query 'HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services' /s }
Write-TextFile "rdp-tcp" { reg query 'HKLM\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' }

### Windows eventing / audit policy (high signal for AU family)
Write-TextFile "auditpol" { auditpol /get /category:* }
Write-TextFile "auditpol-subcategories" { auditpol /get /subcategory:* }
Write-TextFile "eventlog-security" { wevtutil gl Security }
Write-TextFile "eventlog-system" { wevtutil gl System }
Write-TextFile "eventlog-application" { wevtutil gl Application }
Write-TextFile "eventlog-security-sample" {
  try { wevtutil qe Security /c:25 /rd:true /f:text }
  catch { "wevtutil qe Security failed" }
}
Write-TextFile "eventlog-system-sample" {
  try { wevtutil qe System /c:25 /rd:true /f:text }
  catch { "wevtutil qe System failed" }
}

### Defender / malware protection (best-effort)
Write-TextFile "defender-status" {
  try { Get-MpComputerStatus | Format-List * }
  catch { "Defender cmdlets unavailable" }
}
Write-TextFile "defender-preferences" {
  try { Get-MpPreference | Format-List * }
  catch { "Defender cmdlets unavailable" }
}

### Services relevant to remote administration posture
Write-TextFile "services-remote" {
  Get-Service WinRM,TermService,sshd -ErrorAction SilentlyContinue | Select Name,Status,StartType | Format-Table -AutoSize
}
Write-TextFile "services-security-relevant" {
  $names = @('EventLog','W32Time','MpsSvc','wuauserv','bits','cryptsvc','WdNisSvc','WinDefend','Sense','AppIDSvc')
  Get-Service -Name $names -ErrorAction SilentlyContinue | Select Name,Status,StartType | Format-Table -AutoSize
}

### Windows Update posture (SI 3.14.* supporting evidence)
Write-TextFile "windows-update-services" {
  Get-Service wuauserv,bits,cryptsvc -ErrorAction SilentlyContinue | Select Name,Status,StartType | Format-Table -AutoSize
}
Write-TextFile "windows-update-policy" {
  reg query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' /s
  reg query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' /s
}

### Removable media posture (pilot baseline: no USB mass storage)
Write-TextFile "usbstor" { reg query 'HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR' }
Write-TextFile "removable-storage-policies" {
  reg query 'HKLM\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices' /s
}

### Disk encryption posture (BitLocker)
Write-TextFile "bitlocker-status" {
  try { manage-bde -status }
  catch { "manage-bde unavailable" }
}

### Local security policy export (secedit)
try {
  $secpol = Join-Path $bundle "secpol.cfg"
  secedit /export /cfg $secpol /quiet | Out-Null
} catch {
  "ERROR exporting secedit policy: $($_.Exception.Message)" | Out-File (Join-Path $bundle "secpol.txt") -Encoding utf8
}

### User rights assignments (parsed from secpol.cfg) — assessor-friendly summary
try {
  $secpolPath = Join-Path $bundle "secpol.cfg"
  if (Test-Path $secpolPath) {
    $lines = Get-Content -Path $secpolPath -ErrorAction Stop
    $in = $false
    $out = @()
    foreach ($ln in $lines) {
      if ($ln -match '^\s*\[Privilege Rights\]\s*$') { $in = $true; continue }
      if ($in -and $ln -match '^\s*\\[') { break }
      if (-not $in) { continue }
      if ($ln -match '^\s*Se[A-Za-z0-9]+') { $out += $ln }
    }
    if ($out.Count -gt 0) {
      $out | Out-File -FilePath (Join-Path $bundle "user-rights-assignments.txt") -Encoding utf8
    } else {
      "No [Privilege Rights] section found in secpol.cfg" | Out-File -FilePath (Join-Path $bundle "user-rights-assignments.txt") -Encoding utf8
    }
  }
} catch {
  "ERROR parsing user rights: $($_.Exception.Message)" | Out-File -FilePath (Join-Path $bundle "user-rights-assignments.txt") -Encoding utf8
}

### AppLocker policy (if configured)
Write-TextFile "applocker-policy" {
  try { Get-AppLockerPolicy -Effective -Xml }
  catch { "AppLocker policy not available (Get-AppLockerPolicy failed)" }
}

### Include hardening log if present (evidence of idempotent actions)
$hardeningLog = "C:\Hardening\hardening.log"
if (Test-Path $hardeningLog) {
  Copy-Item -Path $hardeningLog -Destination (Join-Path $bundle "hardening.log") -Force
}

### Include latest Azure hardening/inheritance artifacts if present (best-effort copy)
try {
  $latestAzure = Get-ChildItem -LiteralPath $OutRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'CUI-Azure-*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($latestAzure) {
    $src = $latestAzure.FullName
    $files = @('azure-report.json','azure-report.md','azure-vm.json','azure-nics.json','azure-public-ips.json','azure-nsgs.json')
    foreach ($f in $files) {
      $p = Join-Path $src $f
      if (Test-Path -LiteralPath $p -PathType Leaf) {
        Copy-Item -LiteralPath $p -Destination (Join-Path $bundle $f) -Force
      }
    }
    "Copied Azure artifacts from $src" | Out-File -FilePath (Join-Path $bundle "azure-artifacts-source.txt") -Encoding utf8
  }
} catch {
  "Azure artifact copy skipped: $($_.Exception.Message)" | Out-File -FilePath (Join-Path $bundle "azure-artifacts-source.txt") -Encoding utf8
}

try {
  $latestInh = Get-ChildItem -LiteralPath $OutRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'CUI-Azure-Inheritance-*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($latestInh) {
    $src = $latestInh.FullName
    foreach ($f in @('azure-inheritance.json','azure-inheritance.md')) {
      $p = Join-Path $src $f
      if (Test-Path -LiteralPath $p -PathType Leaf) {
        Copy-Item -LiteralPath $p -Destination (Join-Path $bundle $f) -Force
      }
    }
    "Copied Azure inheritance artifacts from $src" | Out-File -FilePath (Join-Path $bundle "azure-inheritance-source.txt") -Encoding utf8
  }
} catch {
  "Azure inheritance artifact copy skipped: $($_.Exception.Message)" | Out-File -FilePath (Join-Path $bundle "azure-inheritance-source.txt") -Encoding utf8
}

### Enclave scope/design NA manifest (for 43-control evidence validation)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scopeNaPath = Join-Path $scriptDir "enclave-scope-na.json"
if (Test-Path -LiteralPath $scopeNaPath -PathType Leaf) {
  Copy-Item -LiteralPath $scopeNaPath -Destination (Join-Path $bundle "enclave-scope-na.json") -Force
}

### Manifest + hashes (integrity of bundle contents)
$files = Get-ChildItem -Path $bundle -File | Sort-Object Name
($files | Select Name,Length,LastWriteTime | Format-Table -AutoSize) | Out-File (Join-Path $bundle "manifest.txt") -Encoding utf8

$hashOut = Join-Path $bundle "hashes.sha256.txt"
foreach ($f in $files) {
  try {
    $h = Get-FileHash -Algorithm SHA256 -Path $f.FullName
    "{0}  {1}" -f $h.Hash, $f.Name | Add-Content -Path $hashOut -Encoding utf8
  } catch {
    "ERROR hashing {0}: {1}" -f $f.Name, $_.Exception.Message | Add-Content -Path $hashOut -Encoding utf8
  }
}

### Zip bundle
$zip = "$bundle.zip"
Compress-Archive -Path (Join-Path $bundle "*") -DestinationPath $zip -Force
"$zip created"

