# Phase 2 Implementation Plan

## Goal

Make the alpha easier to ship, support, and verify after the Phase 1 hardening
work. Phase 2 should focus on user-facing correctness: installer reliability,
documented behavior matching real behavior, CLI ergonomics, lifecycle cleanup,
and enough verification to catch platform regressions before release.

## Current Review Findings

### 1. Documentation is now stale in several important places

Files:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/WRITING-TWEAKS.md`
- `docs/TROUBLESHOOTING.md`
- `CHANGELOG.md`

Findings:

- `README.md` advertises `tweaks list` and `tweaks open`, but the CLI only
  exposes `install`, `uninstall`, `repair`, `status`, and `doctor`.
- `docs/ARCHITECTURE.md` says the runtime uses `session.setPreloads()`, while
  current code uses `session.registerPreloadScript()`.
- `docs/ARCHITECTURE.md` says renderer tweaks are `require()`d, while current
  renderer execution fetches source over IPC and evaluates it with
  `new Function`.
- `docs/WRITING-TWEAKS.md` says main storage is in-memory and disable/hot-reload
  stop behavior is planned; Phase 1 made disk storage and async stop behavior
  real.
- `CHANGELOG.md` does not mention Phase 1 security/lifecycle/test work.

### 2. Installer is still not truly cross-platform

Files:

- `install.sh`
- `packages/installer/src/commands/install.ts`
- `packages/installer/src/platform.ts`
- `packages/installer/src/watcher.ts`

Findings:

- The project describes Windows/Linux install support, but the public bootstrap
  path is a POSIX shell script.
- `preflightWritable()` always probes `appRoot/Contents/...`, which is correct
  for macOS bundles but wrong for Windows/Linux installs.
- Integrity behavior is now clearer in status/doctor, but install output still
  implies the macOS hash update path when `metaPath` exists and is quiet
  otherwise.
- Watcher install is covered by command-string tests, but not by platform-level
  install/refresh behavior tests.

### 3. CLI needs a small, coherent management surface

Files:

- `packages/installer/src/cli.ts`
- `packages/installer/src/paths.ts`
- `packages/installer/src/state.ts`
- `README.md`
- `docs/TROUBLESHOOTING.md`

Findings:

- Users need a terminal way to find/open the tweaks directory and logs when the
  in-app UI fails.
- README already promises `tweaks list` and `tweaks open`, so either implement
  them or remove the claim. Implementing them is more useful.
- `status` and `doctor` are human-only; there is no machine-readable output for
  support scripts or CI smoke checks.

### 4. Tweak IPC lifecycle cleanup is incomplete

Files:

- `packages/runtime/src/main.ts`
- `packages/sdk/src/index.ts`
- `packages/runtime/src/preload/tweak-host.ts`

Findings:

- Main-side `api.ipc.handle()` registers persistent `ipcMain.handle()` handlers
  and gives tweaks no disposer.
- Main-side `api.ipc.on()` returns a disposer, but Codex++ does not track and
  run disposers automatically when a tweak stops.
- Repeated reloads can leave stale IPC handlers/listeners for main-scope tweaks
  unless tweak authors clean everything up perfectly.

### 5. Runtime diagnostics are useful but scattered

Files:

- `packages/runtime/src/main.ts`
- `packages/runtime/src/preload/index.ts`
- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/src/preload/manager.ts`

Findings:

- Logs exist, but there is no consolidated runtime health snapshot for support.
- Settings injection failure is mostly visible through console/log lines.
- The manager can show tweak loadability, but it does not yet surface recent
  runtime errors, path locations, or reload health in one place.

### 6. Tests now exist, but release validation is still thin

Files:

- `package.json`
- `packages/installer/test/`
- `packages/runtime/test/`
- `.github/workflows/*` if CI is added

Findings:

- Phase 1 added focused Node tests, but there is no CI workflow.
- Installer patching behavior is not covered by fixture-based tests.
- Documentation examples are not validated.
- No smoke test confirms the packaged installer assets contain the runtime
  modules expected by the loader.

## Suggested Delivery Order

1. Fix stale docs and changelog so the repository describes the current product.
2. Add the promised `tweaks` CLI commands and terminal support ergonomics.
3. Make installer preflight and messaging platform-aware.
4. Add automatic IPC cleanup for main-scope tweaks.
5. Add runtime health/status diagnostics.
6. Expand tests and add CI.

## P1 Tasks

### 1. Bring docs and release notes back in sync

Implementation:

- Update architecture docs for `registerPreloadScript`, sandboxed renderer
  source loading, Phase 1 path containment, `minRuntime`, and async teardown.
- Update tweak author docs for disk-backed main storage, actual stop behavior,
  `minRuntime` enforcement, and current TypeScript/transpile expectations.
- Update troubleshooting docs with the new loadability statuses and
  platform-specific integrity messages.
