param(
  [string]$App,
  [switch]$NoFuse,
  [switch]$NoResign,
  [switch]$NoWatcher,
  [switch]$NoDefaultTweaks,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Host "Install codex-plusplus for the Codex desktop app."
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  irm https://raw.githubusercontent.com/b-nnett/codex-plusplus/main/install.ps1 | iex"
  Write-Host "  .\install.ps1 -App `"C:\Path\To\Codex`""
  Write-Host ""
  Write-Host "Options:"
  Write-Host "  -App <path>          Path to Codex app/install directory"
  Write-Host "  -NoFuse             Skip Electron fuse flip"
  Write-Host "  -NoResign           Skip macOS resign step when run cross-platform"
  Write-Host "  -NoWatcher          Skip auto-repair watcher"
  Write-Host "  -NoDefaultTweaks    Skip default tweak installation"
  exit 0
}

function Require-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $InstallHint"
  }
}

Require-Command "node" "Install Node.js 20 or newer from https://nodejs.org/."
Require-Command "npm" "Install npm with Node.js 20 or newer."
Require-Command "git" "Install Git for Windows from https://git-scm.com/download/win."

$nodeVersion = (& node -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 20) {
  throw "Node.js 20 or newer is required. Found $nodeVersion."
}

$SourceRoot = Join-Path $env:APPDATA "codex-plusplus\source"
if (-not (Test-Path $SourceRoot)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $SourceRoot) | Out-Null
  git clone https://github.com/b-nnett/codex-plusplus.git $SourceRoot
} else {
  git -C $SourceRoot pull --ff-only
}

Push-Location $SourceRoot
try {
  npm ci
  npm run build

  $argsList = @("install")
  if ($App) { $argsList += @("--app", $App) }
  if ($NoFuse) { $argsList += "--no-fuse" }
  if ($NoResign) { $argsList += "--no-resign" }
  if ($NoWatcher) { $argsList += "--no-watcher" }
  if ($NoDefaultTweaks) { $argsList += "--no-default-tweaks" }

  node .\packages\installer\dist\cli.js @argsList
} finally {
  Pop-Location
}
