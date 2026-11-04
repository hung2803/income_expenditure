param([switch]$IncludeBackend)

$ErrorActionPreference = 'Stop'

$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI not found. Install Docker Desktop and enable Linux containers.'
  }

  & docker info --format '{{.OSType}}'
  if ($LASTEXITCODE -ne 0) {
    throw 'Cannot access Docker Engine. Open Docker Desktop and run this script from your own PowerShell terminal.'
  }

  if ($IncludeBackend) {
    & docker compose build
  }
  else {
    & docker compose build frontend
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'Image build failed. The old container may still be serving the old UI. Copy the build error above; do not ignore it.'
  }

  if ($IncludeBackend) {
    & docker compose up -d --force-recreate --wait --wait-timeout 180
  }
  else {
    & docker compose up -d --force-recreate --wait --wait-timeout 180 frontend
  }
  if ($LASTEXITCODE -ne 0) {
    & docker compose logs --tail 80
    throw 'Startup failed. Run: docker compose logs --tail 100'
  }

  $page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/' -TimeoutSec 15
  if ($page.StatusCode -ne 200 -or $page.Content -notmatch 'id="root"' -or $page.Content -notmatch '/assets/' -or $page.Content -match '/@vite/client') {
    throw 'The URL is not serving the built frontend. Check the current Compose project and container logs.'
  }
  if ($IncludeBackend) {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/health' -TimeoutSec 15
    if ($health.status -ne 'ok') {
      throw 'Frontend API proxy health check failed.'
    }
  }

  Write-Host ''
  Write-Host 'App is running. Connect your phone to the same router/network as this PC.'
  Write-Host 'First verify on this PC: http://localhost:5173'
  Write-Host 'Open one of these LAN addresses in Safari (not localhost):'
  foreach ($adapter in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($adapter.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
    $properties = $adapter.GetIPProperties()
    if ($properties.GatewayAddresses.Count -eq 0) { continue }
    foreach ($address in $properties.UnicastAddresses) {
      if ($address.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
          -not [System.Net.IPAddress]::IsLoopback($address.Address)) {
        Write-Host ('  http://{0}:5173  ({1})' -f $address.Address, $adapter.Name)
      }
    }
  }
  Write-Host ''
  Write-Host 'LAN HTTP previews the UI. PWA offline/passkeys require trusted HTTPS.'
  Write-Host 'If the phone cannot connect, check the Private-network firewall rule in README.md.'
}
finally {
  Pop-Location
}
