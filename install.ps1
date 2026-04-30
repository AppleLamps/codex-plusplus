param(
  [string]$App,
  [switch]$Check,
  [switch]$Repair,
  [switch]$Uninstall,
  [switch]$Status,
  [switch]$Doctor,
  [switch]$SupportBundle,
  [switch]$OpenTweaks,
  [switch]$OpenLogs,
  [switch]$NoFuse,
  [switch]$NoResign,
  [switch]$NoWatcher,
  [switch]$NoDefaultTweaks,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/AppleLamps/codex-plusplus.git"
$ZipUrl = "https://github.com/AppleLamps/codex-plusplus/archive/refs/heads/main.zip"

function Show-Help {
  Write-Host "Install and manage codex-plusplus for the open-source Codex app on Windows."
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  irm https://raw.githubusercontent.com/AppleLamps/codex-plusplus/main/install.ps1 | iex"
  Write-Host "  .\install.ps1 -Check"
  Write-Host "  .\install.ps1 -Repair"
  Write-Host "  .\install.ps1 -Uninstall"
  Write-Host "  .\install.ps1 -Status"
  Write-Host "  .\install.ps1 -Doctor"
  Write-Host "  .\install.ps1 -SupportBundle"
  Write-Host ""
  Write-Host "Options:"
  Write-Host "  -App <path>          Path to Codex app/install directory"
  Write-Host "  -Check               Check dependencies and likely Codex paths without patching"
  Write-Host "  -Repair              Re-apply the patch after Codex updates"
  Write-Host "  -Uninstall           Restore Codex from the Codex++ backup"
  Write-Host "  -Status              Run codex-plusplus status"
  Write-Host "  -Doctor              Run codex-plusplus doctor"
  Write-Host "  -SupportBundle       Create a redacted support bundle"
  Write-Host "  -OpenTweaks          Open the Codex++ tweaks directory"
  Write-Host "  -OpenLogs            Open the Codex++ log directory"
  Write-Host "  -NoFuse              Skip Electron fuse flip"
  Write-Host "  -NoResign            Skip macOS resign step when run cross-platform"
  Write-Host "  -NoWatcher           Skip auto-repair watcher"
  Write-Host "  -NoDefaultTweaks     Skip default tweak installation"
}

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Require-Command($Name, $InstallHint) {
  if (-not (Test-Command $Name)) {
    throw "$Name is required. $InstallHint"
  }
}

function Get-UserRoot {
  $base = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME "AppData\Roaming" }
  return Join-Path $base "codex-plusplus"
}

function Get-SourceRoot {
  return Join-Path (Get-UserRoot) "source"
}

function Get-CliPath {
  return Join-Path (Get-SourceRoot) "packages\installer\dist\cli.js"
}

function Invoke-Checked($File, [string[]]$ArgsList) {
  & $File @ArgsList
  if ($LASTEXITCODE -ne 0) {
    throw "$File exited with code $LASTEXITCODE"
  }
}

function Assert-Node {
  Require-Command "node" "Install Node.js 20 or newer from https://nodejs.org/."
  Require-Command "npm" "Install npm with Node.js 20 or newer."
  $nodeVersion = (& node -p "process.versions.node").Trim()
  $nodeMajor = [int]($nodeVersion.Split(".")[0])
  if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Found $nodeVersion."
  }
}

function Install-SourceFromZip($SourceRoot) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-plusplus-" + [guid]::NewGuid())
  $zip = "$tmp.zip"
  try {
    Invoke-WebRequest -Uri $ZipUrl -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
    $expanded = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
    if (-not $expanded) { throw "Downloaded archive did not contain a source directory." }
    New-Item -ItemType Directory -Force -Path (Split-Path $SourceRoot) | Out-Null
    if (Test-Path $SourceRoot) { Remove-Item -LiteralPath $SourceRoot -Recurse -Force }
    Move-Item -LiteralPath $expanded.FullName -Destination $SourceRoot
  } finally {
    if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
    if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
  }
}

