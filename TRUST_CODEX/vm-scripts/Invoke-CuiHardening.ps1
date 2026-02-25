<# 
Invoke-CuiHardening.ps1
Idempotent CMMC L2 in-VM hardening baseline for Windows Server 2025 (pilot).

Design intent:
- Safe to re-run (idempotent where feasible)
- Logs all actions and changes
- Focuses on high-signal baseline settings that produce defensible evidence

NOTE: This script makes configuration changes. Execute only under authorized change control.
#>

param(
  [ValidateSet("pilot_strict","safe_minimum")]
  [string]$Mode = "pilot_strict",

  [switch]$WhatIf,

  [bool]$DisableWinRM = $true,
  [bool]$DisableRdp  = $false,
  [bool]$DisableSmb1 = $true,
  [int]$InactivityTimeoutSecs = 900,
  # RDP session limits (AC.L2-3.1.11): idle → disconnect; disconnected → end session (re-auth on reconnect). Times in minutes/hours.
  [int]$RdpMaxIdleMinutes = 15,
  [int]$RdpMaxDisconnectionMinutes = 5,
  [int]$RdpMaxConnectionHours = 8,
  # Default to a defensible logon banner (auditor-friendly).
  [bool]$SetLegalNotice = $true,
  [string]$LegalNoticeCaption = "Authorized Use Only",
  [string]$LegalNoticeText = "",

  # Preserve access paths for operations; harden these LAST.
  [bool]$KeepSshAccess = $true,
  [bool]$KeepRdpAccess = $true,

  # Turnkey: attempt remaining enforcement items (requires elevation).
  [bool]$EnableAppLocker = $true,
  [bool]$EnableBitLocker = $true
)

$HardeningRoot = "C:\Hardening"
$Log = Join-Path $HardeningRoot "hardening.log"
New-Item -ItemType Directory -Path $HardeningRoot -Force | Out-Null

$RunId = Get-Date -Format yyyyMMdd-HHmmss
$RunJsonPath = Join-Path $HardeningRoot ("hardening-run-{0}.json" -f $RunId)
$RunJsonLatestPath = Join-Path $HardeningRoot "hardening-run-latest.json"
$script:RunChanges = @()

function Write-Log {
  param($Msg,$Level="INFO")
  $line = "[{0:u}][{1}] {2}" -f (Get-Date),$Level,$Msg
  Add-Content -Path $Log -Value $line
  Write-Host $line
  try {
    $script:RunChanges += [pscustomobject]@{
      utc = (Get-Date).ToUniversalTime().ToString("o")
      level = $Level
      message = $Msg
    }
  } catch {}
}

function Set-Reg {
  param($Path,$Name,$Value)
  $exists = $false
  $cur = $null
  try {
    $cur = (Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop).$Name
    $exists = $true
  } catch {
    $cur = $null
    $exists = $false
  }
  if ($cur -ne $Value) {
    if ($WhatIf) {
      Write-Log "WHATIF Registry would set $Path\\$Name=$Value (was $cur)" "WHATIF"
      return
    }
    try {
      if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -Path $Path -Force | Out-Null
      }
    } catch {
      Write-Log "Registry ensure path failed (continuing): $Path ($($_.Exception.Message))" "WARN"
    }
    try {
      # Set-ItemProperty does not reliably create missing values on all builds; create explicitly when absent.
      if (-not $exists) {
        $ptype = "String"
        $v = $Value
        if ($Value -is [bool]) { $ptype = "DWord"; $v = ($(if ($Value) { 1 } else { 0 })) }
        elseif ($Value -is [int] -or $Value -is [long]) { $ptype = "DWord"; $v = [int]$Value }
        New-ItemProperty -Path $Path -Name $Name -Value $v -PropertyType $ptype -Force | Out-Null
        Write-Log "Registry created $Path\\$Name=$v (type=$ptype; was missing)" "CHANGE"
      } else {
        Set-ItemProperty -Path $Path -Name $Name -Value $Value -Force
        Write-Log "Registry set $Path\\$Name=$Value (was $cur)" "CHANGE"
      }
    } catch {
      Write-Log "Registry set failed: $Path\\$Name=$Value ($($_.Exception.Message))" "WARN"
    }
  } else {
    Write-Log "Registry already $Path\\$Name=$Value"
  }
}

