param(
  [ValidateSet('start', 'stop', 'status', 'logs')][string]$Action = 'start',
  [ValidateSet('all', 'web', 'api')][string]$Service = 'all',
  [ValidateSet('Auto', 'Docker', 'Native')][string]$ApiMode = 'Auto'
)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectDirectory '.preview/local'
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
$operationLock = $null
if ($Action -in @('start', 'stop')) {
  try { $operationLock = [IO.File]::Open((Join-Path $runtimeDirectory 'launcher.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
  catch { throw 'Another local start/stop is in progress. Wait for it to finish; no duplicate process was started.' }
}
$statePath = Join-Path $runtimeDirectory 'state.json'
$state = @{}
if (Test-Path -LiteralPath $statePath) {
  $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  foreach ($property in $saved.psobject.Properties) { $state[$property.Name] = $property.Value }
}
function Save-State { $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8 }
function Test-Owned($entry) {
  if (!$entry -or !$entry.processId) { return $false }
  $running = Get-Process -Id $entry.processId -ErrorAction SilentlyContinue
  return $running -and $running.StartTime.ToUniversalTime().ToString('o') -eq $entry.startedAt
}
function Stop-Owned($entry) {
  if (Test-Owned $entry) { & taskkill /PID $entry.processId /T /F | Out-Null }
}
function Start-Hidden([string]$Name, [string]$Executable, [string]$Arguments, [string]$Directory) {
  $stdout = Join-Path $runtimeDirectory "$Name.stdout.log"
  $stderr = Join-Path $runtimeDirectory "$Name.stderr.log"
  $started = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  return @{ processId = $started.Id; startedAt = $started.StartTime.ToUniversalTime().ToString('o'); stdout = $stdout; stderr = $stderr }
}
function Get-Listener([int]$Port) {
  # Get-NetTCPConnection starts the Windows networking provider (~seconds).
  # The native TCP table checks conflicts without that startup cost.
  return [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq $Port | Select-Object -First 1
}
function Wait-Ready([string]$Url, [bool]$Web = $false) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  while ($watch.Elapsed.TotalSeconds -lt 45) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($Web) {
        if ($response.Content.Contains('/@vite/client')) { return $watch.ElapsedMilliseconds }
      } else {
        $health = $response.Content | ConvertFrom-Json
        if ($health.service -eq 'thu-chi-api' -and $health.environment -eq 'dev' -and $health.checks.database -eq 'ok') { return $watch.ElapsedMilliseconds }
      }
    } catch { }
    Start-Sleep -Milliseconds 200
  }
  throw "Not ready: $Url. Run npm.cmd run dev:logs. Existing database is unchanged; migrations/bootstrap are explicit setup steps only."
}
function Invoke-Compose([string[]]$ComposeArguments) {
  & docker compose -f compose.yaml -f compose.local.yaml @ComposeArguments
  if ($LASTEXITCODE -ne 0) { throw 'Docker backend command failed. Open Docker Desktop; no native database fallback was started.' }
}
Push-Location -LiteralPath $projectDirectory
try {
  if ($Action -eq 'logs') {
    foreach ($name in @('api', 'web')) {
      if ($Service -ne 'all' -and $Service -ne $name) { continue }
      foreach ($suffix in @('stdout', 'stderr')) {
        $path = Join-Path $runtimeDirectory "$name.$suffix.log"
        if (Test-Path -LiteralPath $path) { Write-Host "`n$path"; Get-Content -LiteralPath $path -Tail 50 }
      }
    }
    return
  }
  if ($Action -eq 'status') {
    foreach ($port in @(5173, 8787)) {
      $listener = Get-Listener $port
      Write-Host "Port $port : $(if ($listener) { 'listening' } else { 'stopped' })"
    }
    if ($state.apiMode) { Write-Host "API database mode: $($state.apiMode)" }
    Write-Host "State/logs: $runtimeDirectory"
    return
  }
  if ($Action -eq 'stop') {
    if ($Service -in @('all', 'web')) { Stop-Owned $state.web; $state.Remove('web'); Save-State }
    if ($Service -in @('all', 'api')) {
      Stop-Owned $state.api
      if ($state.apiMode -eq 'Docker' -and $state.ownsDocker) { Invoke-Compose -ComposeArguments @('stop', 'backend') }
      $state.Remove('api'); $state.Remove('ownsDocker'); Save-State
    }
    Write-Host 'Stopped only managed processes/services. Database files and volumes are kept.'
    return
  }
  $total = [Diagnostics.Stopwatch]::StartNew()
  if ($Service -in @('all', 'api')) {
    $mode = $ApiMode
    if ($mode -eq 'Auto' -and $state.apiMode -eq 'Docker') { $mode = 'Docker' }
    if ($mode -eq 'Auto' -and $state.apiMode -and (Test-Owned $state.api)) { $mode = $state.apiMode }
    if ($mode -eq 'Auto') {
      if (Get-Command docker -ErrorAction SilentlyContinue) {
        $container = & docker compose ps -a -q backend
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker. Open Docker Desktop, or explicitly select -ApiMode Native for the separate Windows database.' }
        $volume = & docker volume ls --filter name=thu-chi_d1-data --format '{{.Name}}'
        $mode = if ($container -or $volume) { 'Docker' } else { 'Native' }
      } else { $mode = 'Native' }
    }
    $listener = Get-Listener 8787
    if ($mode -eq 'Docker') {
      if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'This launcher uses the existing Docker database. Docker CLI is unavailable; no native database fallback was started.' }
      if ($listener) {
        $runningBackend = & docker compose ps -q backend
        if (!$runningBackend) { throw 'Port 8787 belongs to another process. Stop it explicitly before starting Docker.' }
      }
      # Reuses the image and named volume. No production build, seed or migration.
      Invoke-Compose -ComposeArguments @('up', '-d', '--no-build', 'backend')
      if (!(Test-Owned $state.api)) {
        $state.api = Start-Hidden 'api' 'docker.exe' 'compose -f compose.yaml -f compose.local.yaml logs --follow --no-color --tail 80 backend' $projectDirectory
      }
      $state.ownsDocker = $true
    } else {
      if ($state.apiMode -eq 'Docker' -and $listener) { throw 'Docker is using 8787. Stop it explicitly before selecting the separate native database.' }
      if ($listener -and !(Test-Owned $state.api)) { throw 'Port 8787 belongs to an unmanaged process; it was not stopped.' }
      if (!(Test-Owned $state.api)) {
        $nodePath = (Get-Command node.exe).Source
        $scriptPath = Join-Path $projectDirectory 'apps/backend/scripts/local.mjs'
        $state.api = Start-Hidden 'api' $nodePath "`"$scriptPath`" serve dev" (Join-Path $projectDirectory 'apps/backend')
      }
    }
    $state.apiMode = $mode; Save-State
    $apiReady = Wait-Ready 'http://127.0.0.1:8787/api/health'
    Write-Host "API ready ($mode D1, wait ${apiReady}ms): http://127.0.0.1:8787"
  }
  if ($Service -in @('all', 'web')) {
    $listener = Get-Listener 5173
    if ($listener -and !(Test-Owned $state.web)) { throw 'Port 5173 is occupied by an unmanaged process/container. Stop it explicitly; the launcher will not kill it.' }
    if (!(Test-Owned $state.web)) {
      # Scope this variable to the child, even if the shell has a cloud API URL.
      $oldTarget = $env:API_PROXY_TARGET; $oldPublicApi = $env:VITE_API_BASE_URL
      try {
        $env:API_PROXY_TARGET = 'http://127.0.0.1:8787'; $env:VITE_API_BASE_URL = ''
        $vitePath = Join-Path $projectDirectory 'node_modules/vite/bin/vite.js'
        $state.web = Start-Hidden 'web' (Get-Command node.exe).Source "`"$vitePath`" --host 0.0.0.0 --configLoader runner --mode localdev" (Join-Path $projectDirectory 'apps/frontend')
      } finally { $env:API_PROXY_TARGET = $oldTarget; $env:VITE_API_BASE_URL = $oldPublicApi }
      Save-State
    }
    $webReady = Wait-Ready 'http://127.0.0.1:5173/login' $true
    $proxyReady = Wait-Ready 'http://127.0.0.1:5173/api/health'
    Write-Host "Vite ready (wait ${webReady}ms), proxy ok (${proxyReady}ms): http://127.0.0.1:5173"
  }
  $total.Stop()
  Write-Host "Startup/reuse total: $($total.ElapsedMilliseconds)ms. Logs: $runtimeDirectory"
} finally { if ($operationLock) { $operationLock.Dispose() }; Pop-Location }
