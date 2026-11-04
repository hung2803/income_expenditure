$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI not found. Install and open Docker Desktop before starting Pinggy.'
  }
  if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw 'OpenSSH client not found. Enable the Windows OpenSSH Client optional feature.'
  }

  & docker info --format '{{.OSType}}'
  if ($LASTEXITCODE -ne 0) {
    throw 'Cannot access Docker Engine. Open Docker Desktop, then run this script again.'
  }

  & docker compose up -d --build --force-recreate --wait --wait-timeout 180 frontend backend
  if ($LASTEXITCODE -ne 0) {
    & docker compose ps -a
    & docker compose logs --no-color --tail 80 frontend backend
    throw 'App startup failed. Review the container logs above.'
  }

  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/health' -TimeoutSec 15
  if ($health.status -ne 'ok' -or $health.environment -ne 'dev') {
    throw 'The local development API is not healthy. Pinggy was not started.'
  }

  Write-Host ''
  Write-Host 'Opening a Pinggy HTTPS tunnel to the local app.'
  Write-Host 'Keep this window open. Press Ctrl+C to stop the tunnel.'
  Write-Host 'First use may ask to confirm the Pinggy SSH host key; verify it before accepting.'
  Write-Host ''
  & ssh -T -p 443 -R '0:127.0.0.1:5173' 'qr@free.pinggy.io'
  if ($LASTEXITCODE -ne 0) {
    throw 'Pinggy tunnel stopped with an error. Check your internet connection and SSH output above.'
  }
}
finally {
  Pop-Location
}
