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

```sh
codex-plusplus status
codex-plusplus status --json
codex-plusplus doctor --json
codex-plusplus support bundle
codex-plusplus tweaks list
codex-plusplus tweaks open
```

`status` and `doctor` state whether asar integrity was checked or skipped on
the current platform.

`support bundle` creates a timestamped redacted directory under the
codex-plusplus user data directory by default. It includes JSON status/doctor
output, redacted state/config summaries, and bounded log tails. It does not
include tweak source, arbitrary file contents, environment variables, or app
bundles.

## Windows install notes

Use PowerShell, not Git Bash, for the Windows bootstrap:

```powershell
irm https://raw.githubusercontent.com/b-nnett/codex-plusplus/main/install.ps1 | iex
```

If Codex is installed in a non-standard location, run:

```powershell
codex-plusplus install --app "C:\Path\To\Codex"
```

Windows and Linux currently skip plist integrity writing because that
ElectronAsarIntegrity metadata is macOS-specific. `status`, `status --json`,
`doctor`, and `doctor --json` report when integrity was checked or skipped.

## "Tweaks" tab doesn't appear in Settings

Codex's Settings markup may have changed. The injector's heuristics need an update. As a workaround:

1. Open DevTools, run `document.querySelectorAll('[role=dialog]')` while Settings is open. If nothing matches, the dialog uses different attributes — please file an issue with the markup snippet.
2. Until fixed, your tweaks still load (check the console). Their settings sections just have no UI to attach to yet.

## Tweak fails to load

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