Write-Log "START CUI HARDENING"
Write-Log ("RunId={0} Mode={1} WhatIf={2}" -f $RunId,$Mode,([bool]$WhatIf)) "INFO"

### Cryptography / protocol baseline
# FIPS mode (system policy)
Set-Reg "HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy" "Enabled" 1

# TLS baseline (disable 1.0/1.1; ensure 1.2 enabled)
$sch = "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols"
foreach ($p in @("TLS 1.0","TLS 1.1")) {
  Set-Reg "$sch\$p\Client" "Enabled" 0
  Set-Reg "$sch\$p\Server" "Enabled" 0
}
Set-Reg "$sch\TLS 1.2\Client" "Enabled" 1
Set-Reg "$sch\TLS 1.2\Server" "Enabled" 1

### Authentication hardening (local, evidence-friendly)
# LSA protection (RunAsPPL)
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "RunAsPPL" 1

# Disable automatic logon (IA.L2-3.5.1 support)
Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" "AutoAdminLogon" 0

# Disable Guest account (IA.L2-3.5.1 support)
try {
  if ($WhatIf) {
    Write-Log "WHATIF Would disable local Guest account" "WHATIF"
  } else {
    net user Guest /active:no | Out-Null
    Write-Log "Guest account disabled (net user Guest /active:no)" "CHANGE"
  }
} catch {
  Write-Log "Guest disable failed: $($_.Exception.Message)" "WARN"
}

# Local account policy baseline (supports AC/IA controls where local policy is in scope)
# NOTE: Uses `net accounts` for password/lockout policy. This is local-only evidence, not an Entra policy claim.
try {
  $before = (net accounts) | Out-String
  if ($WhatIf) {
    Write-Log "WHATIF Would apply net accounts baseline (/minpwlen:14 /maxpwage:60 /minpwage:1 /uniquepw:24 /lockoutthreshold:5 ...)" "WHATIF"
  } else {
    net accounts /minpwlen:14 /maxpwage:60 /minpwage:1 /uniquepw:24 /lockoutthreshold:5 /lockoutduration:15 /lockoutwindow:15 | Out-Null
  }
  $after = (net accounts) | Out-String
  if ($before -ne $after) {
    Write-Log "Local account policy updated via net accounts (password + lockout baseline)" "CHANGE"
  } else {
    Write-Log "Local account policy already matches net accounts baseline"
  }
} catch {
  Write-Log "net accounts baseline failed: $($_.Exception.Message)" "WARN"
}

# Prevent anonymous enumeration (baseline hardening)
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "restrictanonymous" 1
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "restrictanonymoussam" 1

# Avoid storing LM hashes
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "NoLmHash" 1

### SMB baseline
if ($DisableSmb1) {
  try {
    if ($WhatIf) {
      Write-Log "WHATIF Would disable SMB1 (best-effort; may require reboot)" "WHATIF"
    } else {
      $did = $false
      try {
        # Some builds do not expose EnableSMB1Protocol properties; keep as best-effort.
        Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force | Out-Null
        Set-SmbClientConfiguration -EnableSMB1Protocol $false -Force | Out-Null
        $did = $true
      } catch {}

      if (-not $did) {
        try {
          $f = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction Stop
          if ($f.State -notmatch 'Disabled') {
            Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart -Remove -ErrorAction Stop | Out-Null
            Write-Log "SMB1 feature disabled via Disable-WindowsOptionalFeature (NoRestart). Reboot may be required." "CHANGE"
          } else {
            Write-Log "SMB1 feature already disabled (WindowsOptionalFeature)" "INFO"
          }
          $did = $true
        } catch {
          try {
            dism /online /Disable-Feature /FeatureName:SMB1Protocol /Remove /NoRestart | Out-Null
            Write-Log "SMB1 feature disable attempted via DISM (/NoRestart). Reboot may be required." "CHANGE"
            $did = $true
          } catch {}
        }
      }

      if ($did) {
        Write-Log "SMB1 disable completed (one of the methods applied or confirmed disabled)" "CHANGE"
      } else {
        Write-Log "SMB1 disable skipped: all methods failed" "WARN"
      }
    }
  } catch {
    Write-Log "SMB1 disable skipped: $($_.Exception.Message)" "WARN"
  }
}