- Add a `CHANGELOG.md` entry for Phase 1.

Acceptance checks:

- No docs claim `session.setPreloads()` or renderer `require()` loading.
- README CLI examples match implemented commands.
- Changelog calls out security hardening, lifecycle fixes, and test coverage.

### 2. Implement `codex-plusplus tweaks` CLI commands

Implementation:

- Add `codex-plusplus tweaks list` to enumerate local tweak folders and basic
  manifest status.
- Add `codex-plusplus tweaks open` to open the user tweaks directory.
- Add `codex-plusplus logs open` or document `doctor/status` output paths if a
  separate logs command is not worthwhile.
- Keep commands read-only except for opening folders.
- Use the same manifest validation/discovery rules where possible, or add a
  small installer-side manifest reader that mirrors runtime behavior without
  importing Electron-bound runtime code.

Acceptance checks:

- `README.md` examples work.
- `tweaks list` reports missing/invalid manifests clearly.
- `tweaks open` works on macOS, Windows, and Linux using platform-appropriate
  open commands.
- Tests cover list/open command helpers without opening real UI in CI.

### 3. Make installer preflight platform-aware

Implementation:

- Change install preflight to probe a real writable location for each platform:
  - macOS: bundle `Contents`.
  - Windows/Linux: install root or resources directory, depending on where the
    patch writes.
- Make preflight errors mention the relevant platform and path.
- Keep the macOS App Management guidance only for macOS bundle permission
  failures.
- Make install output explicit when integrity writing is skipped on
  Windows/Linux.

Acceptance checks:

- Unit tests cover macOS, Windows, and Linux preflight probe path selection.
- Windows/Linux installs no longer fail because `Contents` does not exist.
- Install/status/doctor integrity messages tell the same story.

### 4. Track and dispose main-scope IPC registrations

Implementation:

- Make `api.ipc.handle()` return a disposer in practice and in SDK types.
- Track disposers registered by each main-scope tweak.
- Run all tracked disposers during tweak stop/reload, even if `stop()` fails.
- Make repeated handler registration replace or reject existing handlers for the
  same tweak/channel deterministically.
- Preserve existing renderer IPC behavior.

Acceptance checks:

- Reloading a main tweak does not leave duplicate listeners or stale handlers.
- A tweak that forgets to clean up IPC still gets cleaned up by Codex++.
- Tests cover handler/listener cleanup and stop failure cleanup.

## P2 Tasks

### 5. Add runtime health diagnostics

Implementation:

- Add a runtime health snapshot IPC endpoint with:
  - runtime version
  - user paths
  - discovered tweak count
  - loaded main/renderer counts where available
  - most recent reload timestamp/status
  - recent startup/reload errors
- Surface this in the Tweak Manager or a compact diagnostics section.
- Consider adding `codex-plusplus status --json` later if the installer can read
  enough state without a running app.

Acceptance checks:

- Users can diagnose "Tweaks tab missing" or "tweak not loaded" without digging
  through multiple files first.
- Health output does not expose secrets or arbitrary file contents.

### 6. Add fixture-based installer tests

Implementation:

- Create small fake Electron app/asar fixtures for install/repair/uninstall
  tests where feasible.
- Test `injectLoader`, `stageAssets`, state writing, backup behavior, and
  uninstall restoration.
- Keep platform-specific commands mocked or factored into pure helpers.

Acceptance checks:

- Install/repair/uninstall core behavior can be tested without a real Codex app.
- Tests catch missing runtime assets and stale loader paths.

### 7. Add CI for build and tests

Implementation:

- Add a GitHub Actions workflow that runs:
  - `npm ci`
  - `npm test`
  - `npm run build`
  - `npm audit --workspaces --include-workspace-root` if the audit signal is
    acceptable for alpha.
- Run on pull requests and pushes to main.

Acceptance checks:

- CI catches test/build failures before release.
- Workflow avoids real Codex app mutation.

## Suggested Acceptance Checks for Phase 2

- `npm test`
- `npm run build`
- `npm audit --workspaces --include-workspace-root`
- CLI smoke checks:
  - `codex-plusplus status`
  - `codex-plusplus doctor`
  - `codex-plusplus tweaks list`
  - `codex-plusplus tweaks open` with the opener mocked in tests
- Manual release smoke test on at least macOS before publishing.

## Out of Scope for Phase 2

- Automatic tweak updates.
- A public tweak marketplace.
- Full Windows/Linux integrity writers.
- Replacing the settings injector architecture.
- Large UI redesign of the Tweak Manager.
- Shipping a signed native installer.

## Notes

- Phase 2 should start only after the Phase 1 working tree is staged or
  committed, because Phase 1 introduced new runtime assets, helpers, and tests.
- The highest-risk discovered issue for Phase 2 is the platform-specific install
  preflight path. It can make non-macOS installs fail before patching begins.
