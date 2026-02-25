
<# 
Invoke-CuiHardening.ps1
Idempotent CMMC L2 in-VM hardening for Windows Server
Safe to re-run. Logs all actions.
#>

param(
  [bool]$DisableWinRM = $true,
  [bool]$DisableRdp  = $false
)

$Log = "C:\Hardening\hardening.log"
New-Item -ItemType Directory -Path C:\Hardening -Force | Out-Null

function Write-Log {
  param($Msg,$Level="INFO")
  $line = "[{0:u}][{1}] {2}" -f (Get-Date),$Level,$Msg
  Add-Content -Path $Log -Value $line
  Write-Host $line
}

function Set-Reg {
  param($Path,$Name,$Value)
  $cur = (Get-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue).$Name
  if ($cur -ne $Value) {
    New-Item -Path $Path -Force | Out-Null
    Set-ItemProperty -Path $Path -Name $Name -Value $Value -Force
    Write-Log "Registry set $Path\\$Name=$Value (was $cur)" "CHANGE"
  } else {
    Write-Log "Registry already $Path\\$Name=$Value"
  }
}

Write-Log "START CUI HARDENING"

# FIPS
Set-Reg "HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy" "Enabled" 1

# SMB signing / legacy
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" "RequireSecuritySignature" 1
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" "RequireSecuritySignature" 1

# TLS baseline
$sch = "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols"
foreach ($p in @("TLS 1.0","TLS 1.1")) {
  Set-Reg "$sch\$p\Client" "Enabled" 0
  Set-Reg "$sch\$p\Server" "Enabled" 0
}
Set-Reg "$sch\TLS 1.2\Client" "Enabled" 1
Set-Reg "$sch\TLS 1.2\Server" "Enabled" 1

# LSA protection
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" "RunAsPPL" 1

# UAC
Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "ConsentPromptBehaviorAdmin" 2
Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" "PromptOnSecureDesktop" 1

# LLMNR off
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient" "EnableMulticast" 0

# Firewall baseline
netsh advfirewall set allprofiles state on | Out-Null

# WinRM
if ($DisableWinRM) {
  Stop-Service WinRM -ErrorAction SilentlyContinue
  Set-Service WinRM -StartupType Disabled
  Write-Log "WinRM disabled" "CHANGE"
}

# RDP hardening
Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp" "UserAuthentication" 1
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" "fDisableClip" 1
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" "fDisableCdm" 1

if ($DisableRdp) {
  Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server" "fDenyTSConnections" 1
  Write-Log "RDP disabled" "CHANGE"
}

# Defender ASR (idempotent)
try {
  $ids = @(
    "56a863a9-875e-4185-98a7-b882c64b5ce5",
    "9e6b0f98-0d76-40b0-a98e-95b9d1d9ef0d"
  )
  $actions = @("Enabled","Enabled")
  Set-MpPreference -AttackSurfaceReductionRules_Ids $ids -AttackSurfaceReductionRules_Actions $actions
  Write-Log "ASR rules ensured" "CHANGE"
} catch {
  Write-Log "ASR skipped: $($_.Exception.Message)" "WARN"
}

Write-Log "HARDENING COMPLETE"