# SMB signing required
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" "RequireSecuritySignature" 1
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" "RequireSecuritySignature" 1

### UAC baseline
Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "ConsentPromptBehaviorAdmin" 2
Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "PromptOnSecureDesktop" 1

### AppLocker baseline (CM.L2-3.4.7/3.4.8/3.4.9 support)
# Goal: ensure an evidence-friendly baseline policy exists without risking lockout.
# We apply a minimal "Allow Windows" policy (Path rules) and enable AppIDSvc startup.
if ($Mode -eq "pilot_strict" -and $EnableAppLocker) {
  try {
    if ($WhatIf) {
      Write-Log "WHATIF Would enable AppIDSvc and apply a minimal AppLocker policy (AllowWindows Path rules) if none exists" "WHATIF"
    } else {
      try {
        Set-Service -Name AppIDSvc -StartupType Automatic -ErrorAction Stop
        Start-Service -Name AppIDSvc -ErrorAction SilentlyContinue
        Write-Log "AppIDSvc set to Automatic (started if possible)" "CHANGE"
      } catch {
        Write-Log "AppIDSvc configuration failed (continuing): $($_.Exception.Message)" "WARN"
      }

      $curXml = ""
      try { $curXml = (Get-AppLockerPolicy -Effective -Xml) 2>&1 | Out-String } catch { $curXml = "" }
      if (-not ($curXml -match '(?is)<RuleCollection\\b')) {
        try {
          $xml = New-AppLockerPolicy -AllowWindows -RuleType Path -User Everyone -Xml
          # Make policy enforcement explicit (still based on safe allow rules).
          $xml = $xml -replace 'EnforcementMode=\"NotConfigured\"', 'EnforcementMode=\"Enabled\"'
          $xmlPath = Join-Path $HardeningRoot "applocker-baseline.xml"
          Set-Content -LiteralPath $xmlPath -Value $xml -Encoding UTF8
          # Set-AppLockerPolicy expects a path to an XML policy file.
          Set-AppLockerPolicy -XmlPolicy $xmlPath -ErrorAction Stop
          Write-Log "AppLocker baseline policy applied (AllowWindows Path rules)" "CHANGE"
        } catch {
          Write-Log "AppLocker policy apply failed (continuing): $($_.Exception.Message)" "WARN"
        }
      } else {
        Write-Log "AppLocker policy already present (RuleCollection detected); no changes made"
      }
    }
  } catch {
    Write-Log "AppLocker baseline skipped: $($_.Exception.Message)" "WARN"
  }
}

### Session lock / inactivity (AC.L2-3.1.10, AC.L2-3.1.11)
# Machine inactivity limit (seconds)
if ($InactivityTimeoutSecs -gt 0) {
  Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "InactivityTimeoutSecs" $InactivityTimeoutSecs
}
# Machine-level screen saver policy (secure, timeout)
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop" "ScreenSaveActive" "1"
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop" "ScreenSaverIsSecure" "1"
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop" "ScreenSaveTimeOut" ([string]$InactivityTimeoutSecs)

### Authentication UX hardening (IA.L2-3.5.11)
# Obscure authentication feedback (don’t show last username)
Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "DontDisplayLastUserName" 1

