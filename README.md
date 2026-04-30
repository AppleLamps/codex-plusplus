# codex-plusplus

`codex-plusplus` is a tweak and extension layer for the open-source Codex
desktop app. It patches a local `Codex.app` installation once, then loads
user-editable tweaks from your own data directory.

This fork is maintained at
[`AppleLamps/codex-plusplus`](https://github.com/AppleLamps/codex-plusplus)
and is based on the original
[`b-nnett/codex-plusplus`](https://github.com/b-nnett/codex-plusplus) project.

> **Status:** alpha. The runtime, installer, and manager UI are usable, but
> patching an Electron app is inherently platform-sensitive. Keep backups and
> expect occasional repair after Codex updates.

<img width="1413" height="1016" alt="Codex++ settings screenshot" src="https://github.com/user-attachments/assets/ea0b2ffc-c30d-4f68-ae12-dd8d6a997b2f" />

## What This Is

Codex++ is best understood as a local plugin system for Codex.app.

It does not replace Codex, fork Codex's source, or make the model smarter by
itself. Instead, it makes the installed Codex app tweakable. Once installed,
small local modules called **tweaks** can add UI, settings pages, keyboard
shortcuts, workflow helpers, diagnostics, and other app-level behavior.

In practice, this means you can improve the way Codex feels and works without
rebuilding the app:

- Add custom keyboard shortcuts.
- Improve or adjust Codex's UI.
- Add tweak-specific settings inside Codex Settings.
- Add workflow buttons, panels, or local helpers.
- Store tweak data under your user directory.
- Run deeper trusted tweaks in the Electron main process when needed.
- Collect diagnostics and support bundles when something breaks.

The core idea:

> Codex++ turns Codex.app into a moddable Electron app.

## How It Works

Codex is an Electron app, and its packaged application code lives in
`app.asar`. Codex++ patches that startup path so a small loader runs before
Codex's normal entry point.

The loader then pulls the Codex++ runtime from your user directory. The runtime
discovers tweak folders, starts enabled tweaks, and injects a Codex Plus Plus
section into Codex Settings.

Everything after the one-time app patch lives outside the app bundle:

| Component | Location |
| --- | --- |
| Loader stub | `Codex.app/Contents/Resources/app.asar` |
| Runtime | `<user-data-dir>/runtime/` |
| Tweaks | `<user-data-dir>/tweaks/` |
| Config | `<user-data-dir>/config.json` |
| Logs | `<user-data-dir>/log/` |
| Backup | `<user-data-dir>/backup/` |

`<user-data-dir>` by platform:

- macOS: `~/Library/Application Support/codex-plusplus/`
- Linux: `$XDG_DATA_HOME/codex-plusplus/` or `~/.local/share/codex-plusplus/`
- Windows: `%APPDATA%/codex-plusplus/`

Because the runtime and tweaks live outside the app bundle, tweak development
is mostly save-and-reload after the initial install.

## What It Does Not Do

Codex++ is not a model upgrade. It does not directly improve Codex's reasoning,
code understanding, or language model quality.

It can improve the **product experience around Codex**. Any ability improvement
comes from the tweaks you install or write, such as better context controls,
shortcuts, prompt helpers, project navigation, diagnostics, or local workflow
integrations.

## Install

### macOS and Linux

```sh
curl -fsSL https://raw.githubusercontent.com/AppleLamps/codex-plusplus/main/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/AppleLamps/codex-plusplus/main/install.ps1 | iex
```

On Windows, the PowerShell bootstrap is also the support entry point:

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

If auto-detection misses your app, pass the app path explicitly:

```sh
codex-plusplus install --app <path-to-Codex-app-or-install-dir>
```

On Windows, quit Codex before install, repair, or uninstall. Codex++ checks for
`Codex.exe` and stops early if the app is still running, because Windows can
lock `app.asar` while Codex is open.

## What The Installer Changes

The installer:

1. Locates your Codex app installation.
2. Backs up the original app files under the Codex++ user data directory.
3. Patches `app.asar` so the Codex++ loader runs at startup.
4. Updates macOS Electron asar integrity metadata when available.
5. Flips Electron's embedded asar integrity validation fuse as a backup.
6. Re-signs the app ad-hoc on macOS.
7. Installs an auto-repair watcher so Codex++ can re-apply the patch after app
   updates.
8. Installs the default tweak set unless `--no-default-tweaks` is passed.

On Windows, Codex++ scans Squirrel `app-*` install directories under
`%LOCALAPPDATA%\codex`, selects the newest valid install, and reports stale
recorded paths after Codex updates. The scheduled repair task uses a generated
wrapper script so paths with spaces or shell metacharacters do not break repair.

## Commands

Common CLI commands:

```sh
codex-plusplus status
codex-plusplus status --json
codex-plusplus doctor
codex-plusplus doctor --json
codex-plusplus support bundle
codex-plusplus repair
codex-plusplus uninstall
codex-plusplus tweaks list
codex-plusplus tweaks list --json
codex-plusplus tweaks list --verbose
codex-plusplus tweaks open
```

Use `doctor --json`, `support bundle`, and the in-app Config support actions
when filing issues or collecting diagnostics.

To uninstall:

```sh
codex-plusplus uninstall
```

If the CLI is not on your `PATH`, run the built CLI directly from the installed
source checkout:

```sh
node ~/.codex-plusplus/source/packages/installer/dist/cli.js uninstall
```

On Windows, the source checkout lives under:

```powershell
%APPDATA%\codex-plusplus\source
```

## Tweak Manager

After installation, open Codex Settings and use the **Codex Plus Plus** sidebar
group.

The **Tweaks** page:

- Groups tweaks by Needs Attention, Updates Available, Enabled, and Disabled.
- Provides search and status filters.
- Keeps incompatible or broken tweaks visible with their load reason.
- Shows friendly capability labels such as Renderer UI, Main Process Access,
  Local Data Storage, Custom Entry, and Runtime Requirement.
- Shows Trust details for each tweak.
- Requires a once-per-session confirmation before enabling a main-process tweak.

The **Config** page:

- Shows Codex++ update controls.
- Shows install health, runtime version, tweak/log paths, and recent errors.
- Can create a redacted support bundle.
- Can copy diagnostics JSON.
- Can reveal logs, support bundles, and tweak folders.
- Provides copyable CLI fallback commands.

## Default Tweaks

The default tweak set is installed on first run unless
`--no-default-tweaks` is passed:

- `co.bennett.custom-keyboard-shortcuts` from
  `b-nnett/codex-plusplus-keyboard-shortcuts`
- `co.bennett.ui-improvements` from
  `b-nnett/codex-plusplus-bennett-ui`

These are separate tweak release channels. They are intentionally distinct from
this fork's main repository.

## Writing A Tweak

A tweak is a folder under `<user-data-dir>/tweaks/`:

```text
my-tweak/
├── manifest.json
└── index.js
```

Example manifest:

```json
{
  "id": "com.you.my-tweak",
  "name": "My Tweak",
  "version": "0.1.0",
  "githubRepo": "you/my-tweak",
  "author": "you",
  "description": "Adds a button.",
  "minRuntime": "0.1.0"
}
```

Example tweak:

```ts
import type { Tweak } from "@codex-plusplus/sdk";

export default {
  start(api) {
    api.settings.register({
      id: "my-tweak",
      title: "My Tweak",
      render: (root) => {
        root.innerHTML = `<button>hi</button>`;
      },
    });
    api.log.info("started");
  },
  stop() {},
} satisfies Tweak;
```

See [docs/WRITING-TWEAKS.md](./docs/WRITING-TWEAKS.md) for the full tweak API.

## Tweak Updates

Every tweak manifest should include `githubRepo` in `owner/repo` form. Codex++
checks GitHub Releases for installed tweaks at most once per day and shows
**Update Available** in Settings when a newer semver release exists.

Codex++ does not auto-update tweaks. It links to the release so you can review
the repository, diff, release notes, and trust boundary before replacing local
tweak files.

Tweaks can declare `minRuntime`. Incompatible tweaks stay visible in Settings
and `tweaks list`, but they are not started.

## Security Model

Tweaks are local code. Install tweaks only from sources you trust.

Renderer tweaks can modify Codex's visible UI. Main-process tweaks can access
deeper Electron APIs through the Codex++ runtime and are treated as higher
trust. Codex++ surfaces this with capability labels and confirmation prompts,
but those prompts are not an OS sandbox.

See [SECURITY.md](./SECURITY.md) for more detail.

## Development

Install dependencies:

```sh
npm ci
```

Run tests:

```sh
npm test
```

Build all workspaces and regenerate packaged runtime assets:

```sh
npm run build
```

Run the full release check:

```sh
npm run check
```

Generate deterministic Settings UI review fixtures:

```sh
npm run fixtures:settings --workspace @codex-plusplus/runtime
npm run fixtures:settings:screenshots --workspace @codex-plusplus/runtime
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Writing Tweaks](./docs/WRITING-TWEAKS.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)
- [Windows Test Matrix](./docs/WINDOWS-TEST-MATRIX.md)
- [Security](./SECURITY.md)
- [Changelog](./CHANGELOG.md)

## License

MIT.

This project modifies a local Electron app installation. Use it at your own
risk, keep backups, and expect repairs after upstream app updates.
