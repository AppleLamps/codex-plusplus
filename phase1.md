# Phase 1 — Codebase review (opportunities and issues)

This document summarizes findings from a read-through of the **codex-plusplus** monorepo (installer CLI, Electron runtime/loader, SDK). Items are grouped by theme; severity is informal (risk / maintainability / completeness).

---

## Testing and quality gates

- **No automated tests.** There are no unit, integration, or E2E tests in the repository (no `vitest`, `jest`, or test files). Critical paths—ASAR patching, plist integrity, fuse flipping, watcher unit generation, tweak discovery, IPC handlers—would benefit from targeted tests or at least smoke scripts.
- **No lint/format CI.** Root `package.json` defines `audit` but there is no ESLint/Prettier config in-repo and no `.github/workflows` for build verification. Regressions in TypeScript packages may go unnoticed until manual runs.

---

## Version and duplication

- **Runtime version string is duplicated.** `packages/installer/src/version.ts` exports `CODEX_PLUSPLUS_VERSION`, but `packages/runtime/src/main.ts` hardcodes the same constant (`0.1.0`). Releases risk shipping a mismatched runtime vs CLI unless both are updated manually. Prefer a single source (generated header, import from a tiny shared package, or build-time injection).
- **Duplicate semver comparison logic.** `compareSemver` in `packages/installer/src/version.ts` and `compareVersions` in `packages/runtime/src/main.ts` implement similar semver parsing. Consolidating reduces drift if comparison rules change.

---

## Platform completeness (documented gaps)

- **Windows/Linux integrity metadata.** `packages/installer/src/integrity.ts` explicitly skips updating plist-equivalent integrity on non-macOS; comments note reliance on fuse behavior. If Electron changes validation on those platforms, installs could break silently—worth tracking as platform-specific follow-up.
- **Windows watcher.** `packages/installer/src/watcher.ts` notes that scheduled-task quoting is unfinished/TODO and lacks parity with macOS `WatchPaths` / Linux path units for detecting app updates. Users on Windows may rely only on logon/daily tasks, not file-change triggers.

---

## Operational and UX risks

- **`copy-assets` can silently ship incomplete packages.** `packages/installer/scripts/copy-assets.mjs` warns and **skips** missing `loader` or `runtime` paths instead of failing the build. A misordered or partial `npm run build` could publish an installer without bundled assets.
- **systemd watcher install failures are swallowed.** `installSystemd` catches errors and continues; the CLI may report success while timers/paths were never enabled—harder to diagnose on minimal Linux setups without user notifications.
- **GitHub API usage.** Update checks use `fetch` to `api.github.com` without authentication. Anonymous rate limits (especially for many tweaks or shared IPs) can cause frequent `error` fields in cached state; documenting limits or optional `GITHUB_TOKEN` support would improve reliability.

---

## Runtime behavior and security notes

- **Diagnostic logging is very verbose.** `main.ts` registers `web-contents-created` logging for every web contents instance (including sandbox/context isolation fields). In daily use this may flood `main.log` and I/O; consider gating behind an env flag like other diagnostics.
- **Remote debugging is env-gated but powerful.** `CODEXPP_REMOTE_DEBUG` enables `--remote-debugging-port`. Worth keeping documented in `SECURITY.md` as an intentional escape hatch for power users.
- **IPC surface is large.** Handlers use consistent namespacing (`codexpp:*`); some paths validate tweak directories, others trust renderer-supplied paths where documented (`read-tweak-source`, `read-tweak-asset`). Ongoing review when adding handlers remains important.

---

## Minor consistency items

- **`makeLogger` maps `debug` → `info`.** Debug-level messages from tweaks are not distinguished in logs; if Codex++ ever exposes log levels in UI, this mapping may need revisiting.
- **Manifest validation:** `tweak-discovery` requires `githubRepo` and skips invalid manifests silently (no user-visible parse errors). Surfacing “skipped tweak X: reason” in logs or doctor output would improve author experience.

---

## Positive observations

- Clear separation: installer (patch/sign), runtime (preload + tweak lifecycle), SDK types for authors.
- Defensive comments around Electron preload registration (`registerPreloadScript` vs `setPreloads`) show awareness of sandbox pitfalls.
- Install flow documents backup, integrity, fuse, and re-sign steps; `SECURITY.md` is referenced from the README for threat model.

---

*Generated as a static review; no runtime or cross-platform install tests were executed in this pass.*