function Ensure-Source {
  Assert-Node
  $SourceRoot = Get-SourceRoot
  if (Test-Path $SourceRoot) {
    if ((Test-Path (Join-Path $SourceRoot ".git")) -and (Test-Command "git")) {
      Invoke-Checked "git" @("-C", $SourceRoot, "pull", "--ff-only")
    } elseif (-not (Test-Path (Join-Path $SourceRoot "package.json"))) {
      Install-SourceFromZip $SourceRoot
    }
  } else {
    New-Item -ItemType Directory -Force -Path (Split-Path $SourceRoot) | Out-Null
    if (Test-Command "git") {
      Invoke-Checked "git" @("clone", $RepoUrl, $SourceRoot)
    } else {
      Write-Host "Git was not found; downloading source archive instead."
      Install-SourceFromZip $SourceRoot
    }
  }

  Push-Location $SourceRoot
  try {
    Invoke-Checked "npm" @("ci")
    Invoke-Checked "npm" @("run", "build")
  } finally {
    Pop-Location
  }
  return $SourceRoot
}

function Invoke-CodexPlusPlus([string[]]$CliArgs) {
  $SourceRoot = Ensure-Source
  $CliPath = Get-CliPath
  if (-not (Test-Path $CliPath)) {
    throw "Built CLI was not found at $CliPath."
  }
  Write-Host "Codex++ source: $SourceRoot"
  Write-Host "Codex++ CLI:    $CliPath"
  $nodeArgs = @($CliPath) + $CliArgs
  Invoke-Checked "node" $nodeArgs
}

function Show-Check {
  Write-Host "codex-plusplus Windows check"
  Write-Host ("  node: " + ($(if (Test-Command "node") { (& node -v).Trim() } else { "missing" })))
  Write-Host ("  npm:  " + ($(if (Test-Command "npm") { (& npm -v).Trim() } else { "missing" })))
  Write-Host ("  git:  " + ($(if (Test-Command "git") { (& git --version).Trim() } else { "missing; zip fallback available" })))
  Write-Host ("  user: " + (Get-UserRoot))
  Write-Host ("  src:  " + (Get-SourceRoot))
  $candidate = Find-CodexCandidate
  Write-Host ("  app:  " + ($(if ($App) { $App } elseif ($candidate) { $candidate } else { "not detected; pass -App `"C:\Path\To\Codex`"" })))
}

function Find-CodexCandidate {
  if ($App) { return $App }
  if (-not $env:LOCALAPPDATA) { return $null }
  $root = Join-Path $env:LOCALAPPDATA "codex"
  if (-not (Test-Path $root)) { return $null }
  $apps = Get-ChildItem -LiteralPath $root -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "resources\app.asar") } |
    Sort-Object {
      $raw = ($_.Name -replace "^app-", "") -replace "-.*$", ""
      $parsed = $null
      if ([version]::TryParse($raw, [ref]$parsed)) { $parsed } else { [version]"0.0.0" }
    }
  if ($apps) { return $apps[-1].FullName }
  return $null
}

function Open-UserPath($Child) {
  $path = Join-Path (Get-UserRoot) $Child
  New-Item -ItemType Directory -Force -Path $path | Out-Null
  Invoke-Item -LiteralPath $path
  Write-Host "Opened $path"
}

if ($Help) {
  Show-Help
  exit 0
}

if ($Check) {
  Show-Check
  exit 0
}

if ($OpenTweaks) {
  Open-UserPath "tweaks"
  exit 0
}

if ($OpenLogs) {
  Open-UserPath "log"
  exit 0
}

$argsList = @()
if ($Repair) {
  $commandName = "repair"
  $argsList += $commandName
} elseif ($Uninstall) {
  $commandName = "uninstall"
  $argsList += $commandName
} elseif ($Status) {
  $commandName = "status"
  $argsList += $commandName
} elseif ($Doctor) {
  $commandName = "doctor"
  $argsList += $commandName
} elseif ($SupportBundle) {
  $commandName = "support"
  $argsList += @("support", "bundle")
} else {
  $commandName = "install"
  $argsList += $commandName
}

if ($App -and ($commandName -eq "install" -or $commandName -eq "repair" -or $commandName -eq "uninstall")) {
  $argsList += @("--app", $App)
}
if ($commandName -eq "install") {
  if ($NoFuse) { $argsList += "--no-fuse" }
  if ($NoResign) { $argsList += "--no-resign" }
  if ($NoWatcher) { $argsList += "--no-watcher" }
  if ($NoDefaultTweaks) { $argsList += "--no-default-tweaks" }
}

Invoke-CodexPlusPlus $argsList
