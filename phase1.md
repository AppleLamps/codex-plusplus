# Phase 1 Implementation Plan

## Goal

Close the highest-impact reliability, security, and lifecycle gaps before moving
on to broader polish. Phase 1 focuses on installer failure behavior, tweak path
containment, manifest compatibility, async teardown, and Windows watcher
robustness.

## Guiding principles

- Treat tweak file access and tweak execution paths as security boundaries.
- Prefer canonical path checks over string-prefix checks.
- Preserve user data and existing tweak directories.
- Add focused regression tests for every bug-class fixed here.
- Keep unrelated refactors out of Phase 1 unless they directly reduce risk in
  the touched code.

## Delivery order

1. Harden tweak path containment.
2. Constrain manifest entry resolution and runtime compatibility.
3. Await tweak teardown consistently.
4. Improve uninstall behavior when installer state is missing or corrupt.
5. Stabilize Windows watcher command generation.
6. Clarify platform-specific integrity behavior.
7. Apply small diagnostics polish.

## P1 Tasks

### 1. Harden tweak IPC filesystem boundaries

Files:

- `packages/runtime/src/main.ts`

Current issues:

- `codexpp:read-tweak-source` uses `startsWith(TWEAKS_DIR + "/")`.
- `codexpp:read-tweak-asset` uses brittle directory-prefix checks.
- `codexpp:tweak-fs` blocks `".."` but accepts absolute paths that can escape
  the tweak data directory.

Implementation:

- Add a shared containment helper for filesystem paths.
- Resolve and, where the file exists, canonicalize paths with `realpath`.
- Validate containment with `path.relative`, rejecting:
  - paths that start with `..`
  - absolute relative results
  - empty or invalid caller input
- For `tweak-fs`, always resolve caller paths against the tweak's sandbox data
  directory and reject absolute input that escapes that directory.
- Keep `dataDir` returning the sandbox directory only.

Acceptance checks:

- Traversal attempts are rejected for source, asset, and tweak data reads.
- Absolute paths outside the sandbox are rejected.
- Valid nested files inside the relevant tweak directory still work.
- Windows-style paths are covered in tests where practical.

### 2. Constrain manifest entry paths

Files:

- `packages/runtime/src/tweak-discovery.ts`

Current issue:

- `manifest.main` is joined to the tweak directory, but it is not constrained to
  remain inside that directory.

Implementation:

- Resolve `manifest.main` against the owning tweak directory.
- Reject entries that escape that directory.
- Reject directories as entries; require a file.
- Keep existing fallback behavior for `index.js`, `index.cjs`, and `index.mjs`.

Acceptance checks:

- `manifest.main: "../outside.js"` is rejected.
- Absolute `manifest.main` values outside the tweak directory are rejected.
- Valid relative entry files still load.

### 3. Enforce `minRuntime`

Files:

- `packages/sdk/src/index.ts`
- `packages/runtime/src/main.ts`
- `packages/runtime/src/tweak-discovery.ts`

Current issue:

- `minRuntime` is typed and documented but never enforced.

Implementation:

- Compare `manifest.minRuntime` with the current Codex++ runtime version.
- Mark incompatible tweaks as unavailable/errored instead of starting them.
- Surface a clear status in the tweak list or logs so users know why the tweak
  did not load.
- Use the repository's existing version comparison helper if one is available;
  otherwise add a small local helper that matches the current version format.

Acceptance checks:

- Tweaks requiring a newer runtime do not start.
- Compatible tweaks continue to start.
- Users get a useful incompatibility message.

### 4. Await async tweak teardown

Files:

- `packages/runtime/src/main.ts`
- `packages/runtime/src/preload/tweak-host.ts`

Current issue:

- The SDK allows `stop(): void | Promise<void>`, but teardown paths invoke it as
  a synchronous callback.

Implementation:

- Store `stop?: () => void | Promise<void>` in loaded tweak state.
- Make main-process teardown async and await each stop before flushing storage.
- Make renderer teardown async and await each stop before clearing loaded state.
- Ensure lifecycle callers await teardown during reload, restart, and quit paths.
- Log stop failures while continuing to tear down remaining tweaks.

Acceptance checks:

- Async `stop()` resolves before storage flush or reload completion.
- A failing `stop()` does not prevent other tweaks from stopping.
- Type definitions and implementation agree.

### 5. Improve uninstall behavior without installer state

Files:

- `packages/installer/src/commands/uninstall.ts`

Current issue:

- `locateCodex(opts.app ?? state?.appRoot)` can receive `undefined` when state is
  missing or corrupt, causing uninstall to fail before useful guidance.

Implementation:

- If state does not contain an app root and `--app` was not provided, fail early
  with a clear message.
- Tell the user to rerun uninstall with `--app <path-to-Codex-app>`.
- Preserve existing backup safety checks.

Acceptance checks:

- Missing state produces an actionable error.
- Valid `--app` uninstall still works.
- Valid state-based uninstall still works.

### 6. Stabilize Windows watcher command generation

Files:

- `packages/installer/src/watcher.ts`

Current issue:

- The scheduled task repair command is marked as delicate and untested,
  especially for paths with spaces.

Implementation:

- Add a small quoting/helper function for Windows scheduled task commands.
- Cover paths with spaces and special characters in deterministic tests.
- Keep command construction centralized so repair and scheduled task setup cannot
  drift.
- Remove or replace the TODO once covered.

Acceptance checks:

- Generated `/TR` command handles spaces in install paths.
- Existing macOS and Linux watcher behavior is unchanged.

## P2 Tasks

### 7. Clarify platform-specific integrity behavior

Files:

- `packages/installer/src/integrity.ts`
- Installer status, doctor, README, or changelog as appropriate

Current issue:

- Integrity handling is meaningful on macOS but currently a no-op on
  Windows/Linux. User-facing output can imply integrity is uniform across
  platforms.

Implementation:

- Make status/doctor output explicit about platform-specific integrity behavior.
- Document that Windows/Linux currently rely on the fuse behavior described in
  code comments.

Acceptance checks:

- Users can tell whether integrity was checked, updated, skipped, or not
  applicable on their platform.

### 8. Fix doctor path labels on Windows

Files:

- `packages/installer/src/commands/doctor.ts`

Current issue:

- Doctor labels use `dir.split("/")`, which is not Windows-safe.

Implementation:

- Use `path.basename(dir)` for directory labels.

Acceptance checks:

- Doctor output labels are correct on Windows and POSIX paths.

## Test Plan

Run focused tests first, then broader validation:

- Path containment tests for:
  - `codexpp:read-tweak-source`
  - `codexpp:read-tweak-asset`
  - `codexpp:tweak-fs`
- Manifest discovery tests for:
  - escaping `main`
  - absolute `main`
  - valid custom `main`
  - default entry candidates
- Runtime compatibility tests for:
  - compatible `minRuntime`
  - incompatible `minRuntime`
  - absent `minRuntime`
- Lifecycle tests for:
  - async `stop()` is awaited
  - stop failure is logged and teardown continues
- Installer tests for:
  - uninstall with missing state
  - uninstall with explicit `--app`
  - Windows watcher command quoting
- Final validation:
  - repository test command
  - lint/typecheck command if available

## Definition of Done

- All P1 tasks are implemented.
- Each fixed bug class has focused regression coverage.
- Existing supported behavior remains intact.
- User-facing error messages are actionable.
- Security-sensitive path checks use shared, canonical containment logic.
- Phase 1 docs/changelog notes are updated if behavior or messaging changes.

## Out of Scope for Phase 1

- Broad installer redesign.
- New tweak package/update installation flows.
- Major dependency upgrades.
- Cross-platform integrity writers for Windows/Linux.
- Large UI redesigns beyond the status/error messages needed for this phase.