### Password/NTLM posture (IA.L2-3.5.10 supporting control)
# Enforce NTLMv2 only (avoid legacy LM/NTLM where possible)
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "LmCompatibilityLevel" 5

### Optional: interactive logon notice (AC.L2-3.1.9)
if ($SetLegalNotice) {
  if ([string]::IsNullOrWhiteSpace($LegalNoticeText)) {
    $LegalNoticeText = @"
This system is for authorized use only.
Activities on this system are monitored and recorded.
Unauthorized use is prohibited and may be subject to criminal and civil penalties.
"@.Trim()
  }
  if (-not [string]::IsNullOrWhiteSpace($LegalNoticeCaption)) {
    Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "legalnoticecaption" $LegalNoticeCaption
  }
  if (-not [string]::IsNullOrWhiteSpace($LegalNoticeText)) {
    Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "legalnoticetext" $LegalNoticeText
  } else {
    Write-Log "LegalNoticeText empty; not setting legalnoticetext (provide text to enable notice)" "WARN"
  }
}

### Name resolution hardening
# LLMNR off
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient" "EnableMulticast" 0

### Audit policy baseline (AU family)
if ($Mode -eq "pilot_strict") {
  try {
    if ($WhatIf) {
      Write-Log "WHATIF Would enable audit policy subcategories (success+failure) for key areas" "WHATIF"
    } else {
      $subs = @(
        # Logon/Account
        "Logon",
        "Logoff",
        "Account Lockout",
        "User Account Management",
        "Security Group Management",
        "Computer Account Management",
        # Policy/System
        "Audit Policy Change",
        "Authentication Policy Change",
        "Authorization Policy Change",
        "Security System Extension",
        "System Integrity",
        "Other System Events",
        # Privilege use (high signal)
        "Sensitive Privilege Use"
      )
      foreach ($s in $subs) {
        auditpol /set /subcategory:"$s" /success:enable /failure:enable | Out-Null
      }
      Write-Log "Audit policy baseline applied (key subcategories enabled for success+failure)" "CHANGE"
    }
  } catch {
    Write-Log "Audit policy baseline failed: $($_.Exception.Message)" "WARN"
  }
}

### Event log sizing/retention (AU family)
try {
  if ($Mode -eq "pilot_strict") {
    $targets = @(
      @{ name = "Security"; ms = 268435456 },   # 256MB
      @{ name = "System"; ms = 67108864 },      # 64MB
      @{ name = "Application"; ms = 67108864 }  # 64MB
    )
    foreach ($t in $targets) {
      if ($WhatIf) {
        Write-Log ("WHATIF Would set event log {0} maxsize={1} bytes" -f $t.name,$t.ms) "WHATIF"
      } else {
        wevtutil sl $t.name /ms:$($t.ms) | Out-Null
      }
    }
    if (-not $WhatIf) { Write-Log "Event log max sizes set (Security/System/Application)" "CHANGE" }
  }
} catch {
  Write-Log "Event log sizing step failed: $($_.Exception.Message)" "WARN"
}

### Time synchronization (AU.L2-3.3.7)
try {
  if ($WhatIf) {
    Write-Log "WHATIF Would ensure W32Time service enabled and running" "WHATIF"
  } else {
    Set-Service W32Time -StartupType Automatic
    Start-Service W32Time -ErrorAction SilentlyContinue
    try { w32tm /resync | Out-Null } catch {}
    Write-Log "W32Time ensured (StartupType=Automatic; attempted start/resync)" "CHANGE"
  }
} catch {
  Write-Log "W32Time hardening failed: $($_.Exception.Message)" "WARN"
}

