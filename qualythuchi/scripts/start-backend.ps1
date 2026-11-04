$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI not found. Install and open Docker Desktop with Linux containers enabled.'
  }

  $containerOs = & docker info --format '{{.OSType}}'
  if ($LASTEXITCODE -ne 0) {
    throw 'Cannot access Docker Engine. Open Docker Desktop and run this script from your own PowerShell terminal.'
  }
  if ($containerOs -ne 'linux') {
    throw 'Switch Docker Desktop to Linux containers, then run this script again.'
  }

  & docker compose build backend
  if ($LASTEXITCODE -ne 0) {
    throw 'Backend image build failed. Check the build error above.'
  }

  & docker compose up -d --force-recreate --wait --wait-timeout 180 backend
  if ($LASTEXITCODE -ne 0) {
    & docker compose ps -a backend
    & docker compose logs --no-color --tail 100 backend
    throw 'Backend startup failed. Copy the container logs above to diagnose the cause.'
  }

  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 15
    if ($health.status -ne 'ok') {
      throw 'API returned an unexpected health response.'
    }
  }
  catch {
    & docker compose logs --no-color --tail 100 backend
    throw
  }

  Write-Host ''
  Write-Host 'Backend is ready: http://localhost:8787/api/health'
  Write-Host 'Create the first Admin (only when the database has no accounts):'
  Write-Host '  docker compose exec backend npm run auth:bootstrap -- --local dev'
}
finally {
  Pop-Location
}
