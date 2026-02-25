<#
Set-CuiLoginBannerAndWallpaper.ps1

Purpose (change-making):
- Configure a Windows Server 2025 VM with:
  - Interactive logon legal notice (pre-login warning banner)
  - Lock screen background image (policy)
  - Desktop wallpaper (current user + Default User profile)

Notes:
- This script CHANGES system configuration (registry + file copy).
- Designed for offline use on the VM (no external dependencies).
- Supports -DryRun for review under change control.

Banner registry keys (Interactive logon message):
- HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System
  - legalnoticecaption (REG_SZ)
  - legalnoticetext (REG_SZ)

Lock screen policy (if supported/enabled):
- HKLM\SOFTWARE\Policies\Microsoft\Windows\Personalization
  - LockScreenImage (REG_SZ)

Desktop wallpaper:
- Current user:
  - HKCU:\Control Panel\Desktop (Wallpaper, WallpaperStyle, TileWallpaper)
  - HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\System (Wallpaper, WallpaperStyle)
- Default User profile (applies to new profiles):
  - HKU\DefaultUser\Control Panel\Desktop (...)
  - HKU\DefaultUser\Software\Microsoft\Windows\CurrentVersion\Policies\System (...)
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  # NOTE: Keep default ASCII-safe for older PowerShell encoding behavior.
  [string]$BannerTitle = 'CUI SYSTEM - Authorized Use Only',

  [Parameter(Mandatory = $false)]
  [string]$BannerText = @'
You are accessing a U.S. Government contractor information system that may process or store Controlled Unclassified Information (CUI).

Use of this system is restricted to authorized users for authorized purposes. By accessing this system, you acknowledge and consent to:
- Monitoring, interception, recording, reading, copying, and auditing of all activity and data by authorized personnel.
- Administrative, civil, and/or criminal penalties for unauthorized access, misuse, or disclosure.
- Prohibition on exporting or transferring CUI except via approved, authorized mechanisms (e.g., Assured File Transfer / trusted download).

If you are not an authorized user, disconnect immediately.
'@,

  # Path to the background image to apply (PNG/JPG recommended).
  # If omitted, the script will look for: .\assets\cui-system-background.png
  [Parameter(Mandatory = $false)]
  [string]$ImagePath,

  # Where to store the image on the VM (stable path for policy references)
  [Parameter(Mandatory = $false)]
  [string]$TargetImagePath = 'C:\ProgramData\MacTech\Branding\cui-system-background.png',

  [Parameter(Mandatory = $false)]
  [switch]$SetLockScreen,

  [Parameter(Mandatory = $false)]
  [switch]$SetDesktopWallpaper,

  [Parameter(Mandatory = $false)]
  [switch]$CurrentUserOnly,

  [Parameter(Mandatory = $false)]
  [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Info([string]$Msg) { Write-Host "[INFO] $Msg" -ForegroundColor Cyan }
function Write-Warn([string]$Msg) { Write-Host "[WARN] $Msg" -ForegroundColor Yellow }
function Write-Err([string]$Msg) { Write-Host "[ERR ] $Msg" -ForegroundColor Red }

function Ensure-Dir([string]$Path) {
  if ($DryRun) { Write-Info "Would ensure directory: $Path"; return }
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Set-RegValue(
  [string]$Path,
  [string]$Name,
  [object]$Value,
  [Microsoft.Win32.RegistryValueKind]$Type = [Microsoft.Win32.RegistryValueKind]::String
) {
  if ($DryRun) { Write-Info "Would set registry: $Path [$Name] = $Value"; return }
  if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }

  # PowerShell registry provider uses New-ItemProperty for type-safe writes.
  # Keep this minimal: we only need REG_SZ for current use cases.
  $propertyType = switch ($Type) {
    ([Microsoft.Win32.RegistryValueKind]::DWord) { 'DWord' }
    ([Microsoft.Win32.RegistryValueKind]::QWord) { 'QWord' }
    ([Microsoft.Win32.RegistryValueKind]::MultiString) { 'MultiString' }
    ([Microsoft.Win32.RegistryValueKind]::ExpandString) { 'ExpandString' }
    default { 'String' }
  }

  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $propertyType -Force | Out-Null
}

function Load-DefaultUserHive {
  $hivePath = 'C:\Users\Default\NTUSER.DAT'
  if (-not (Test-Path $hivePath)) { throw "Default user hive not found at $hivePath" }
  if ($DryRun) { Write-Info "Would load Default User hive from $hivePath"; return $true }
  $out = & reg.exe load HKU\DefaultUser $hivePath 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Warn ("Default User hive load failed (reg.exe exit {0}): {1}" -f $LASTEXITCODE, ($out | Out-String).Trim())
    return $false
  }
  return $true
}

function Unload-DefaultUserHive {
  if ($DryRun) { Write-Info "Would unload Default User hive"; return }
  $out = & reg.exe unload HKU\DefaultUser 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Warn ("Default User hive unload failed (reg.exe exit {0}): {1}" -f $LASTEXITCODE, ($out | Out-String).Trim())
  }
}

if (-not (Test-IsAdmin)) {
  throw "This script must be run as Administrator."
}