### Firewall baseline (deny inbound, allow outbound; log allowed + dropped)
try {
  if ($WhatIf) {
    Write-Log "WHATIF Would apply firewall baseline (state on; block inbound/allow outbound; enable logging)" "WHATIF"
  } else {
    netsh advfirewall set allprofiles state on | Out-Null
    netsh advfirewall set allprofiles firewallpolicy blockinbound,allowoutbound | Out-Null
    netsh advfirewall set allprofiles logging allowedconnections enable | Out-Null
    netsh advfirewall set allprofiles logging droppedconnections enable | Out-Null
    if ($KeepSshAccess) {
      try {
        netsh advfirewall firewall add rule name="CUI Allow SSH Inbound (TCP 22)" dir=in action=allow protocol=TCP localport=22 profile=any | Out-Null
        Write-Log "Firewall: ensured inbound allow for SSH (TCP 22)" "CHANGE"
      } catch {
        Write-Log "Firewall: could not add SSH allow rule: $($_.Exception.Message)" "WARN"
      }
    }
    if ($KeepRdpAccess) {
      try {
        netsh advfirewall firewall add rule name="CUI Allow RDP Inbound (TCP 3389)" dir=in action=allow protocol=TCP localport=3389 profile=any | Out-Null
        Write-Log "Firewall: ensured inbound allow for RDP (TCP 3389)" "CHANGE"
      } catch {
        Write-Log "Firewall: could not add RDP allow rule: $($_.Exception.Message)" "WARN"
      }
    }
    Write-Log "Firewall baseline applied (block inbound, allow outbound; logging enabled)" "CHANGE"
  }
} catch {
  Write-Log "Firewall baseline step failed: $($_.Exception.Message)" "WARN"
}

### Remote management posture
if ($DisableWinRM) {
  try {
    if ($WhatIf) {
      Write-Log "WHATIF Would disable WinRM service" "WHATIF"
    } else {
      Stop-Service WinRM -ErrorAction SilentlyContinue
      Set-Service WinRM -StartupType Disabled
      Write-Log "WinRM disabled" "CHANGE"
    }
  } catch {
    Write-Log "WinRM disable failed: $($_.Exception.Message)" "WARN"
  }
}

### RDP hardening (pilot: VPN + RDP access; restrict redirection)
# These settings satisfy Test-CuiHardening.ps1 check RDP-REDIR (AC.L2-3.1.3 / AC.L2-3.1.21). See TRUST_CODEX/docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md.
# NLA (UserAuthentication=1) is required for CMMC AC.L2-3.1.3; set explicitly as DWord so it is not stored as string.
$rdpTcpPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp"
if (Test-Path -LiteralPath $rdpTcpPath -PathType Container) {
  try {
    New-ItemProperty -LiteralPath $rdpTcpPath -Name "UserAuthentication" -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Log "RDP NLA (UserAuthentication) set to 1 (DWord)" "CHANGE"
  } catch {
    Set-Reg $rdpTcpPath "UserAuthentication" 1
  }
} else {
  Set-Reg $rdpTcpPath "UserAuthentication" 1
}
# Policy-based NLA (reinforces runtime; helps prevent override)
$rdpPolicyPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Server\WinStations\RDP-Tcp"
if (-not (Test-Path -LiteralPath $rdpPolicyPath -PathType Container)) {
  try { New-Item -Path $rdpPolicyPath -Force | Out-Null } catch { }
}
if (Test-Path -LiteralPath $rdpPolicyPath -PathType Container) {
  try {
    New-ItemProperty -LiteralPath $rdpPolicyPath -Name "UserAuthentication" -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Log "RDP NLA policy (UserAuthentication) set to 1" "CHANGE"
  } catch { }
}
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" "DisablePasswordSaving" 1
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" "fDisableClip" 1
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" "fDisableCdm" 1

