# Troubleshooting

## "Codex is damaged and can't be opened" / Gatekeeper rejection

The re-sign step failed or was skipped. Run:

```sh
codex-plusplus doctor
```

If the signature check fails, manually re-sign:

```sh
codesign --force --deep --sign - /Applications/Codex.app
xattr -dr com.apple.quarantine /Applications/Codex.app
```

## App launches but nothing about codex-plusplus appears

1. Open DevTools (View menu) and look for `[codex-plusplus]` lines.
2. Check `~/Library/Application Support/codex-plusplus/log/loader.log`.
3. If empty, the loader is not being executed → integrity check failed and the app silently fell back. Run `codex-plusplus repair`.

## Codex auto-updated and the patch is gone

The watcher should normally re-apply the patch automatically. To force it immediately, run:

```sh
codex-plusplus repair
```

Check the watcher is installed:

```sh
launchctl list | grep codexplusplus      # macOS
systemctl --user status codex-plusplus-watcher  # Linux
schtasks /Query /TN codex-plusplus-watcher       # Windows
```

## Need paths or machine-readable status

In Codex Settings, open Codex Plus Plus -> Config. The Install Health section
shows runtime version, tweak/log paths, reload status, and recent runtime error
count. The Support & Maintenance section can open the tweak/log folders, create
and reveal an in-app redacted support bundle, copy diagnostics JSON, and copy
the common support commands below.

```sh
codex-plusplus status
codex-plusplus status --json
codex-plusplus doctor --json
codex-plusplus support bundle
codex-plusplus tweaks list
codex-plusplus tweaks list --json
codex-plusplus tweaks list --verbose
codex-plusplus tweaks open
```

`status` and `doctor` state whether asar integrity was checked or skipped on
the current platform.

`support bundle` creates a timestamped redacted directory under the
codex-plusplus user data directory by default. It includes JSON status/doctor
output, redacted state/config summaries, and bounded log tails. It does not
include tweak source, arbitrary file contents, environment variables, or app
bundles.

For UI review without a real Codex app, run:

```sh
npm run fixtures:settings --workspace @codex-plusplus/runtime
npm run fixtures:settings:screenshots --workspace @codex-plusplus/runtime
```

The generated HTML/SVG artifacts land under
`packages/runtime/visual-review/settings-ui/`.

## Windows install notes

Use PowerShell, not Git Bash, for the Windows bootstrap:

```powershell
irm https://raw.githubusercontent.com/AppleLamps/codex-plusplus/main/install.ps1 | iex
```

Run the same script with support modes when you need to inspect or repair an
install:

```powershell
.\install.ps1 -Check
.\install.ps1 -Repair
.\install.ps1 -Status
.\install.ps1 -Doctor
.\install.ps1 -SupportBundle
.\install.ps1 -Uninstall
.\install.ps1 -OpenTweaks
.\install.ps1 -OpenLogs
```

If Codex is installed in a non-standard location, run:

```powershell
codex-plusplus install --app "C:\Path\To\Codex"
```

Windows and Linux currently skip plist integrity writing because that
ElectronAsarIntegrity metadata is macOS-specific. `status`, `status --json`,
`doctor`, and `doctor --json` report when integrity was checked or skipped.

Before `install`, `repair`, or `uninstall`, quit Codex completely. On Windows
the installer checks for `Codex.exe` and stops with a close-and-retry message if
the app is still running, because Windows can lock `app.asar` while Codex is
open.

If Codex updated and Tweaks disappeared:

```powershell
.\install.ps1 -Status
.\install.ps1 -Doctor
schtasks /Query /TN codex-plusplus-watcher
.\install.ps1 -Repair
```

`status --json`, `doctor --json`, and support bundles include a Windows
diagnostics section with Squirrel app candidates, the active app path, stale
state detection, Task Scheduler status, running-process status, dependency
versions, and the writable patch-target probe.

## "Tweaks" tab doesn't appear in Settings

Codex's Settings markup may have changed. The injector's heuristics need an update. As a workaround:

1. Open DevTools, run `document.querySelectorAll('[role=dialog]')` while Settings is open. If nothing matches, the dialog uses different attributes — please file an issue with the markup snippet.
2. Until fixed, your tweaks still load (check the console). Their settings sections just have no UI to attach to yet.

## Tweak fails to load

Open Codex Settings -> Codex Plus Plus -> Tweaks. Unavailable tweaks are grouped
under Needs Attention, their toggles are disabled, and the row shows the load
reason inline.

Check the renderer console:

```
[codex-plusplus] tweak load failed: <id> <error>
```

Common causes:

- `manifest.json` not valid JSON
- Missing `id`/`name`/`version` fields
- `minRuntime` requires a newer Codex++ runtime
- Entry script throws during `require`
- ESM-style `export default` in a `.js` file (use `.mjs` or `module.exports`)

Tweaks with Main Process Access show a stronger warning. Codex++ asks for
confirmation once per renderer session before enabling one, but this is a
trust prompt only; it does not add a new OS sandbox.

Use Trust details on a tweak row, or `codex-plusplus tweaks list --verbose`, to
see short explanations for each computed capability label.

## Uninstall is incomplete

The uninstaller only restores files we backed up at install time. If you've upgraded `codex-plusplus` and the original app version no longer matches, the restored backup may be stale. Either:

- Reinstall Codex from a fresh download
- Or `codex-plusplus install` against the new Codex, then `uninstall`

## I want to start fresh

```sh
codex-plusplus uninstall
rm -rf ~/Library/Application\ Support/codex-plusplus
# (XDG / APPDATA equivalents on Linux/Windows)
```

Then reinstall Codex.app from the official download.
