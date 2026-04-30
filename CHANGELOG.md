# Changelog

All notable changes to codex-plusplus are documented here.

This project uses semver for the installer, runtime, SDK, and published CLI package. Tweak authors should also use semver release tags so the manager can compare installed and available versions.

## Unreleased

- Phase 4 UI/UX pass:
  - Redesigned the in-app Tweaks page with grouped status sections, search,
    status filters, disabled unavailable toggles, and inline async feedback.
  - Redesigned Config as the support hub with install health, runtime paths,
    recent error visibility, and copyable maintenance commands.
  - Replaced raw capability chips with friendlier trust labels and added
    once-per-session confirmation before enabling main-process-capable tweaks.
  - Retired the older duplicate manager section from normal startup.
  - Expanded DOM fixture coverage for grouped tweak states, async errors,
    Config health, registered page render failures, and remount behavior.
- Phase 3 release-readiness pass:
  - Added Windows `install.ps1` bootstrap and documented Windows manual
    `--app` fallback.
  - Added `doctor --json`, redacted `support bundle`, and release consistency
    checks through `npm run check`.
  - Added fake-app installer fixture coverage for asar patching, backup
    restore, corrupted layouts, and packaged runtime assets.
  - Added DOM-backed Settings injector tests with `happy-dom`.
  - Surfaced computed tweak trust/capability labels in the CLI and manager UI.
- Hardened tweak source, asset, manifest entry, and per-tweak filesystem path
  containment.
- Enforced `minRuntime` compatibility and surfaced skipped tweaks in the UI.
- Awaited async tweak teardown and cleaned up main-process IPC registrations on
  reload/stop.
- Added `status --json`, `tweaks list`, and `tweaks open` CLI support helpers.
- Made installer preflight and integrity messaging platform-aware.
- Added runtime health diagnostics, focused Node tests, and CI.

## 0.1.0

- Initial alpha release.
- One-command GitHub installer via `install.sh`; no npm package or `npx` dependency.
- Runtime-loaded local tweaks with Settings integration.
- App-update repair watcher for re-patching Codex after app updates, using the locally installed CLI.
- Codex++ release checks through GitHub Releases.
- Default tweak seeding from Bennett UI Improvements and Custom Keyboard Shortcuts GitHub release channels, with `--no-default-tweaks`.
- Review-only tweak update checks via required `githubRepo` manifest metadata.
- In-app tweak manager with enable/disable, config, release links, and maintenance actions.