# RDP session time limits (AC.L2-3.1.11 remote path): end session after disconnect so reconnection requires re-auth. Values in milliseconds.
if (-not $DisableRdp -and (Test-Path -LiteralPath $rdpTcpPath -PathType Container)) {
  if ($RdpMaxIdleMinutes -gt 0) {
    $msIdle = [int]($RdpMaxIdleMinutes * 60 * 1000)
    Set-Reg $rdpTcpPath "MaxIdleTime" $msIdle
    Write-Log ("RDP MaxIdleTime set to {0} min, {1} ms" -f $RdpMaxIdleMinutes, $msIdle) "CHANGE"
  }
  if ($RdpMaxDisconnectionMinutes -gt 0) {
    $msDisc = [int]($RdpMaxDisconnectionMinutes * 60 * 1000)
    Set-Reg $rdpTcpPath "MaxDisconnectionTime" $msDisc
    Write-Log ("RDP MaxDisconnectionTime set to {0} min, {1} ms; session ended after disconnect, re-auth required" -f $RdpMaxDisconnectionMinutes, $msDisc) "CHANGE"
  }
  if ($RdpMaxConnectionHours -gt 0) {
    $msConn = [int]($RdpMaxConnectionHours * 3600 * 1000)
    Set-Reg $rdpTcpPath "MaxConnectionTime" $msConn
    Write-Log ("RDP MaxConnectionTime set to {0} h, {1} ms" -f $RdpMaxConnectionHours, $msConn) "CHANGE"
  }
}

if ($DisableRdp) {
  Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server" "fDenyTSConnections" 1
  Write-Log "RDP disabled" "CHANGE"
}

### BitLocker baseline (MP/SC support; requires elevation; may take time)
if ($Mode -eq "pilot_strict" -and $EnableBitLocker) {
  try {
    if ($WhatIf) {
      Write-Log "WHATIF Would enable BitLocker on OS volume (C:) with recovery password protector" "WHATIF"
    } else {
      $st = (manage-bde -status C:) 2>&1 | Out-String
      $already = ($st -match '(?i)Conversion Status:\s*Fully Encrypted') -and ($st -match '(?i)Protection Status:\s*Protection On')
      if ($already) {
        Write-Log "BitLocker already enabled on C: (Fully Encrypted; Protection On)" "INFO"
      } else {
        # Best-effort feature install (may already be present).
        try {
          $f = Get-WindowsFeature -Name BitLocker -ErrorAction SilentlyContinue
          if ($f -and -not $f.Installed) {
            Install-WindowsFeature -Name BitLocker -IncludeAllSubFeature -IncludeManagementTools | Out-Null
            Write-Log "BitLocker WindowsFeature installed" "CHANGE"
          }
        } catch {}

        # Ensure there is a recovery password protector.
        try {
          $prot = (manage-bde -protectors -get C:) 2>&1 | Out-String
          if ($prot -notmatch '(?i)Recovery Password') {
            $add = (manage-bde -protectors -add C: -RecoveryPassword) 2>&1 | Out-String
            $rp = ""
            $m = [regex]::Match($add, '(?im)^\s*Password:\s*(.+)\s*$')
            if ($m.Success) { $rp = $m.Groups[1].Value.Trim() }
            if ($rp) {
              $rpPath = Join-Path $HardeningRoot ("bitlocker-recovery-password-{0}.txt" -f $RunId)
              Set-Content -LiteralPath $rpPath -Value ("RecoveryPassword (ESCROW THIS SECURELY): " + $rp) -Encoding UTF8
              try { icacls $rpPath /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)" | Out-Null } catch {}
              Write-Log "BitLocker recovery password protector added (saved to $rpPath; secure/escrow it)" "CHANGE"
            } else {
              Write-Log "BitLocker recovery password protector added (recovery password not captured)" "CHANGE"
            }
          }
        } catch {
          Write-Log "BitLocker protector step failed (continuing): $($_.Exception.Message)" "WARN"
        }

        # Enable BitLocker (UsedSpaceOnly speeds initial encryption). SkipHardwareTest avoids reboot gating.
        try {
          manage-bde -on C: -UsedSpaceOnly -RecoveryPassword -SkipHardwareTest | Out-Null
          try { manage-bde -protectors -enable C: | Out-Null } catch {}
          Write-Log "BitLocker enable initiated on C: (UsedSpaceOnly; RecoveryPassword; SkipHardwareTest)" "CHANGE"
        } catch {
          Write-Log "BitLocker enable failed: $($_.Exception.Message)" "WARN"
        }
      }
    }
  } catch {
    Write-Log "BitLocker baseline skipped: $($_.Exception.Message)" "WARN"
  }
}

