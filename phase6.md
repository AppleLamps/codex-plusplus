# Phase 6 Windows Reliability Review

## Goal

Make Codex++ feel first-class on Windows: install reliably, repair after Codex
updates, recover cleanly from locked files, produce useful diagnostics, and let
Windows users follow docs without translating from macOS/Linux assumptions.

This phase is intentionally Windows-focused. It does not add a native signed
installer, marketplace features, automatic tweak installation, or Windows/Linux
Electron integrity writers.

## Baseline

Phase 5 leaves the project in a much better support posture:

- `install.ps1` is the Windows bootstrap.
- CI runs `npm test`, `npm run build`, and PowerShell parse checks on
  `windows-latest`.
- Installer preflight probes the Windows `resources` directory instead of a
  macOS-only `Contents` path.
- Windows integrity skipping is explicit in `status` and `doctor`.
- The in-app Config page can create redacted support bundles and copy
  diagnostics JSON.

The remaining Windows risk is less about the renderer UI and more about the
installer lifecycle around Squirrel/Electron app updates, shell quoting, locked
files, and platform-specific support guidance.

## Implementation Status

Phase 6 is implemented as a Windows reliability pass. Codex++ now discovers
Squirrel `app-*` installs with structured candidate data, sorts versions
numerically, repairs the current active install by default, records Windows
install metadata in state, and reports stale recorded app roots in diagnostics.

Windows install, repair, and uninstall fail early when `Codex.exe` is running,
wrap Windows permission failures with close-and-retry guidance, verify patched
or restored asars after mutation, and use a generated Task Scheduler repair
wrapper instead of embedding a fragile `cmd` command. Folder reveals use
`explorer.exe` directly.

`install.ps1` is now the Windows front door for install plus support modes:
`-Check`, `-Repair`, `-Uninstall`, `-Status`, `-Doctor`, `-SupportBundle`,
`-OpenTweaks`, and `-OpenLogs`. It keeps the old install flags, validates
Node/npm, uses Git when available, and falls back to downloading the source zip
when Git is missing.

`status --json`, `doctor --json`, CLI support bundles, and runtime support
bundles now include redacted Windows diagnostics where available. CI runs the
full repository check on Windows and exercises the PowerShell bootstrap help
and check modes.

## Review Findings

### 1. Repair can target a stale Squirrel `app-<version>` directory

Files:

- `packages/installer/src/platform.ts`
- `packages/installer/src/commands/repair.ts`
- `packages/installer/src/commands/status.ts`
- `packages/installer/src/watcher.ts`

Evidence:

- Windows discovery records an install directory such as
  `%LOCALAPPDATA%\codex\app-<version>`.
- `repair()` calls `locateCodex(opts.app ?? state.appRoot)`.
- `locateWin()` prefers an override before scanning for the latest `app-*`
  directory.
- The scheduled task runs `repair --quiet` without an explicit app path, so it
  uses the stored state path.

Impact:

- After Codex updates, the recorded app directory can remain on disk while the
  real active install moves to a newer `app-<version>` directory.
- `repair` can report the old patched app is intact while the new Codex app is
  unpatched.

Recommendation:

- Add Windows install discovery helpers that return all candidate installs plus
  the selected active install.
- Parse Squirrel version directories semantically instead of lexicographically.
- Treat a stored Windows `app-<version>` path as a hint, not as the repair
  target, unless the user passed `--app` explicitly.
- Store enough state to identify the Squirrel root and active version at
  install time.
- Update `repair`, `status`, `doctor`, and watcher refresh to report stale
  state versus current active install.

### 2. Windows version sorting is lexicographic

Files:

- `packages/installer/src/platform.ts`

Evidence:

- `locateWin()` sorts `app-*` directory paths with `entries.sort()` and picks
  the last entry.

Impact:

- Versions such as `app-0.10.0` and `app-0.9.0` can be ordered incorrectly.
- The installer can patch the wrong app directory even on a fresh install.

Recommendation:

- Extract version parsing for Squirrel `app-*` names.
- Sort by numeric semver parts with a stable fallback for non-semver names.
- Add fixture coverage for `app-0.9.0`, `app-0.10.0`, prerelease-ish names, and
  malformed directories.

### 3. Shell boundaries need Windows metacharacter coverage

Files:

- `packages/installer/src/watcher.ts`
- `packages/installer/src/open-path.ts`
- `packages/installer/test/installer-helpers.test.ts`

Evidence:

- Scheduled tasks use `cmd /d /s /c "<node>" "<cli>" repair --quiet`.
- Path opening uses `cmd.exe /c start "" <target>`.
- Tests cover spaces, but not `&`, `^`, `%`, `!`, parentheses, quotes, or
  Unicode paths.

Impact:

- Paths under user-controlled directories can break watcher repair or folder
  reveal commands.
- The failure mode is confusing because it happens later through Task Scheduler
  or Explorer, not at install time.

Recommendation:

- Prefer `explorer.exe <path>` for opening folders on Windows instead of
  `cmd.exe /c start`.
- Replace the scheduled task `/TR` command construction with a safer wrapper
  strategy, such as a generated `.cmd`/`.ps1` file under the Codex++ user data
  directory with deterministic escaping.
- Add deterministic tests for spaces, ampersands, carets, percent signs,
  parentheses, quotes, and non-ASCII path segments.

### 4. Locked/running Codex is not handled as a first-class state

Files:

- `packages/installer/src/commands/install.ts`
- `packages/installer/src/commands/repair.ts`
- `packages/installer/src/commands/uninstall.ts`
- `packages/installer/src/asar.ts`
- `packages/installer/src/installer-core.ts`

Evidence:

- The installer patches and restores `app.asar` directly.
- Windows commonly denies writes while `Codex.exe` or a helper process has the
  app directory open.
- EPERM/EACCES messages are mostly macOS-oriented today.

Impact:

- A Windows user can hit a raw filesystem error or a partial repair path when
  Codex is running.
- Support guidance currently relies on the user inferring they should quit
  Codex before install, repair, or uninstall.

Recommendation:

- Add a Windows running-app detector for `Codex.exe` before install, repair,
  and uninstall.
- Fail early with an actionable "Quit Codex and retry" message unless a future
  explicit `--force` path is added.
- Improve Windows EPERM/EACCES wrapping around asar patch and backup restore.
- Add rollback/verification around Windows direct `copyFileSync()` replacement:
  verify the patched asar can be read and restore from staging/backup if it
  cannot.

### 5. PowerShell bootstrap is functional but still developer-shaped

Files:

- `install.ps1`
- `README.md`
- `docs/TROUBLESHOOTING.md`

Evidence:

- `install.ps1` requires Node, npm, and Git, then clones/pulls source into
  `%APPDATA%\codex-plusplus\source`, runs `npm ci`, builds, and invokes the
  built CLI.
- It only exposes install flags, not repair/status/uninstall/support helpers.
- It has no zip-download fallback when Git is missing.

Impact:

- Windows install friction remains high for non-developer users.
- The most common support commands still assume the user knows where the built
  CLI lives or has `codex-plusplus` on PATH.

Recommendation:

- Add first-class PowerShell modes for install, repair, uninstall, status,
  doctor, support bundle, and opening tweaks/logs.
- Add `-DryRun` or `-Check` for dependency and Codex detection without patching.
- Provide a Git-less download fallback using PowerShell's built-in web and zip
  tooling.
- Print the exact built CLI path and the detected Codex app path after install.

### 6. Windows diagnostics should include Windows-specific state

Files:

- `packages/installer/src/commands/status.ts`
- `packages/installer/src/commands/doctor.ts`
- `packages/installer/src/commands/support.ts`
- `packages/runtime/src/support-bundle.ts`

Evidence:

- Current diagnostics include install state, integrity support, paths, and logs.
- They do not include Task Scheduler query output, Squirrel candidate installs,
  running Codex process state, dependency versions, or path write-probe results.

Impact:

- Support bundles can show "not patched" but not why Windows repair failed.

Recommendation:

- Add a redacted Windows diagnostics section to `status --json`,
  `doctor --json`, and support bundles.
- Include selected Squirrel candidates, chosen active install, scheduled task
  presence, dependency versions, running Codex process status, and writable
  target probe result.
- Keep the existing redaction rules: no environment dumps, tweak source, app
  bundles, tokens, or arbitrary file contents.

### 7. Windows CI does not run the full repository check

Files:

- `.github/workflows/ci.yml`
- `package.json`

Evidence:

- Ubuntu CI runs `npm run check`.
- Windows CI runs `npm test`, `npm run build`, and PowerShell parse checks.
- The root `clean` script uses `rm -rf`, which is not portable if Windows
  contributors run it locally.

Impact:

- Release consistency and audit paths are not exercised on Windows.
- Cross-platform script drift can creep back in.

Recommendation:

- Run `npm run check` on Windows once the audit/release-check path is confirmed
  portable.
- Replace root `clean` with a small Node script or remove it if unused.
- Add Windows-focused fake-app mutation tests to CI for install, repair,
  uninstall, stale Squirrel state, locked files, and metacharacter paths.

## P1 Tasks

### 1. Fix Windows install discovery and repair target selection

- Add a Windows install discovery module that returns structured candidates.
- Parse and semver-sort Squirrel `app-*` directories.
- Prefer the active/latest Squirrel install during `repair`, `status`, and
  watcher execution unless `--app` was explicitly supplied.
