# Phase 3 Implementation Plan

## Goal

Move from a hardened alpha to a releasable alpha. Phase 3 should prove that the
installer can patch, repair, and uninstall realistic app layouts; make the
bootstrap path credible on Windows; reduce release/version drift; and give users
and maintainers enough diagnostics to debug real installs without guessing.

## Phase 2 Completion Check

Phase 2 is implemented and validated:

- `codex-plusplus tweaks list`
- `codex-plusplus tweaks open`
- `codex-plusplus status --json`
- platform-aware install preflight
- runtime health IPC and manager diagnostics
- main-scope IPC disposer cleanup
- updated docs/changelog
- GitHub Actions CI
- generated installer runtime assets refreshed

Validation run:

- `npm test` passed
- `npm run build` passed
- `npm audit --workspaces --include-workspace-root` passed with 0 vulnerabilities

Remaining Phase 2 caveat:

- Installer fixture testing exists only around helpers and packaged assets. Full
  patch/repair/uninstall behavior still needs fixture-level coverage. This is
  the first Phase 3 priority.

## Current Review Findings

### 1. Installer core still lacks realistic fixture coverage

Files:

- `packages/installer/src/commands/install.ts`
- `packages/installer/src/commands/repair.ts`
- `packages/installer/src/commands/uninstall.ts`
- `packages/installer/src/asar.ts`
- `packages/installer/test/`

Findings:

- `injectLoader()` is private inside `install.ts`, making direct testing awkward.
- Current tests cover helpers, but not the core mutation path:
  - backup originals
  - patch `package.json#main`
  - preserve `__codexpp.originalMain`
  - copy loader into the asar
  - restore backup on uninstall
  - repair drift after app update
- Real app mutation is too risky for CI, so the project needs fake Electron app
  fixtures.

### 2. Public install story is POSIX-only

Files:

- `install.sh`
- `README.md`
- `packages/installer/README.md`

Findings:

- The repo describes Windows support, but the one-command installer is a shell
  script.
- Windows users need either a PowerShell bootstrap script or explicit manual
  install instructions.
- Linux support is aspirational because Codex is not shipped there yet; docs
  should distinguish runtime support from tested app-install support.

### 3. Version and release metadata can drift

Files:

- `package.json`
- `packages/*/package.json`
- `packages/installer/src/version.ts`
- `packages/runtime/src/version.ts`
- `CHANGELOG.md`

Findings:

- Version strings are duplicated across package manifests and source constants.
- Release checklist is manual.
- CI does not check that generated installer assets are current after runtime
  source changes.

### 4. Support diagnostics are still too manual

Files:

- `packages/installer/src/commands/status.ts`
- `packages/installer/src/commands/doctor.ts`
- `packages/runtime/src/main.ts`
- `docs/TROUBLESHOOTING.md`

Findings:

- `status --json` exists, but `doctor` is still human-only.
- Users still need to manually find and attach logs.
- There is no redacted support bundle command.

