#Requires -Version 5.1
<#
.SYNOPSIS
  Enables RDP Network Level Authentication (NLA) for CMMC AC.L2-3.1.3.
.DESCRIPTION
  Sets UserAuthentication = 1 (DWord) in the RDP-Tcp registry locations so that
  remote connections require NLA. Use this for a one-off fix when full hardening
  is not desired, or to re-apply NLA after a GPO or other change.
  Run with elevated privileges (Administrator).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\hardening\Set-RdpNla.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$rdpTcpPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp"
$rdpPolicyPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Server\WinStations\RDP-Tcp"

function Set-NlaValue {
  param([string]$Path, [string]$Name = "UserAuthentication")
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    Write-Warning "Path not found: $Path"
    return $false
  }
  try {
    New-ItemProperty -LiteralPath $Path -Name $Name -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Host "Set $Path\$Name = 1 (DWord)"
    return $true
  } catch {
    Write-Warning "Failed to set $Path\$Name : $_"
    return $false
  }
}

# Runtime RDP-Tcp (validator reads this)
$ok1 = Set-NlaValue -Path $rdpTcpPath

# Policy key (reinforces and can prevent override)
if (-not (Test-Path -LiteralPath $rdpPolicyPath -PathType Container)) {
  try { New-Item -Path $rdpPolicyPath -Force | Out-Null } catch { }
}
$ok2 = Set-NlaValue -Path $rdpPolicyPath

if ($ok1) {
  Write-Host "RDP NLA (UserAuthentication) has been enabled. Reconnect or restart TermService for full effect."
  exit 0
} else {
  Write-Error "Could not set NLA at $rdpTcpPath. Run as Administrator."
  exit 1
}