if (-not $PSBoundParameters.ContainsKey('SetLockScreen') -and -not $PSBoundParameters.ContainsKey('SetDesktopWallpaper')) {
  # Default behavior: do both
  $SetLockScreen = $true
  $SetDesktopWallpaper = $true
}

if (-not $ImagePath) {
  # Prefer the repo path the operator updates most often, with a legacy fallback.
  $p1 = Join-Path $PSScriptRoot 'cui-system-background.png'
  $p2 = Join-Path $PSScriptRoot 'assets\cui-system-background.png'
  if (Test-Path $p1) { $ImagePath = $p1 } else { $ImagePath = $p2 }
}

Write-Info "DryRun: $DryRun"
Write-Info "BannerTitle: $BannerTitle"
Write-Info "ImagePath: $ImagePath"
Write-Info "TargetImagePath: $TargetImagePath"
Write-Info "SetLockScreen: $SetLockScreen"
Write-Info "SetDesktopWallpaper: $SetDesktopWallpaper"
Write-Info "CurrentUserOnly: $CurrentUserOnly"

## 1) Configure logon banner (Interactive logon legal notice)
$sysPol = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$BannerTitleNormalized = ($BannerTitle -replace "`r?`n"," ") -replace "\\s+"," "
$BannerTextNormalized = ($BannerText -replace "`r?`n","`r`n")
Set-RegValue -Path $sysPol -Name 'legalnoticecaption' -Value $BannerTitleNormalized
Set-RegValue -Path $sysPol -Name 'legalnoticetext' -Value $BannerTextNormalized
Write-Info "Configured interactive logon banner (legal notice)."

## 2) Copy branding image (if present)
$imageOk = $false
if (Test-Path $ImagePath) {
  $dstDir = Split-Path -Parent $TargetImagePath
  Ensure-Dir $dstDir
  if ($DryRun) {
    Write-Info "Would copy image to $TargetImagePath"
  } else {
    try {
      Copy-Item -Path $ImagePath -Destination $TargetImagePath -Force
    } catch [System.IO.IOException] {
      # If the image is currently in use (e.g., by lock screen / wallpaper), overwriting can fail.
      # Fall back to a versioned filename and point policy at the new file.
      $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
      $alt = Join-Path $dstDir ("cui-system-background-{0}.png" -f $ts)
      Write-Warn ("Image overwrite failed (in use). Writing new file instead: {0}" -f $alt)
      Copy-Item -Path $ImagePath -Destination $alt -Force
      $TargetImagePath = $alt
    }
  }
  $imageOk = $true
} else {
  Write-Warn "Image not found at $ImagePath. Banner will be set, but background changes will be skipped."
  Write-Warn "Place the image at: $ImagePath (or pass -ImagePath)."
}

## 3) Set lock screen background (policy)
if ($SetLockScreen -and $imageOk) {
  $lockKey = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization'
  Set-RegValue -Path $lockKey -Name 'LockScreenImage' -Value $TargetImagePath
  Write-Info "Configured lock screen image policy."
}

## 4) Set desktop wallpaper (current user + Default User)
if ($SetDesktopWallpaper -and $imageOk) {
  # WallpaperStyle: 10 = Fill, 6 = Fit, 2 = Stretch, 0 = Center, 1 = Tile
  $wallStyle = '10'
  $tile = '0'

  Write-Info "Configuring current user wallpaper..."
  Set-RegValue -Path 'HKCU:\Control Panel\Desktop' -Name 'Wallpaper' -Value $TargetImagePath
  Set-RegValue -Path 'HKCU:\Control Panel\Desktop' -Name 'WallpaperStyle' -Value $wallStyle
  Set-RegValue -Path 'HKCU:\Control Panel\Desktop' -Name 'TileWallpaper' -Value $tile

  # Policy-based wallpaper (helps enforce)
  Set-RegValue -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'Wallpaper' -Value $TargetImagePath
  Set-RegValue -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'WallpaperStyle' -Value $wallStyle

  if (-not $CurrentUserOnly) {
    Write-Info "Configuring Default User wallpaper (for new profiles)..."
    $loaded = $false
    try {
      $loaded = Load-DefaultUserHive
      if ($loaded) {
        Set-RegValue -Path 'Registry::HKEY_USERS\DefaultUser\Control Panel\Desktop' -Name 'Wallpaper' -Value $TargetImagePath
        Set-RegValue -Path 'Registry::HKEY_USERS\DefaultUser\Control Panel\Desktop' -Name 'WallpaperStyle' -Value $wallStyle
        Set-RegValue -Path 'Registry::HKEY_USERS\DefaultUser\Control Panel\Desktop' -Name 'TileWallpaper' -Value $tile
        Set-RegValue -Path 'Registry::HKEY_USERS\DefaultUser\Software\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'Wallpaper' -Value $TargetImagePath
        Set-RegValue -Path 'Registry::HKEY_USERS\DefaultUser\Software\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'WallpaperStyle' -Value $wallStyle
      } else {
        Write-Warn "Skipping Default User wallpaper because the hive could not be loaded."
      }
    } finally {
      if ($loaded) { Unload-DefaultUserHive }
    }
  }

  # Refresh wallpaper (best-effort)
  if ($DryRun) {
    Write-Info "Would refresh user wallpaper (UpdatePerUserSystemParameters)"
  } else {
    try { & rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True | Out-Null } catch {}
  }
}

Write-Info "Done."

