# Windows Test Matrix

Run this before tagging a release that changes installer, watcher, or support
diagnostics behavior.

## Setup

- Use Windows PowerShell or PowerShell 7, not Git Bash.
- Install Node.js 20 or newer.
- Install Git for Windows if testing the Git path; temporarily remove Git from
  `PATH` when testing the zip fallback.
- Start from a clean Codex desktop install.

## Smoke Tests

1. Fresh install
   - Run `.\install.ps1 -Check`.
   - Run `.\install.ps1`.
   - Confirm Codex launches and Settings shows Codex Plus Plus pages.
   - Run `.\install.ps1 -Status` and confirm the active app path matches the
     current `%LOCALAPPDATA%\codex\app-*` directory.

2. Repair after Codex update
   - Simulate or wait for Codex to create a newer `app-*` directory.
   - Run `.\install.ps1 -Repair`.
   - Confirm diagnostics show no stale recorded path after repair.

3. Running app guard
   - Launch Codex.
   - Run `.\install.ps1 -Repair`.
   - Confirm it stops with a "Quit Codex" message and does not mutate files.

4. Non-standard app path
   - Run `.\install.ps1 -Check -App "C:\Path\To\Codex"`.
   - Run `.\install.ps1 -Repair -App "C:\Path\To\Codex"`.
   - Confirm the explicit path is used.

5. Scheduler watcher
   - Run `schtasks /Query /TN codex-plusplus-watcher`.
   - Run `schtasks /Query /TN codex-plusplus-watcher-daily`.
   - Confirm `%APPDATA%\codex-plusplus\codex-plusplus-repair.cmd` exists.

6. Support diagnostics
   - Run `.\install.ps1 -Doctor`.
   - Run `.\install.ps1 -SupportBundle`.
   - Confirm the bundle contains `status.json`, `doctor.json`, `windows.json`,
     redacted config/state summaries when present, and bounded log tails.

7. Uninstall
   - Quit Codex.
   - Run `.\install.ps1 -Uninstall`.
   - Confirm the watcher tasks are removed and Codex launches without Codex++
     settings pages.

## Edge Paths

Repeat install and repair from a Windows user profile or source path containing:

- Spaces
- Parentheses
- Ampersand (`&`)
- Caret (`^`)
- Percent sign (`%`)
- Exclamation mark (`!`)
- Non-ASCII characters

The scheduled task wrapper and folder reveal actions should continue to work.
