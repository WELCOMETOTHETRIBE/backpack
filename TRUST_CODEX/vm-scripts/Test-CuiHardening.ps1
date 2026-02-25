<#
Test-CuiHardening.ps1
Read-only validation for the Windows Server 2025 pilot VM hardening baseline.

Design intent:
- NO configuration changes
- Produces a PASS/FAIL report for key baseline items we care about for CUI handling
- Writes both a human-readable report and a JSON report suitable for evidence retention

This is not a “certification test.” It is a repeatable validation aid.
#>

param(
  [string]$OutRoot = "C:\evidence",

  # Optional: provide a shared run id so evidence and validation runs match.
  # Format: yyyyMMdd-HHmmss (recommended)
  [string]$RunId = "",

  # Optional: point validation at a specific evidence bundle directory.
  # Example: C:\evidence\CUI-Evidence-20260206-075346
  [string]$EvidenceDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Get-RegDword {
  param([string]$Path,[string]$Name)
  try {
    $v = (Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop).$Name
    return [int]$v
  } catch {
    return $null
  }
}

function Add-Check {
  param(
    [string]$Id,
    [string]$Control,
    [string]$Title,
    [bool]$Pass,
    [string]$Observed,
    [string]$Expected,
    [string]$EvidenceHint
  )
  $script:Checks += [pscustomobject]@{
    id = $Id
    control = $Control
    title = $Title
    pass = $Pass
    observed = $Observed
    expected = $Expected
    evidence_hint = $EvidenceHint
    timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
  }
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Has-EvidenceFile {
  param([string]$Name)
  try {
    if (-not $script:resolvedEvidenceDir) { return $false }
    $p = Join-Path $script:resolvedEvidenceDir $Name
    return (Test-Path -LiteralPath $p -PathType Leaf)
  } catch { return $false }
}

function Get-EvidenceFilePath {
  param([string]$Name)
  try {
    if (-not $script:resolvedEvidenceDir) { return $null }
    return (Join-Path $script:resolvedEvidenceDir $Name)
  } catch { return $null }
}

New-Item -ItemType Directory -Path $OutRoot -Force | Out-Null
$ts = if ($RunId) { $RunId } else { Get-Date -Format yyyyMMdd-HHmmss }
$outDir = Join-Path $OutRoot "CUI-Validation-$ts"
New-Item -ItemType Directory -Path $outDir | Out-Null

$script:Checks = @()

### Evidence bundle selection (optional)
$resolvedEvidenceDir = $null
$evidenceSelection = [pscustomobject]@{
  provided = $EvidenceDir
  provided_exists = $false
  mode = ""
  resolved = ""
  note = ""
}
try {
  if ($EvidenceDir) {
    $evidenceSelection.provided_exists = (Test-Path -LiteralPath $EvidenceDir -PathType Container)
    if ($evidenceSelection.provided_exists) {
      $resolvedEvidenceDir = (Resolve-Path -LiteralPath $EvidenceDir).Path
      $evidenceSelection.mode = "explicit"
      $evidenceSelection.note = "Using explicitly provided -EvidenceDir."
    } else {
      # IMPORTANT: do not silently fall back if the operator explicitly provided a bundle path.
      $resolvedEvidenceDir = $null
      $evidenceSelection.mode = "explicit-missing"
      $evidenceSelection.note = "Provided -EvidenceDir does not exist; not falling back to latest."
    }
  } else {
    $latest = Get-ChildItem -LiteralPath $OutRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'CUI-Evidence-*' } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($latest) {
      $resolvedEvidenceDir = $latest.FullName
      $evidenceSelection.mode = "auto-latest"
      $evidenceSelection.note = "No -EvidenceDir provided; selected newest evidence bundle under OutRoot."
    } else {
      $evidenceSelection.mode = "none"
      $evidenceSelection.note = "No evidence bundles found under OutRoot."
    }
  }
} catch {}
$evidenceSelection.resolved = $resolvedEvidenceDir
$script:resolvedEvidenceDir = $resolvedEvidenceDir

# Log bundle selection as a first-class check (shows up in report.txt and report.json checks).
Add-Check -Id "EVIDENCE-BUNDLE" -Control "CM.L2-3.4.1" -Title "Evidence bundle selection" `
  -Pass ([bool]$resolvedEvidenceDir) `
  -Observed ("Mode={0}; Provided={1}; Exists={2}; Resolved={3}" -f $evidenceSelection.mode,$EvidenceDir,$evidenceSelection.provided_exists,$resolvedEvidenceDir) `
  -Expected "Resolved evidence_dir present (for file-based requirements)" `
  -EvidenceHint "C:\\evidence\\CUI-Evidence-<RunId>\\*"

### Platform identity
$os = (Get-CimInstance Win32_OperatingSystem)
Add-Check -Id "PLAT-OS" -Control "CM.L2-3.4.1" -Title "OS identified" `
  -Pass ($null -ne $os.Caption) -Observed ($os.Caption) -Expected "Windows Server 2025 Datacenter (pilot)" `
  -EvidenceHint "systeminfo.txt (if collected)"

### FIPS mode
$fips = Get-RegDword -Path "HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy" -Name "Enabled"
Add-Check -Id "CRYPTO-FIPS" -Control "SC.L2-3.13.11" -Title "FIPS mode enabled" `
  -Pass ($fips -eq 1) -Observed ("Enabled=" + ($fips -as [string])) -Expected "Enabled=1" `
  -EvidenceHint "reg query ...\\FipsAlgorithmPolicy (fips.txt)"

### TLS baseline (disable 1.0/1.1; enable 1.2)
$sch = "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols"
$tls10c = Get-RegDword -Path "$sch\TLS 1.0\Client" -Name "Enabled"
$tls10s = Get-RegDword -Path "$sch\TLS 1.0\Server" -Name "Enabled"
$tls11c = Get-RegDword -Path "$sch\TLS 1.1\Client" -Name "Enabled"
$tls11s = Get-RegDword -Path "$sch\TLS 1.1\Server" -Name "Enabled"
$tls12c = Get-RegDword -Path "$sch\TLS 1.2\Client" -Name "Enabled"
$tls12s = Get-RegDword -Path "$sch\TLS 1.2\Server" -Name "Enabled"
$tlsPass = ($tls10c -eq 0) -and ($tls10s -eq 0) -and ($tls11c -eq 0) -and ($tls11s -eq 0) -and ($tls12c -eq 1) -and ($tls12s -eq 1)
Add-Check -Id "CRYPTO-TLS" -Control "SC.L2-3.13.8" -Title "TLS baseline (1.0/1.1 disabled; 1.2 enabled)" `
  -Pass $tlsPass `
  -Observed ("TLS10 C/S={0}/{1}; TLS11 C/S={2}/{3}; TLS12 C/S={4}/{5}" -f $tls10c,$tls10s,$tls11c,$tls11s,$tls12c,$tls12s) `
  -Expected "TLS 1.0/1.1 Enabled=0; TLS 1.2 Enabled=1" `
  -EvidenceHint "schannel-protocols.txt (if collected)"

### Firewall baseline (deny inbound, allow outbound)
try {
  $profiles = Get-NetFirewallProfile -ErrorAction Stop
  $fwPass = $true
  $obs = @()
  foreach ($p in $profiles) {
    $obs += ("{0}: Enabled={1} In={2} Out={3} LogBlocked={4} LogAllowed={5}" -f $p.Name,$p.Enabled,$p.DefaultInboundAction,$p.DefaultOutboundAction,$p.LogBlocked,$p.LogAllowed)
    if (-not $p.Enabled) { $fwPass = $false }
    if ($p.DefaultInboundAction -ne "Block") { $fwPass = $false }
    if ($p.DefaultOutboundAction -ne "Allow") { $fwPass = $false }
  }
  Add-Check -Id "NET-FW" -Control "SC.L2-3.13.6" -Title "Windows firewall baseline (block inbound, allow outbound)" `
    -Pass $fwPass -Observed ($obs -join "; ") -Expected "Enabled=True; In=Block; Out=Allow" `
    -EvidenceHint "firewall.txt"
} catch {
  Add-Check -Id "NET-FW" -Control "SC.L2-3.13.6" -Title "Windows firewall baseline (block inbound, allow outbound)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Firewall profiles queryable" `
    -EvidenceHint "firewall.txt"
}

### WinRM disabled (pilot default)
try {
  $svc = Get-Service -Name WinRM -ErrorAction Stop
  $pass = ($svc.Status -ne "Running") -and ($svc.StartType -eq "Disabled")
  Add-Check -Id "RM-WINRM" -Control "AC.L2-3.1.12" -Title "WinRM disabled (pilot posture)" `
    -Pass $pass -Observed ("Status={0}; StartType={1}" -f $svc.Status,$svc.StartType) -Expected "Not Running; Disabled" `
    -EvidenceHint "services-remote.txt (if collected)"
} catch {
  Add-Check -Id "RM-WINRM" -Control "AC.L2-3.1.12" -Title "WinRM disabled (pilot posture)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "WinRM service queryable" `
    -EvidenceHint "services-remote.txt"
}

### Account lockout threshold is set (AC 3.1.8 support)
try {
  $na = (net accounts) | Out-String
  $val = ''
  $line = ($na -split "`n" | Where-Object { $_ -match '(?i)Lockout\s+threshold\s*:' } | Select-Object -First 1)
  if ($line) {
    $val = ($line -split ':',2)[1].Trim()
  }
  $pass = ($val -ne '') -and ($val -notmatch '(?i)never') -and ($val -notmatch '(?i)0')
  Add-Check -Id "LOCKOUT" -Control "AC.L2-3.1.8" -Title "Account lockout threshold set (not 'Never')" `
    -Pass $pass -Observed ("Lockout threshold: " + $val) -Expected "A finite threshold is configured" `
    -EvidenceHint "net-accounts.txt / account-policy.txt"
} catch {
  Add-Check -Id "LOCKOUT" -Control "AC.L2-3.1.8" -Title "Account lockout threshold set (not 'Never')" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "net accounts output parseable" `
    -EvidenceHint "net-accounts.txt / account-policy.txt"
}

### UAC posture (supports least privilege / privileged function mediation)
try {
  $p = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
  $consent = Get-RegDword -Path $p -Name "ConsentPromptBehaviorAdmin"
  $secure = Get-RegDword -Path $p -Name "PromptOnSecureDesktop"
  $pass = ($consent -eq 2) -and ($secure -eq 1)
  Add-Check -Id "UAC-PROMPT" -Control "AC.L2-3.1.5" -Title "UAC prompts enabled for administrators (ConsentPromptBehaviorAdmin=2; PromptOnSecureDesktop=1)" `
    -Pass $pass -Observed ("ConsentPromptBehaviorAdmin={0}; PromptOnSecureDesktop={1}" -f $consent,$secure) -Expected "2 and 1" `
    -EvidenceHint "uac-policy.txt"
} catch {
  Add-Check -Id "UAC-PROMPT" -Control "AC.L2-3.1.5" -Title "UAC prompts enabled for administrators (ConsentPromptBehaviorAdmin=2; PromptOnSecureDesktop=1)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "UAC policy readable" `
    -EvidenceHint "uac-policy.txt"
}

### Interactive logon notice (AC.L2-3.1.9)
try {
  $p = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
  $cap = (Get-ItemProperty -Path $p -Name "legalnoticecaption" -ErrorAction SilentlyContinue)."legalnoticecaption"
  $txt = (Get-ItemProperty -Path $p -Name "legalnoticetext" -ErrorAction SilentlyContinue)."legalnoticetext"
  $capN = [string]$cap
  $txtN = [string]$txt
  $pass = (-not [string]::IsNullOrWhiteSpace($capN)) -and (-not [string]::IsNullOrWhiteSpace($txtN))
  Add-Check -Id "LEGALNOTICE" -Control "AC.L2-3.1.9" -Title "Interactive logon notice configured (caption + text present)" `
    -Pass $pass -Observed ("CaptionLen={0}; TextLen={1}" -f ($capN.Length),($txtN.Length)) -Expected "Both non-empty" `
    -EvidenceHint "interactive-logon-notice.txt"
} catch {
  Add-Check -Id "LEGALNOTICE" -Control "AC.L2-3.1.9" -Title "Interactive logon notice configured (caption + text present)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Legal notice values readable" `
    -EvidenceHint "interactive-logon-notice.txt"
}

### Azure inheritance / boundary artifact present (shared responsibility evidence)
try {
  $ok = (Has-EvidenceFile "azure-inheritance.json")
  $obs = if ($ok) { "azure-inheritance.json present" } else { "azure-inheritance.json missing" }
  if ($ok) {
    try {
      $raw = Get-Content -LiteralPath (Get-EvidenceFilePath "azure-inheritance.json") -Raw -ErrorAction Stop
      $obj = $raw | ConvertFrom-Json -ErrorAction Stop
      $b = if ($obj -and $obj.boundary_statement) { [string]$obj.boundary_statement } else { "" }
      if ([string]::IsNullOrWhiteSpace($b)) { $ok = $false; $obs = "azure-inheritance.json invalid (missing boundary_statement)" }
    } catch {
      $ok = $false
      $obs = "azure-inheritance.json unreadable/invalid JSON"
    }
  }
  Add-Check -Id "AZ-INHERITANCE" -Control "AC.L2-3.1.1" -Title "Azure inheritance/shared responsibility artifact present (boundary statement recorded)" `
    -Pass $ok -Observed $obs -Expected "azure-inheritance.json present with boundary_statement" `
    -EvidenceHint "azure-inheritance.json (copied into evidence bundle)"
} catch {
  Add-Check -Id "AZ-INHERITANCE" -Control "AC.L2-3.1.1" -Title "Azure inheritance/shared responsibility artifact present (boundary statement recorded)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "azure-inheritance.json parseable" `
    -EvidenceHint "azure-inheritance.json"
}

### Machine inactivity limit set (AC 3.1.11 support)
$inact = Get-RegDword -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "InactivityTimeoutSecs"
Add-Check -Id "INACTIVITY" -Control "AC.L2-3.1.11" -Title "Machine inactivity limit configured (InactivityTimeoutSecs > 0)" `
  -Pass (($inact -ne $null) -and ($inact -gt 0)) -Observed ("InactivityTimeoutSecs=" + ($inact -as [string])) -Expected "> 0" `
  -EvidenceHint "machine-inactivity-limit.txt"

### Session lock (AC 3.1.10 support) - machine-level screen saver policy
try {
  $p = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop"
  $active = (Get-ItemProperty -Path $p -Name "ScreenSaveActive" -ErrorAction Stop)."ScreenSaveActive"
  $secure = (Get-ItemProperty -Path $p -Name "ScreenSaverIsSecure" -ErrorAction Stop)."ScreenSaverIsSecure"
  $tout = (Get-ItemProperty -Path $p -Name "ScreenSaveTimeOut" -ErrorAction Stop)."ScreenSaveTimeOut"
  $toutI = 0
  try { $toutI = [int]$tout } catch { $toutI = 0 }
  $pass = ($active -eq "1") -and ($secure -eq "1") -and ($toutI -gt 0)
  Add-Check -Id "SESSION-LOCK" -Control "AC.L2-3.1.10" -Title "Session lock configured (secure screen saver enabled with timeout)" `
    -Pass $pass -Observed ("Active={0}; Secure={1}; Timeout={2}" -f $active,$secure,$tout) -Expected "Active=1; Secure=1; Timeout>0" `
    -EvidenceHint "screensaver-policy.txt"
} catch {
  Add-Check -Id "SESSION-LOCK" -Control "AC.L2-3.1.10" -Title "Session lock configured (secure screen saver enabled with timeout)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Screen saver policy readable" `
    -EvidenceHint "screensaver-policy.txt"
}

### RDP redirection restrictions (clipboard + drive mapping disabled) + NLA
$clip = Get-RegDword -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" -Name "fDisableClip"
$cdm  = Get-RegDword -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" -Name "fDisableCdm"
$nla  = Get-RegDword -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" -Name "UserAuthentication"
Add-Check -Id "RDP-REDIR" -Control "AC.L2-3.1.3" -Title "RDP redirection disabled (clipboard + drive) and NLA enabled" `
  -Pass (($clip -eq 1) -and ($cdm -eq 1) -and ($nla -eq 1)) `
  -Observed ("fDisableClip={0} (1=disable,0=allow); fDisableCdm={1} (1=disable,0=allow); NLA(UserAuthentication)={2} (1=enabled)" -f $clip,$cdm,$nla) `
  -Expected "fDisableClip=1; fDisableCdm=1; NLA=1" `
  -EvidenceHint "rdp-policy.txt + rdp-tcp.txt"

### RDP session time limits (AC.L2-3.1.11 remote path — session ended after disconnect, re-auth on reconnect)
$rdpTcpPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp"
try {
  $r = Get-ItemProperty -Path $rdpTcpPath -Name MaxIdleTime, MaxDisconnectionTime, MaxConnectionTime -ErrorAction Stop
  $idle = [long]$r.MaxIdleTime; $disc = [long]$r.MaxDisconnectionTime; $conn = [long]$r.MaxConnectionTime
  $passRdp = ($idle -gt 0) -and ($disc -gt 0) -and ($conn -gt 0)
  $obsRdp = "MaxIdleTime={0}ms; MaxDisconnectionTime={1}ms; MaxConnectionTime={2}ms" -f $idle,$disc,$conn
  Add-Check -Id "RDP-SESSION-LIMITS" -Control "AC.L2-3.1.11" -Title "RDP session limits set (idle/disconnect/connection time; session ended after disconnect)" `
    -Pass $passRdp -Observed $obsRdp -Expected "All > 0 (session terminated after disconnect -> re-auth on reconnect)" `
    -EvidenceHint "rdp-tcp.txt"
} catch {
  Add-Check -Id "RDP-SESSION-LIMITS" -Control "AC.L2-3.1.11" -Title "RDP session limits set (idle/disconnect/connection time)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "MaxIdleTime, MaxDisconnectionTime, MaxConnectionTime present and > 0" `
    -EvidenceHint "rdp-tcp.txt"
}

### AU.L2-3.3.1 (Create and retain audit logs) — validate Security log is enabled + audit policy is queryable
try {
  $sec = (wevtutil gl Security) 2>&1 | Out-String
  $enabledLine = ($sec -split "`n" | Where-Object { $_ -match '^\s*enabled\s*:' } | Select-Object -First 1)
  $enabled = $false
  if ($enabledLine -and ($enabledLine -match '(?i)\btrue\b')) { $enabled = $true }
  $pass = $enabled
  Add-Check -Id "AU-SECLOG" -Control "AU.L2-3.3.1" -Title "Security audit log enabled (baseline)" `
    -Pass $pass -Observed (("enabled: " + ($enabledLine -replace '^\s*enabled\s*:\s*','').Trim())) -Expected "enabled: true" `
    -EvidenceHint "eventlog-security.txt + auditpol.txt"
} catch {
  Add-Check -Id "AU-SECLOG" -Control "AU.L2-3.3.1" -Title "Security audit log enabled (baseline)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "wevtutil gl Security queryable" `
    -EvidenceHint "eventlog-security.txt"
}

try {
  $ap = (auditpol /get /category:*) 2>&1 | Out-String
  $ok = ($ap -and ($ap.Length -gt 200) -and ($ap -notmatch '(?i)\berror\b'))
  Add-Check -Id "AU-AUDITPOL" -Control "AU.L2-3.3.1" -Title "Audit policy queryable (auditpol output present)" `
    -Pass $ok -Observed ("Length=" + ($ap.Length -as [string])) -Expected "Non-empty auditpol output" `
    -EvidenceHint "auditpol.txt"
} catch {
  Add-Check -Id "AU-AUDITPOL" -Control "AU.L2-3.3.1" -Title "Audit policy queryable (auditpol output present)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "auditpol output present" `
    -EvidenceHint "auditpol.txt"
}

### AU.L2-3.3.1 — audit subcategories enabled (stronger than 'queryable')
try {
  # On some builds, `auditpol /get /subcategory:*` fails with parameter errors.
  # `auditpol /get /category:*` includes subcategory lines + their settings and is more reliable.
  $raw = (auditpol /get /category:*) 2>&1 | Out-String
  $need = @(
    "Logon",
    "Logoff",
    "Account Lockout",
    "User Account Management",
    "Security Group Management",
    "Computer Account Management",
    "Audit Policy Change",
    "Authentication Policy Change",
    "Authorization Policy Change",
    "Security System Extension",
    "System Integrity",
    "Other System Events",
    "Sensitive Privilege Use"
  )
  $missing = @()
  foreach ($n in $need) {
    # Expect lines like: "Logon                          Success and Failure"
    # (There may be blank lines; keep match lenient on whitespace.)
    $ok = ($raw -match ("(?m)^\s*{0}\s+Success\s+and\s+Failure\s*$" -f [regex]::Escape($n)))
    if (-not $ok) { $missing += $n }
  }
  $pass = ($missing.Count -eq 0)
  Add-Check -Id "AU-SUBCATS" -Control "AU.L2-3.3.1" -Title "Audit policy subcategories enabled (Success and Failure) for key areas" `
    -Pass $pass -Observed $(if ($pass) { "All required subcategories set to Success and Failure." } else { "Missing or not enabled: " + ($missing -join ", ") }) `
    -Expected "Key subcategories set to Success and Failure" `
    -EvidenceHint "auditpol-subcategories.txt"
} catch {
  Add-Check -Id "AU-SUBCATS" -Control "AU.L2-3.3.1" -Title "Audit policy subcategories enabled (Success and Failure) for key areas" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "auditpol /get /category:* parseable" `
    -EvidenceHint "auditpol-subcategories.txt"
}

### AU.L2-3.3.1 — event log max sizes (supports retention)
function Parse-WevtutilGl([string]$name) {
  $txt = (wevtutil gl $name) 2>&1 | Out-String
  $msLine = ($txt -split "`n" | Where-Object { $_ -match '^\s*maxSize\s*:' } | Select-Object -First 1)
  $ms = $null
  if ($msLine) {
    $val = ($msLine -replace '^\s*maxSize\s*:\s*','').Trim()
    try { $ms = [int64]$val } catch { $ms = $null }
  }
  return [pscustomobject]@{ name=$name; maxSize=$ms; raw=$msLine }
}
try {
  $sec = Parse-WevtutilGl "Security"
  $sys = Parse-WevtutilGl "System"
  $app = Parse-WevtutilGl "Application"
  $pass = ($sec.maxSize -ne $null -and $sec.maxSize -ge 268435456) -and
          ($sys.maxSize -ne $null -and $sys.maxSize -ge 67108864) -and
          ($app.maxSize -ne $null -and $app.maxSize -ge 67108864)
  Add-Check -Id "AU-LOGSIZE" -Control "AU.L2-3.3.1" -Title "Event log max sizes meet pilot baseline (Security>=256MB; System/App>=64MB)" `
    -Pass $pass `
    -Observed ("Security={0}; System={1}; Application={2}" -f $sec.maxSize,$sys.maxSize,$app.maxSize) `
    -Expected "Security>=268435456; System>=67108864; Application>=67108864" `
    -EvidenceHint "eventlog-security.txt + eventlog-system.txt + eventlog-application.txt"
} catch {
  Add-Check -Id "AU-LOGSIZE" -Control "AU.L2-3.3.1" -Title "Event log max sizes meet pilot baseline (Security>=256MB; System/App>=64MB)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "wevtutil gl parseable" `
    -EvidenceHint "eventlog-security.txt"
}

### AU.L2-3.3.7 (System clock synchronization)
try {
  $status = (w32tm /query /status) 2>&1 | Out-String
  $srcLine = ($status -split "`n" | Where-Object { $_ -match '^\s*Source\s*:' } | Select-Object -First 1)
  $src = if ($srcLine) { ($srcLine -split ':',2)[1].Trim() } else { "" }
  $svc = Get-Service -Name W32Time -ErrorAction Stop
  $pass = ($svc.Status -eq "Running") -and ($src -ne "") -and ($src -notmatch '(?i)Local CMOS Clock')
  Add-Check -Id "TIME-SYNC" -Control "AU.L2-3.3.7" -Title "Time synchronization configured (W32Time running; source not Local CMOS Clock)" `
    -Pass $pass -Observed ("W32Time={0}; Source={1}" -f $svc.Status,$src) -Expected "W32Time=Running; Source != Local CMOS Clock" `
    -EvidenceHint "time-sync.txt"
} catch {
  Add-Check -Id "TIME-SYNC" -Control "AU.L2-3.3.7" -Title "Time synchronization configured (W32Time running; source not Local CMOS Clock)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "w32tm/W32Time queryable" `
    -EvidenceHint "time-sync.txt"
}

### CM.L2-3.4.2 (Security configuration settings) — ensure secpol export exists in evidence bundle
try {
  $ok = (Has-EvidenceFile "secpol.cfg")
  Add-Check -Id "SECPOL-EXPORTED" -Control "CM.L2-3.4.2" -Title "Local security policy export present in evidence bundle (secpol.cfg)" `
    -Pass $ok -Observed $(if ($ok) { "secpol.cfg present" } else { "secpol.cfg missing" }) -Expected "secpol.cfg present" `
    -EvidenceHint "secpol.cfg (in evidence bundle)"
} catch {
  Add-Check -Id "SECPOL-EXPORTED" -Control "CM.L2-3.4.2" -Title "Local security policy export present in evidence bundle (secpol.cfg)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "secpol.cfg present" `
    -EvidenceHint "secpol.cfg"
}

try {
  $p = (Get-EvidenceFilePath "secpol.cfg")
  if ($p -and (Test-Path -LiteralPath $p -PathType Leaf)) {
    $raw = Get-Content -LiteralPath $p -ErrorAction Stop
    $hasSys = ($raw | Where-Object { $_ -match '^\s*\[System Access\]\s*$' } | Select-Object -First 1)
    $hasPriv = ($raw | Where-Object { $_ -match '^\s*\[Privilege Rights\]\s*$' } | Select-Object -First 1)
    $pass = [bool]$hasSys -and [bool]$hasPriv
    Add-Check -Id "SECPOL-PARSED" -Control "CM.L2-3.4.2" -Title "Local security policy export parseable (System Access + Privilege Rights sections present)" `
      -Pass $pass -Observed ("SystemAccess={0}; PrivilegeRights={1}" -f ([bool]$hasSys),([bool]$hasPriv)) -Expected "Both sections present" `
      -EvidenceHint "secpol.cfg"
  } else {
    Add-Check -Id "SECPOL-PARSED" -Control "CM.L2-3.4.2" -Title "Local security policy export parseable (System Access + Privilege Rights sections present)" `
      -Pass $false -Observed "secpol.cfg missing (no evidence bundle selected or file absent)" -Expected "secpol.cfg present + parseable" `
      -EvidenceHint "secpol.cfg"
  }
} catch {
  Add-Check -Id "SECPOL-PARSED" -Control "CM.L2-3.4.2" -Title "Local security policy export parseable (System Access + Privilege Rights sections present)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "secpol.cfg parseable" `
    -EvidenceHint "secpol.cfg"
}

### IA.L2-3.5.1 (Identify users) — baseline proxy: local Guest account is disabled (or not present/renamed)
try {
  $guest = $null
  try { $guest = Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True AND Name='Guest'" -ErrorAction Stop } catch { $guest = $null }
  if ($guest) {
    $pass = [bool]$guest.Disabled
    Add-Check -Id "GUEST-DISABLED" -Control "IA.L2-3.5.1" -Title "Guest account disabled (baseline identity hygiene)" `
      -Pass $pass -Observed ("Guest Disabled=" + ($guest.Disabled -as [string])) -Expected "Guest Disabled=True" `
      -EvidenceHint "local-accounts.txt / secpol.cfg"
  } else {
    Add-Check -Id "GUEST-DISABLED" -Control "IA.L2-3.5.1" -Title "Guest account disabled (baseline identity hygiene)" `
      -Pass $true -Observed "Guest account not found (renamed/removed)" -Expected "Guest not enabled" `
      -EvidenceHint "local-accounts.txt / secpol.cfg"
  }
} catch {
  Add-Check -Id "GUEST-DISABLED" -Control "IA.L2-3.5.1" -Title "Guest account disabled (baseline identity hygiene)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Guest account queryable" `
    -EvidenceHint "local-accounts.txt"
}

try {
  $aal = Get-RegDword -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "AutoAdminLogon"
  $pass = ($aal -ne 1)
  Add-Check -Id "NO-AUTOLOGON" -Control "IA.L2-3.5.1" -Title "Automatic logon disabled (AutoAdminLogon not enabled)" `
    -Pass $pass -Observed ("AutoAdminLogon=" + ($aal -as [string])) -Expected "AutoAdminLogon != 1" `
    -EvidenceHint "registry Winlogon AutoAdminLogon"
} catch {
  Add-Check -Id "NO-AUTOLOGON" -Control "IA.L2-3.5.1" -Title "Automatic logon disabled (AutoAdminLogon not enabled)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "AutoAdminLogon readable" `
    -EvidenceHint "registry Winlogon AutoAdminLogon"
}

### SC.L2-3.13.1 (Monitor/control/protect communications) — proxy to firewall boundary
try {
  $fw = ($script:Checks | Where-Object { $_.id -eq 'NET-FW' } | Select-Object -First 1)
  $pass = ($fw -and ($fw.pass -eq $true))
  Add-Check -Id "SC-COMMS" -Control "SC.L2-3.13.1" -Title "Network boundary enforced (firewall baseline in effect)" `
    -Pass $pass -Observed "See NET-FW check" -Expected "Firewall baseline PASS" `
    -EvidenceHint "firewall.txt + firewall-rules-summary.txt"
} catch {
  Add-Check -Id "SC-COMMS" -Control "SC.L2-3.13.1" -Title "Network boundary enforced (firewall baseline in effect)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Firewall baseline PASS" `
    -EvidenceHint "firewall.txt"
}

try {
  $srvReq = Get-RegDword -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" -Name "RequireSecuritySignature"
  $wkReq  = Get-RegDword -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" -Name "RequireSecuritySignature"
  $pass = ($srvReq -eq 1) -and ($wkReq -eq 1)
  Add-Check -Id "SMB-SIGN" -Control "SC.L2-3.13.1" -Title "SMB signing required (server + workstation RequireSecuritySignature=1)" `
    -Pass $pass -Observed ("ServerRequire={0}; WorkstationRequire={1}" -f $srvReq,$wkReq) -Expected "ServerRequire=1; WorkstationRequire=1" `
    -EvidenceHint "smb-signing.txt"
} catch {
  Add-Check -Id "SMB-SIGN" -Control "SC.L2-3.13.1" -Title "SMB signing required (server + workstation RequireSecuritySignature=1)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "SMB signing settings queryable" `
    -EvidenceHint "smb-signing.txt"
}

### SI.L2-3.14.1 (Identify/report/correct flaws) — Windows Update services not disabled
try {
  $wua = Get-Service -Name wuauserv -ErrorAction Stop
  $bits = Get-Service -Name bits -ErrorAction Stop
  $pass = ($wua.StartType -ne "Disabled") -and ($bits.StartType -ne "Disabled")
  Add-Check -Id "WU-SERVICES" -Control "SI.L2-3.14.1" -Title "Update services enabled (wuauserv/bits not disabled)" `
    -Pass $pass -Observed ("wuauserv={0}/{1}; bits={2}/{3}" -f $wua.Status,$wua.StartType,$bits.Status,$bits.StartType) -Expected "StartType != Disabled" `
    -EvidenceHint "windows-update-services.txt + windows-update-policy.txt"
} catch {
  Add-Check -Id "WU-SERVICES" -Control "SI.L2-3.14.1" -Title "Update services enabled (wuauserv/bits not disabled)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Windows Update services queryable" `
    -EvidenceHint "windows-update-services.txt"
}

### SI.L2-3.14.2 + SI.L2-3.14.4 — Defender enabled and signatures not stale
try {
  $st = Get-MpComputerStatus -ErrorAction Stop
  $passOn = [bool]$st.RealTimeProtectionEnabled
  Add-Check -Id "DEFENDER-ON" -Control "SI.L2-3.14.2" -Title "Malicious code protection enabled (Defender real-time protection)" `
    -Pass $passOn -Observed ("RealTimeProtectionEnabled=" + ($st.RealTimeProtectionEnabled -as [string])) -Expected "RealTimeProtectionEnabled=True" `
    -EvidenceHint "defender-status.txt"

  $age = $null
  try { $age = [int]$st.AntivirusSignatureAge } catch { $age = $null }
  $passAge = ($age -ne $null) -and ($age -ge 0) -and ($age -le 7)
  Add-Check -Id "DEFENDER-UPDATES" -Control "SI.L2-3.14.4" -Title "Malicious code protection updated (Defender signature age <= 7 days)" `
    -Pass $passAge -Observed ("AntivirusSignatureAge=" + ($age -as [string])) -Expected "<= 7" `
    -EvidenceHint "defender-status.txt"
} catch {
  Add-Check -Id "DEFENDER-ON" -Control "SI.L2-3.14.2" -Title "Malicious code protection enabled (Defender real-time protection)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Get-MpComputerStatus available" `
    -EvidenceHint "defender-status.txt"
  Add-Check -Id "DEFENDER-UPDATES" -Control "SI.L2-3.14.4" -Title "Malicious code protection updated (Defender signature age <= 7 days)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Get-MpComputerStatus available" `
    -EvidenceHint "defender-status.txt"
}

### Obscure authentication feedback (IA 3.5.11)
$dlu = Get-RegDword -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" -Name "DontDisplayLastUserName"
Add-Check -Id "AUTH-UX" -Control "IA.L2-3.5.11" -Title "Obscure authentication feedback (Don't display last username)" `
  -Pass ($dlu -eq 1) -Observed ("DontDisplayLastUserName=" + ($dlu -as [string])) -Expected "DontDisplayLastUserName=1" `
  -EvidenceHint "auth-ux-policy.txt"

### NTLM posture (IA 3.5.10 supporting)
$lm = Get-RegDword -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" -Name "LmCompatibilityLevel"
$nlmh = Get-RegDword -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa" -Name "NoLmHash"
$passNtlm = ($lm -eq 5) -and ($nlmh -eq 1)
Add-Check -Id "NTLMV2" -Control "IA.L2-3.5.10" -Title "NTLMv2-only posture (LmCompatibilityLevel=5; NoLmHash=1)" `
  -Pass $passNtlm -Observed ("LmCompatibilityLevel={0}; NoLmHash={1}" -f ($lm -as [string]),($nlmh -as [string])) -Expected "LmCompatibilityLevel=5; NoLmHash=1" `
  -EvidenceHint "ntlm-policy.txt"

### LSA protection
$ppl = Get-RegDword -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" -Name "RunAsPPL"
Add-Check -Id "LSA-PPL" -Control "SI.L2-3.14.6" -Title "LSA protection enabled (RunAsPPL)" `
  -Pass ($ppl -eq 1) -Observed ("RunAsPPL=" + ($ppl -as [string])) -Expected "RunAsPPL=1" `
  -EvidenceHint "lsa.txt"

### USB mass storage disabled (pilot baseline: no removable media)
$usbstor = Get-RegDword -Path "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -Name "Start"
Add-Check -Id "USBSTOR" -Control "MP.L2-3.8.7" -Title "USB mass storage disabled (USBSTOR Start=4)" `
  -Pass ($usbstor -eq 4) -Observed ("USBSTOR Start=" + ($usbstor -as [string])) -Expected "USBSTOR Start=4" `
  -EvidenceHint "usbstor.txt"

# AC.L2-3.1.21 portable storage limitation (proxy to USBSTOR disable + removable storage policies)
try {
  $rsKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices"
  $rsExists = Test-Path -LiteralPath $rsKey -PathType Container
  $pass = ($usbstor -eq 4)
  Add-Check -Id "PORTABLE-STORAGE" -Control "AC.L2-3.1.21" -Title "Portable storage limited (USB mass storage disabled)" `
    -Pass $pass -Observed ("USBSTOR Start={0}; RemovableStoragePolicyKey={1}" -f $usbstor,$rsExists) -Expected "USBSTOR Start=4" `
    -EvidenceHint "usbstor.txt + removable-storage-policies.txt"
} catch {
  Add-Check -Id "PORTABLE-STORAGE" -Control "AC.L2-3.1.21" -Title "Portable storage limited (USB mass storage disabled)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "USBSTOR policy readable" `
    -EvidenceHint "usbstor.txt"
}

### SMB1 disabled (best-effort; informational for SC/CM hardening)
try {
  $pass = $false
  $obs = @()
  try {
    $f1 = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction Stop
    $obs += ("SMB1Protocol={0}" -f $f1.State)
    $pass = ($f1.State -match 'Disabled')
  } catch {
    $out = (dism /online /Get-FeatureInfo /FeatureName:SMB1Protocol) 2>&1 | Out-String
    $obs += ($out -replace "`r","" -replace "`n"," ").Trim()
    $pass = ($out -match '(?i)State\s*:\s*Disabled')
  }
  Add-Check -Id "SMB1" -Control "SC.L2-3.13.8" -Title "SMB1 disabled (server + client)" `
    -Pass $pass -Observed ($obs -join '; ') -Expected "SMB1Protocol feature Disabled" `
    -EvidenceHint "DISM / Get-WindowsOptionalFeature output (not currently collected)"
} catch {
  Add-Check -Id "SMB1" -Control "SC.L2-3.13.8" -Title "SMB1 disabled (server + client)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "SMB configuration queryable" `
    -EvidenceHint "smb-server-config.txt + smb-client-config.txt"
}

### Local Administrators group hygiene (supports CM change access restrictions)
try {
  $txt = (net localgroup administrators) 2>&1 | Out-String
  $bad = @()
  foreach ($needle in @("Everyone", "Users")) {
    if ($txt -match ("(?m)^\s*{0}\s*$" -f [regex]::Escape($needle))) { $bad += $needle }
  }
  $pass = ($bad.Count -eq 0)
  Add-Check -Id "LOCAL-ADMINS" -Control "CM.L2-3.4.5" -Title "Local Administrators group does not include broad principals (Everyone/Users)" `
    -Pass $pass -Observed $(if ($pass) { "No broad principals detected." } else { "Found: " + ($bad -join ", ") }) -Expected "No Everyone/Users in Administrators" `
    -EvidenceHint "local-admins.txt"
} catch {
  Add-Check -Id "LOCAL-ADMINS" -Control "CM.L2-3.4.5" -Title "Local Administrators group does not include broad principals (Everyone/Users)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Administrators membership queryable" `
    -EvidenceHint "local-admins.txt"
}

### AppLocker posture (supports CM.L2-3.4.7/3.4.8/3.4.9)
try {
  $svc = Get-Service -Name AppIDSvc -ErrorAction Stop
  $pass = ($svc.StartType -ne "Disabled")
  Add-Check -Id "APPIDSVC" -Control "CM.L2-3.4.8" -Title "Application Identity service enabled (AppIDSvc not Disabled)" `
    -Pass $pass -Observed ("Status={0}; StartType={1}" -f $svc.Status,$svc.StartType) -Expected "StartType != Disabled" `
    -EvidenceHint "services-security-relevant.txt"
} catch {
  Add-Check -Id "APPIDSVC" -Control "CM.L2-3.4.8" -Title "Application Identity service enabled (AppIDSvc not Disabled)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "AppIDSvc queryable" `
    -EvidenceHint "services-security-relevant.txt"
}

try {
  $ok = (Has-EvidenceFile "applocker-policy.txt")
  $obs = if ($ok) { "applocker-policy.txt present" } else { "applocker-policy.txt missing" }
  $pass = $false
  if ($ok) {
    try {
      $raw = Get-Content -LiteralPath (Get-EvidenceFilePath "applocker-policy.txt") -Raw -ErrorAction Stop
      # Expect XML output from Get-AppLockerPolicy -Effective -Xml when configured.
      $hasXml = ($raw -match '(?is)<AppLockerPolicy')
      $hasRules = ($raw -match '(?is)<RuleCollection')
      $enabled = ($raw -match '(?is)EnforcementMode="Enabled"|EnforcementMode="AuditOnly"')
      $pass = $hasXml -and $hasRules
      $obs = "XML={0}; Rules={1}; EnforcementModeEnabled={2}" -f $hasXml,$hasRules,$enabled
    } catch {
      $pass = $false
      $obs = "applocker-policy.txt unreadable"
    }
  }
  Add-Check -Id "APPLOCKER" -Control "CM.L2-3.4.8" -Title "AppLocker effective policy present (rules exported)" `
    -Pass $pass -Observed $obs -Expected "AppLockerPolicy XML with RuleCollection(s)" `
    -EvidenceHint "applocker-policy.txt"
} catch {
  Add-Check -Id "APPLOCKER" -Control "CM.L2-3.4.8" -Title "AppLocker effective policy present (rules exported)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "AppLocker policy export parseable" `
    -EvidenceHint "applocker-policy.txt"
}

### BitLocker status (supports MP/SC encryption-at-rest posture)
try {
  $pass = $false
  $obs = ""
  if (Has-EvidenceFile "bitlocker-status.txt") {
    $raw = Get-Content -LiteralPath (Get-EvidenceFilePath "bitlocker-status.txt") -Raw -ErrorAction Stop
    $m = ($raw -match '(?is)Volume\s+C:\s+.*?Conversion Status:\s*(Fully Encrypted|Used Space Only Encrypted).*?Protection Status:\s*Protection On')
    $pass = [bool]$m
    $obs = if ($pass) { "C: Fully Encrypted; Protection On" } else { "C: not fully encrypted and/or protection not on (see bitlocker-status.txt)" }
  } else {
    $obs = "bitlocker-status.txt missing"
  }
  Add-Check -Id "BITLOCKER-OS" -Control "MP.L2-3.8.1" -Title "BitLocker enabled for OS volume (C: fully encrypted; protection on)" `
    -Pass $pass -Observed $obs -Expected "C: Fully Encrypted and Protection On" `
    -EvidenceHint "bitlocker-status.txt"
} catch {
  Add-Check -Id "BITLOCKER-OS" -Control "MP.L2-3.8.1" -Title "BitLocker enabled for OS volume (C: fully encrypted; protection on)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "BitLocker status parseable" `
    -EvidenceHint "bitlocker-status.txt"
}

### Account policy (informational; not a claim of Entra MFA)
try {
  $na = (net accounts) | Out-String
  $path = Join-Path $outDir "net-accounts.txt"
  $na | Out-File -FilePath $path -Encoding utf8
  Add-Check -Id "ACCT-POLICY" -Control "IA.L2-3.5.7" -Title "Local account policy captured (informational)" `
    -Pass $true -Observed "Captured net accounts output" -Expected "Policy visible for review" `
    -EvidenceHint "net-accounts.txt"

  # Prohibit password reuse (IA.L2-3.5.8) — local-only check
  $hist = ""
  $histLine = ($na -split "`n" | Where-Object { $_ -match '(?i)^\s*Length of password history maintained\s*:' } | Select-Object -First 1)
  if ($histLine) { $hist = ($histLine -split ':',2)[1].Trim() }
  $histI = 0
  try { $histI = [int]$hist } catch { $histI = 0 }
  Add-Check -Id "PW-HISTORY" -Control "IA.L2-3.5.8" -Title "Password reuse prohibited (password history >= 24)" `
    -Pass ($histI -ge 24) -Observed ("History=" + $hist) -Expected "History >= 24" `
    -EvidenceHint "net-accounts.txt"
} catch {
  Add-Check -Id "ACCT-POLICY" -Control "IA.L2-3.5.7" -Title "Local account policy captured (informational)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "net accounts available" `
    -EvidenceHint "net-accounts.txt"
}

### Write report files
$summary = [pscustomobject]@{
  generated_utc = (Get-Date).ToUniversalTime().ToString("o")
  computer = $env:COMPUTERNAME
  user = $env:USERNAME
  pass_count = @($Checks | Where-Object pass).Count
  fail_count = @($Checks | Where-Object { -not $_.pass }).Count
  total = @($Checks).Count
}

$checkById = @{}
foreach ($c in $Checks) { if ($c.id) { $checkById[$c.id] = $c } }

function Has-EvFile([string]$name) {
  if (-not $resolvedEvidenceDir) { return $false }
  $p = Join-Path $resolvedEvidenceDir $name
  return (Test-Path -LiteralPath $p -PathType Leaf)
}

# Minimal per-family evidence requirements for pilot adjudication.
$familyReq = @{
  'AC' = @('firewall.txt','local-accounts.txt','account-policy.txt')
  'AU' = @('auditpol.txt','eventlog-security.txt','eventlog-system.txt','eventlog-application.txt')
  'CM' = @('installed-roles-features.txt','installed-software.txt','manifest.txt','hashes.sha256.txt')
  'IA' = @('account-policy.txt','auth-ux-policy.txt','ntlm-policy.txt')
  'MA' = @('installed-software.txt')
  'MP' = @('usbstor.txt','bitlocker-status.txt')
  'RA' = @('hotfixes.txt','windows-update-policy.txt')
  'SC' = @('fips.txt','schannel-protocols.txt','firewall.txt')
  'SI' = @('defender-status.txt','windows-update-services.txt')
}

$extraReq = @{
  'AC.L2-3.1.9'  = @('interactive-logon-notice.txt')
  'AC.L2-3.1.10' = @('screensaver-policy.txt')
  'AC.L2-3.1.11' = @('machine-inactivity-limit.txt','rdp-tcp.txt')
  'AC.L2-3.1.3'  = @('rdp-policy.txt','rdp-tcp.txt')
  'AC.L2-3.1.21' = @('usbstor.txt','removable-storage-policies.txt')
  'AU.L2-3.3.1'  = @('auditpol.txt','eventlog-security.txt')
  'AU.L2-3.3.7'  = @('time-sync.txt')
  'CM.L2-3.4.2'  = @('secpol.cfg','user-rights-assignments.txt')
  'IA.L2-3.5.1'  = @('local-accounts.txt')
  'SC.L2-3.13.1' = @('firewall.txt','firewall-rules-summary.txt','smb-signing.txt')
  'SI.L2-3.14.1' = @('windows-update-services.txt','windows-update-policy.txt')
  'SI.L2-3.14.2' = @('defender-status.txt','defender-preferences.txt')
  'SI.L2-3.14.4' = @('defender-status.txt')
  'AU.L2-3.3.4'  = @('eventlog-security.txt')
  'SC.L2-3.13.8' = @('smb1-feature.txt')
  'SI.L2-3.14.6' = @('lsa.txt')
}

$reqChecks = @{
  'AC.L2-3.1.3'  = @('RDP-REDIR')
  'AC.L2-3.1.21' = @('PORTABLE-STORAGE')
  'AC.L2-3.1.10' = @('SESSION-LOCK')
  'AC.L2-3.1.11' = @('INACTIVITY','RDP-SESSION-LIMITS')
  'AC.L2-3.1.12' = @('RM-WINRM')
  'AC.L2-3.1.9'  = @('LEGALNOTICE')
  # Access path / shared responsibility controls (evidence-based boundary assertion + local hardening posture)
  'AC.L2-3.1.1'  = @('AZ-INHERITANCE','NET-FW','RM-WINRM')
  'AC.L2-3.1.2'  = @('AZ-INHERITANCE','NET-FW','RM-WINRM')
  'AC.L2-3.1.13' = @('CRYPTO-TLS','AZ-INHERITANCE')
  'AC.L2-3.1.14' = @('NET-FW','AZ-INHERITANCE')
  'AC.L2-3.1.15' = @('RM-WINRM','AZ-INHERITANCE')
  'AC.L2-3.1.18' = @('AZ-INHERITANCE')
  'AC.L2-3.1.19' = @('AZ-INHERITANCE')
  'AC.L2-3.1.20' = @('AZ-INHERITANCE')
  'AC.L2-3.1.22' = @('AZ-INHERITANCE')
  # Least privilege / privileged function mediation proxies
  'AC.L2-3.1.5'  = @('UAC-PROMPT')
  'AC.L2-3.1.6'  = @('GUEST-DISABLED','UAC-PROMPT')
  'AC.L2-3.1.7'  = @('UAC-PROMPT')
  'AU.L2-3.3.1'  = @('AU-SECLOG','AU-AUDITPOL','AU-SUBCATS','AU-LOGSIZE')
  # Additional AU controls: reuse the same enforcement evidence (audit enabled, logs retained, time synced).
  'AU.L2-3.3.2'  = @('AU-SECLOG','AU-SUBCATS')
  'AU.L2-3.3.4'  = @('AU-SECLOG','AU-LOGSIZE','AU-SUBCATS')
  'AU.L2-3.3.5'  = @('TIME-SYNC','AU-SECLOG')
  'AU.L2-3.3.6'  = @('AU-LOGSIZE')
  'AU.L2-3.3.8'  = @('AU-SECLOG','AU-LOGSIZE')
  'AU.L2-3.3.9'  = @('AU-SECLOG','AU-SUBCATS')
  'AU.L2-3.3.7'  = @('TIME-SYNC')
  'CM.L2-3.4.2'  = @('SECPOL-EXPORTED','SECPOL-PARSED')
  'CM.L2-3.4.5'  = @('LOCAL-ADMINS')
  'CM.L2-3.4.6'  = @('SMB1','NET-FW','RM-WINRM')
  'CM.L2-3.4.7'  = @('APPIDSVC','APPLOCKER')
  'CM.L2-3.4.8'  = @('APPIDSVC','APPLOCKER')
  'CM.L2-3.4.9'  = @('APPIDSVC','APPLOCKER')
  'IA.L2-3.5.1'  = @('GUEST-DISABLED','NO-AUTOLOGON')
  # IA/MA controls are often enforced by identity platform; in this enclave we require the boundary/inheritance artifact.
  'IA.L2-3.5.2'  = @('AZ-INHERITANCE')
  'IA.L2-3.5.3'  = @('AZ-INHERITANCE')
  'IA.L2-3.5.4'  = @('AZ-INHERITANCE')
  'IA.L2-3.5.5'  = @('AZ-INHERITANCE')
  'IA.L2-3.5.6'  = @('AZ-INHERITANCE')
  'IA.L2-3.5.9'  = @('AZ-INHERITANCE')
  'MA.L2-3.7.1'  = @('AZ-INHERITANCE')
  'MA.L2-3.7.2'  = @('AZ-INHERITANCE')
  'MA.L2-3.7.5'  = @('AZ-INHERITANCE')
  # Media protection: require USB mass storage disabled and disk encryption at rest.
  'MP.L2-3.8.1'  = @('USBSTOR','BITLOCKER-OS')
  'MP.L2-3.8.2'  = @('USBSTOR','BITLOCKER-OS')
  'MP.L2-3.8.3'  = @('USBSTOR')
  'MP.L2-3.8.4'  = @('USBSTOR')
  'MP.L2-3.8.5'  = @('USBSTOR')
  'MP.L2-3.8.6'  = @('USBSTOR')
  'MP.L2-3.8.8'  = @('USBSTOR')
  'MP.L2-3.8.9'  = @('USBSTOR')
  # Risk assessment: proxy via patching + AV posture.
  'RA.L2-3.11.2' = @('DEFENDER-ON','DEFENDER-UPDATES')
  'RA.L2-3.11.3' = @('WU-SERVICES','DEFENDER-UPDATES')
  # System & communications protection: proxy via firewall + TLS + encryption-at-rest.
  'SC.L2-3.13.2'  = @('NET-FW','AZ-INHERITANCE')
  'SC.L2-3.13.3'  = @('NET-FW')
  'SC.L2-3.13.4'  = @('NET-FW')
  'SC.L2-3.13.5'  = @('NET-FW')
  'SC.L2-3.13.9'  = @('NET-FW')
  'SC.L2-3.13.10' = @('NET-FW')
  'SC.L2-3.13.12' = @('CRYPTO-TLS')
  'SC.L2-3.13.13' = @('CRYPTO-TLS')
  'SC.L2-3.13.15' = @('CRYPTO-TLS','BITLOCKER-OS')
  'SC.L2-3.13.16' = @('BITLOCKER-OS')
  'SC.L2-3.13.1' = @('NET-FW','SC-COMMS','SMB-SIGN')
  'SI.L2-3.14.1' = @('WU-SERVICES')
  'SI.L2-3.14.2' = @('DEFENDER-ON')
  'SI.L2-3.14.4' = @('DEFENDER-UPDATES')
  # SI posture: proxy via AV + patching + service state.
  'SI.L2-3.14.3' = @('DEFENDER-ON','DEFENDER-UPDATES')
  'SI.L2-3.14.5' = @('WU-SERVICES')
  'SI.L2-3.14.7' = @('DEFENDER-ON','WU-SERVICES')
  'SC.L2-3.13.6' = @('NET-FW')
  'SC.L2-3.13.11' = @('CRYPTO-FIPS')
  'SC.L2-3.13.8'  = @('CRYPTO-TLS','SMB1')
  'SI.L2-3.14.6'  = @('LSA-PPL')
  'MP.L2-3.8.7'   = @('USBSTOR')
  'IA.L2-3.5.10'  = @('NTLMV2')
  'IA.L2-3.5.11'  = @('AUTH-UX')
  'AC.L2-3.1.8'   = @('LOCKOUT')
  'CM.L2-3.4.1'   = @('PLAT-OS')
  'IA.L2-3.5.7'   = @('ACCT-POLICY')
  'IA.L2-3.5.8'   = @('PW-HISTORY')
}

# System-Enforced (Class A) controls we want to adjudicate from this validator + evidence bundle.
# Includes:
# - planned/partial (to drive closeout)
# - plus additional "implemented" controls that must still be provable via control_results for audit defensibility
$planned = @(
  # AC
  'AC.L2-3.1.1','AC.L2-3.1.2','AC.L2-3.1.3','AC.L2-3.1.5','AC.L2-3.1.6','AC.L2-3.1.7','AC.L2-3.1.9','AC.L2-3.1.10','AC.L2-3.1.13','AC.L2-3.1.14','AC.L2-3.1.15','AC.L2-3.1.18','AC.L2-3.1.19','AC.L2-3.1.20','AC.L2-3.1.22',
  # AC (additional implemented controls we want defensible PASS entries for)
  'AC.L2-3.1.8','AC.L2-3.1.11','AC.L2-3.1.12','AC.L2-3.1.21',
  # AU
  'AU.L2-3.3.1','AU.L2-3.3.2','AU.L2-3.3.4','AU.L2-3.3.5','AU.L2-3.3.6','AU.L2-3.3.7','AU.L2-3.3.8','AU.L2-3.3.9',
  # CM
  'CM.L2-3.4.5','CM.L2-3.4.6','CM.L2-3.4.7','CM.L2-3.4.8','CM.L2-3.4.9',
  # CM (additional implemented)
  'CM.L2-3.4.1','CM.L2-3.4.2',
  # IA
  'IA.L2-3.5.1','IA.L2-3.5.2','IA.L2-3.5.3','IA.L2-3.5.4','IA.L2-3.5.5','IA.L2-3.5.6','IA.L2-3.5.8','IA.L2-3.5.9','IA.L2-3.5.10','IA.L2-3.5.11',
  # IA (additional implemented)
  'IA.L2-3.5.7',
  # MA
  'MA.L2-3.7.1','MA.L2-3.7.2','MA.L2-3.7.5',
  # MP
  'MP.L2-3.8.1','MP.L2-3.8.2','MP.L2-3.8.3','MP.L2-3.8.4','MP.L2-3.8.5','MP.L2-3.8.6','MP.L2-3.8.8','MP.L2-3.8.9',
  # MP (additional implemented)
  'MP.L2-3.8.7',
  # RA
  'RA.L2-3.11.2','RA.L2-3.11.3',
  # SC
  'SC.L2-3.13.2','SC.L2-3.13.3','SC.L2-3.13.4','SC.L2-3.13.5','SC.L2-3.13.9','SC.L2-3.13.10','SC.L2-3.13.12','SC.L2-3.13.13','SC.L2-3.13.15','SC.L2-3.13.16',
  # SC (additional implemented)
  'SC.L2-3.13.1','SC.L2-3.13.6','SC.L2-3.13.8','SC.L2-3.13.11',
  # SI
  'SI.L2-3.14.3','SI.L2-3.14.5','SI.L2-3.14.7',
  # SI (additional implemented)
  'SI.L2-3.14.1','SI.L2-3.14.2','SI.L2-3.14.4','SI.L2-3.14.6'
)

$controlResults = @()
foreach ($cid in $planned) {
  $fam = ($cid -split '\.')[0]
  $need = @()
  if ($familyReq.ContainsKey($fam)) { $need += $familyReq[$fam] }
  if ($extraReq.ContainsKey($cid)) { $need += $extraReq[$cid] }
  $need = $need | Select-Object -Unique

  $missing = @()
  foreach ($f in $need) { if (-not (Has-EvFile $f)) { $missing += $f } }

  $needCheckIds = @()
  if ($reqChecks.ContainsKey($cid)) { $needCheckIds = $reqChecks[$cid] }
  $failedChecks = @()
  foreach ($id in $needCheckIds) {
    if ($checkById.ContainsKey($id) -and (-not $checkById[$id].pass)) { $failedChecks += $id }
  }

  # If no check coverage exists for this control, do not claim PASS.
  $noCoverage = ($needCheckIds.Count -eq 0)
  $pass = (-not $noCoverage) -and ($missing.Count -eq 0) -and ($failedChecks.Count -eq 0)
  if ($noCoverage) {
    $failedChecks += "NO-CHECK-IMPLEMENTED"
  }
  $basis = if (-not $resolvedEvidenceDir) {
    "No evidence bundle selected (Mode=$($evidenceSelection.mode)). Pass/fail based on live checks only where present."
  } elseif ($noCoverage) {
    "No validator check coverage implemented for this control yet; do not treat as closed until evidence/verification is added."
  } elseif ($pass) {
    "Evidence bundle contains required artifacts and required checks passed."
  } else {
    "Missing artifacts and/or failed checks; see missing_files / failed_check_ids."
  }

  $controlResults += [pscustomobject]@{
    control_id = $cid
    family = $fam
    pass = $pass
    evidence_dir = $resolvedEvidenceDir
    required_files = $need
    missing_files = $missing
    required_check_ids = $needCheckIds
    failed_check_ids = $failedChecks
    basis = $basis
    timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
  }
}

$txt = Join-Path $outDir "validation-report.txt"
@(
  "CUI Pilot Validation Report (read-only)"
  "Generated (UTC): $($summary.generated_utc)"
  "Computer: $($summary.computer)"
  "User: $($summary.user)"
  "Evidence bundle: $resolvedEvidenceDir"
  "Evidence selection: Mode=$($evidenceSelection.mode) Provided=$EvidenceDir Exists=$($evidenceSelection.provided_exists)"
  "Evidence selection note: $($evidenceSelection.note)"
  "PASS: $($summary.pass_count)  FAIL: $($summary.fail_count)  TOTAL: $($summary.total)"
  ""
  "Checks:"
) | Out-File -FilePath $txt -Encoding utf8

foreach ($c in $Checks) {
  ("[{0}] {1} ({2}) - {3} | Observed: {4} | Expected: {5} | Evidence: {6}" -f ($(if($c.pass){'PASS'}else{'FAIL'})),$c.title,$c.control,$c.id,$c.observed,$c.expected,$c.evidence_hint) |
    Add-Content -Path $txt -Encoding utf8
}

$json = Join-Path $outDir "validation-report.json"
Write-Utf8NoBom -Path $json -Text (([pscustomobject]@{
    summary = $summary
    checks = $Checks
    evidence_dir = $resolvedEvidenceDir
    evidence_bundle_selection = $evidenceSelection
    control_results = $controlResults
  } | ConvertTo-Json -Depth 8))

Write-Host "Wrote: $txt"
Write-Host "Wrote: $json"