- Detect and report stale `state.appRoot`.
- Update installer state with Windows install root and active app version.

### 2. Harden Windows app mutation

- Detect running `Codex.exe` before install, repair, and uninstall.
- Fail early with a Windows-specific close-app message.
- Wrap Windows EPERM/EACCES around asar patch and restore paths with actionable
  guidance.
- Verify the patched/restored asar after mutation and rollback when possible.
- Add fake Windows app fixtures for install, repair, uninstall, corrupt asar,
  stale state, and idempotent repair.

### 3. Replace fragile Windows shell command construction

- Use `explorer.exe` for folder reveals.
- Generate a scheduled-task wrapper script under the Codex++ user data
  directory, then point `/TR` at that wrapper.
- Add deterministic tests for Windows paths containing spaces, `&`, `^`, `%`,
  `!`, parentheses, quotes, and Unicode characters.
- Surface scheduler creation/query failures in `doctor` and support bundles.

## P2 Tasks

### 4. Make `install.ps1` a complete Windows front door

- Add `-Repair`, `-Uninstall`, `-Status`, `-Doctor`, `-SupportBundle`,
  `-OpenTweaks`, and `-OpenLogs` modes.
- Add `-Check` for dependency and Codex detection without patching.
- Add Git-less zip fallback for first install.
- Print stable next-step commands and detected paths at the end of each mode.
- Add tests or CI parser coverage for all parameter sets.

### 5. Add Windows-specific diagnostics

- Extend `status --json` and `doctor --json` with a Windows section.
- Include candidate installs, selected active install, stale-state status,
  scheduled task status, running process status, dependency versions, and
  writable target probe results.
- Include the same section in CLI and runtime-created support bundles.
- Keep redaction and bounded-output guarantees.

### 6. Improve Windows docs and in-app support copy

- Update README and Troubleshooting with PowerShell-first install, repair,
  uninstall, support bundle, manual `--app`, and close-Codex guidance.
- Add a Windows "Codex updated but Tweaks disappeared" flow that checks active
  app path, watcher task, and `repair`.
- Update Config support copy to mention quitting Codex before uninstall/repair
  when running on Windows.

## P3 Tasks

### 7. Make repository scripts Windows-portable

- Replace root `clean` with a Node script.
- Run `npm run check` in Windows CI.
- Add `install.ps1 -Help` and `install.ps1 -Check` execution in CI, not just
  parser validation.

### 8. Add Windows manual verification artifacts

- Add a `docs/WINDOWS-TEST-MATRIX.md` or Phase 6 checklist covering:
  - fresh install
  - repair after Codex update
  - uninstall
  - install while Codex is running
  - non-standard `--app` path
  - paths with spaces/metacharacters
  - support bundle collection
- Keep it concise enough to run on a real Windows machine before release.

## Test Plan

- Installer tests:
  - Squirrel candidate discovery and semantic version sorting.
  - stale `state.appRoot` after a simulated app update.
  - explicit `--app` still wins over auto-discovery.
  - install/repair/uninstall fake app mutation on Windows-shaped layouts.
  - locked/running Codex detection paths.
  - Windows EPERM/EACCES messages.
  - scheduled-task wrapper generation and quoting.
  - `openCommandForPath()` uses `explorer.exe` safely.

- Bootstrap tests:
  - PowerShell parser coverage for all parameter sets.
  - `install.ps1 -Help` and `install.ps1 -Check` on Windows CI.
  - Git-less fallback path logic through mocked download/extract helpers.

- Diagnostics tests:
  - `status --json` includes Windows candidate/stale-state fields.
  - `doctor --json` reports scheduled-task and running-process status.
  - support bundle includes Windows diagnostics while excluding secrets, tweak
    source, arbitrary files, and app bundles.

- Final validation:
  - `npm test`
  - `npm run build`
  - `npm run check`
  - Windows CI runs `npm run check`
  - Manual Windows smoke test against a real Codex install before tagging.

## Out of Scope

- Native signed MSI/MSIX installer.
- Windows/Linux ElectronAsarIntegrity writer.
- Automatic tweak installation or marketplace browsing.
- Background service with elevated privileges.
- Patching system-wide installs without explicit user/admin action.

## Suggested Delivery Order

1. Fix Windows Squirrel discovery, semver sorting, and stale repair targeting.
2. Add running/locked Codex detection and clearer Windows mutation errors.
3. Replace `cmd`-based folder opening and scheduled-task command construction.
4. Expand fake Windows install/repair/uninstall fixtures.
5. Extend status, doctor, and support bundles with Windows diagnostics.
6. Upgrade `install.ps1` into a full Windows support entry point.
7. Update docs, CI, and manual Windows release checklist.