### 5. Settings injection remains the most brittle runtime surface

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/src/preload/manager.ts`
- `packages/runtime/test/`

Findings:

- The settings injector depends on Codex DOM/Radix heuristics.
- There are no DOM fixture tests for the Tweaks tab injection flow.
- Runtime health can report problems, but there are no automated checks for
  manager rendering or tab insertion.

### 6. Tweak trust model needs a clearer v1 boundary

Files:

- `SECURITY.md`
- `docs/WRITING-TWEAKS.md`
- `packages/sdk/src/index.ts`
- `packages/runtime/src/tweak-discovery.ts`

Findings:

- Tweaks are arbitrary local code, but there is no visible capability summary.
- `scope: "main"` is much more powerful than renderer-only tweaks.
- Users need clearer in-app and CLI signaling before installing/running powerful
  tweaks.

## Suggested Delivery Order

1. Add fixture-based installer mutation tests.
2. Add generated-asset/version consistency checks.
3. Add Windows bootstrap or explicit Windows install path.
4. Add support bundle and `doctor --json`.
5. Add DOM fixture tests for settings injection and manager diagnostics.
6. Clarify tweak trust/capability model.

## P1 Tasks

### 1. Add realistic installer fixture tests

Implementation:

- Factor patching helpers so `injectLoader()` and related behavior are directly
  testable without running the full install command.
- Build small fake app fixtures in test temp dirs:
  - macOS-style bundle with `Contents/Resources/app.asar`
  - Windows/Linux-style install with `resources/app.asar`
- Use `@electron/asar` to create tiny fixture asars with:
  - `package.json`
  - original main file
  - optional existing `__codexpp` block
- Test install core behavior:
  - original `main` is preserved
  - loader is copied
  - patched `main` points to `codex-plusplus-loader.cjs`
  - repeated patch is idempotent
  - header hash changes after patch
- Test uninstall/restore behavior using temp backups.
- Test repair drift behavior with state and changed asar hash, with side-effect
  commands mocked or factored out.

Acceptance checks:

- CI can exercise patch/repair/uninstall logic without a real Codex app.
- Fixture tests fail if loader paths, asar patching, or backup restoration drift.

### 2. Add generated asset and version consistency checks

Implementation:

- Add a script that runs after build or in CI to verify:
  - runtime source modules expected by the loader exist in
    `packages/installer/assets/runtime`
  - generated assets are in sync with `packages/runtime/src`
  - root/package/runtime/installer/sdk versions match source constants
- Add `npm run check` as the release gate for tests, build, generated asset
  consistency, version consistency, and audit.
- Update CI to run `npm run check`.

Acceptance checks:

- A runtime source change without rebuilt assets fails CI.
- A version bump in only one package/source constant fails CI.

### 3. Add a Windows bootstrap path

Implementation:

- Add `install.ps1` that mirrors `install.sh`:
  - checks Node 20+
  - checks npm
  - downloads GitHub tarball for `$env:CODEX_PLUSPLUS_REPO` and
    `$env:CODEX_PLUSPLUS_REF`
  - installs dependencies
  - builds
  - moves source into `%USERPROFILE%\.codex-plusplus\source` by default
  - runs `node ...\packages\installer\dist\cli.js install`
- Keep environment override names aligned with `install.sh` where practical.
- Update README with Windows and POSIX install commands.
- If PowerShell bootstrap is not fully testable in CI, add syntax/static checks
  and document manual validation.

Acceptance checks:

- Windows users have a first-class documented bootstrap command.
- POSIX install script behavior is unchanged.
- Docs clearly distinguish tested macOS install from Windows/Linux support
  maturity.

## P2 Tasks

### 4. Add support bundle and `doctor --json`

Implementation:

- Add `codex-plusplus doctor --json` with structured checks matching human
  doctor output.
- Add `codex-plusplus support bundle` to create a redacted zip/tarball or
  directory containing:
  - `status --json`
  - `doctor --json`
  - recent Codex++ logs
  - state/config with user paths and secrets redacted
  - package/runtime versions
- Never include tweak source code, arbitrary file contents, environment
  variables, or tokens.

Acceptance checks:

- Support bundle is deterministic and redacted.
- A failed install can produce useful diagnostics without opening Codex.

### 5. Add DOM fixture tests for settings injection

Implementation:

- Use a lightweight DOM test setup for `settings-injector` and manager logic.
- Test that:
  - Tweaks tab is inserted into a representative settings dialog.
  - Existing tabs are not broken.
  - manager section renders tweak loadability and runtime diagnostics.
  - repeated mount/reload does not duplicate tabs or sections.
- Keep tests independent of a real Codex app.

Acceptance checks:

- Changes to injector heuristics are covered by fixtures.
- A future Codex DOM adjustment can be reproduced with a fixture before patching
  runtime code.

### 6. Clarify tweak trust and capabilities

Implementation:

- Add a visible capability/trust summary based on manifest fields:
  - renderer-only
  - main-process access
  - filesystem sandbox access
  - settings pages/sections
- Surface this in `tweaks list` and the Tweaks manager.
- Update security and author docs to explain that capability labels are
  advisory, not a complete sandbox.
- Consider warning when enabling `scope: "main"` tweaks.

Acceptance checks:

- Users can see when a tweak has main-process access.
- Docs accurately describe trust boundaries without overpromising sandboxing.

## Suggested Acceptance Checks for Phase 3

- `npm run check`
- `npm test`
- `npm run build`
- `npm audit --workspaces --include-workspace-root`
- Fixture tests for install, repair, uninstall, and settings injection
- Manual smoke test on macOS:
  - fresh install
  - launch Codex
  - verify Tweaks tab
  - disable/enable tweak
  - repair
  - uninstall
- Manual Windows bootstrap dry run or documented validation transcript before
  claiming Windows install support.

## Out of Scope for Phase 3

- Automatic tweak updates.
- Public tweak marketplace.
- Full Windows/Linux Electron integrity writers.
- Signed/native installer packaging.
- Replacing the settings injector architecture.
- True OS-level sandboxing for tweaks.

## Notes

- Phase 3 should start after Phase 1 and Phase 2 changes are committed or
  staged, because generated assets and new tests span many files.
- The highest-value Phase 3 work is fixture-based installer testing. It is the
  remaining gap between "builds in CI" and "safe to ask users to install."
