
<# 
Collect-CUI-Evidence.ps1
Generates assessor-friendly evidence bundle
Server-safe, no optional module dependencies
#>

$Out = "C:\Evidence"
New-Item -ItemType Directory -Path $Out -Force | Out-Null
$ts = Get-Date -Format yyyyMMdd-HHmmss
$bundle = "$Out\CUI-Evidence-$ts"

New-Item -ItemType Directory -Path $bundle | Out-Null

function Dump($name,$cmd) {
  try {
    & $cmd | Out-File "$bundle\$name.txt"
  } catch {
    "ERROR: $($_.Exception.Message)" | Out-File "$bundle\$name.txt"
  }
}

Dump "systeminfo" { systeminfo }
Dump "firewall" { netsh advfirewall show allprofiles }
Dump "fips" { reg query HKLM\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy }
Dump "lsa" { reg query HKLM\System\CurrentControlSet\Control\Lsa }
Dump "rdp" { reg query "HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services" }

# Local users fallback-safe
try {
  Get-CimInstance Win32_UserAccount | Select Name,Disabled,Lockout |
    Out-File "$bundle\local-accounts.txt"
} catch {
  net user | Out-File "$bundle\local-accounts.txt"
}

Compress-Archive -Path "$bundle\*" -DestinationPath "$bundle.zip" -Force
"$bundle.zip created"
