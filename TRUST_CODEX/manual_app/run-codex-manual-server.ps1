Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Log = 'C:\evidence\codex-manual-server.task.log'

try { New-Item -ItemType Directory -Force -Path 'C:\evidence' | Out-Null } catch {}

Set-Location 'C:\Codex\TRUST_CODEX\manual_app'
('starting ' + (Get-Date).ToString('o')) | Out-File -FilePath $Log -Append -Encoding utf8

# Clean restart: stop any prior server instance that may be stuck.
# start-server.ps1 writes its PID to C:\evidence\codex-manual-server.pid.
try {
  $pidFile = 'C:\evidence\codex-manual-server.pid'
  if (Test-Path -LiteralPath $pidFile) {
    $prev = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $n = 0
    if ([int]::TryParse([string]$prev, [ref]$n) -and $n -gt 0) {
      ("stopping prior server pid=" + $n) | Out-File -FilePath $Log -Append -Encoding utf8
      Stop-Process -Id $n -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
    }
  }
} catch {}

# Run in-process so the task stays "Running" and survives SSH session end.
# Output is appended to $Log for troubleshooting.
& powershell -NoProfile -ExecutionPolicy Bypass -File 'C:\Codex\TRUST_CODEX\manual_app\start-server.ps1' -Bind '127.0.0.1' -Port 8787 *>> $Log