### Portable storage baseline (AC.L2-3.1.21 + MP.L2-3.8.7 support)
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" "Start" 4

### Windows Update services (SI.L2-3.14.1 support) — ensure not disabled
try {
  if ($WhatIf) {
    Write-Log "WHATIF Would ensure wuauserv/bits StartType not Disabled" "WHATIF"
  } else {
    Set-Service wuauserv -StartupType Manual -ErrorAction SilentlyContinue
    Set-Service bits -StartupType Automatic -ErrorAction SilentlyContinue
    Write-Log "Windows Update services ensured (wuauserv=Manual; bits=Automatic)" "CHANGE"
  }
} catch {
  Write-Log "Windows Update services hardening failed: $($_.Exception.Message)" "WARN"
}

### Defender baseline (best-effort; logs if unavailable)
try {
  if ($Mode -eq "pilot_strict") {
    if ($WhatIf) {
      Write-Log "WHATIF Would ensure Defender realtime + signature updates (best-effort)" "WHATIF"
    } else {
      try { Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue } catch {}
      try { Update-MpSignature -ErrorAction SilentlyContinue | Out-Null } catch {}
      Write-Log "Defender realtime + signature update attempted" "CHANGE"
    }
  }
  $ids = @(
    # Block Office from creating child processes
    "56a863a9-875e-4185-98a7-b882c64b5ce5",
    # Block credential stealing from LSASS
    "9e6b0f98-0d76-40b0-a98e-95b9d1d9ef0d"
  )
  $actions = @("Enabled","Enabled")
  if ($WhatIf) {
    Write-Log "WHATIF Would ensure Defender ASR rules" "WHATIF"
  } else {
    Set-MpPreference -AttackSurfaceReductionRules_Ids $ids -AttackSurfaceReductionRules_Actions $actions
    Write-Log "Defender ASR rules ensured" "CHANGE"
  }
} catch {
  Write-Log "Defender ASR skipped: $($_.Exception.Message)" "WARN"
}

Write-Log "HARDENING COMPLETE"

### Write run artifact summary (JSON)
try {
  $obj = [pscustomobject]@{
    schema = "mactech.codex.hardening_run"
    version = 1
    run_id = $RunId
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    mode = $Mode
    whatif = [bool]$WhatIf
    parameters = [pscustomobject]@{
      DisableWinRM = [bool]$DisableWinRM
      DisableRdp = [bool]$DisableRdp
      DisableSmb1 = [bool]$DisableSmb1
      InactivityTimeoutSecs = $InactivityTimeoutSecs
      SetLegalNotice = [bool]$SetLegalNotice
      KeepSshAccess = [bool]$KeepSshAccess
      KeepRdpAccess = [bool]$KeepRdpAccess
      EnableAppLocker = [bool]$EnableAppLocker
      EnableBitLocker = [bool]$EnableBitLocker
    }
    changes = $script:RunChanges
  }
  $json = ($obj | ConvertTo-Json -Depth 6)
  $enc = New-Object System.Text.UTF8Encoding($false)
  if (-not $WhatIf) {
    [System.IO.File]::WriteAllText($RunJsonPath, $json + "`n", $enc)
    [System.IO.File]::WriteAllText($RunJsonLatestPath, $json + "`n", $enc)
  }
} catch {
  Write-Log "Failed to write hardening run JSON: $($_.Exception.Message)" "WARN"
}

