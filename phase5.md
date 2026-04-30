# Phase 5 UI/UX Review

## Goal

Phase 4 made the in-app management surface coherent. Phase 5 should make it
feel durable under real use: keyboard-friendly, responsive with long content,
clear during async work, safer around external navigation, and more useful when
something is broken.

This phase is intentionally still UI/UX-focused. It does not add marketplace
browsing, automatic tweak updates, new sandbox enforcement, or a native
installer UI.

## Implementation Status

Phase 5 is implemented as a UI/UX hardening pass. The Settings UI now preserves
search focus while filtering, guards stale Config async responses, uses real
runtime paths for support actions, shows clearer pending/disabled states, routes
external links consistently, and exposes Trust details for computed capability
labels.

Config can create a redacted runtime support bundle in-app, copy diagnostics
JSON, reveal the most recent bundle, and still copy CLI fallback commands. The
runtime support bundle excludes tweak source and arbitrary files, redacts
sensitive state/config values, and bounds log tails.

The CLI now supports `codex-plusplus tweaks list --json` and
`codex-plusplus tweaks list --verbose`, with grouped human output and the same
capability descriptions used by the UI. Deterministic visual review artifacts
can be generated with the runtime `fixtures:settings` scripts.

## Current State

- Codex Settings has a single Codex Plus Plus group with Config and Tweaks.
- Tweaks are grouped by Needs Attention, Updates Available, Enabled, and
  Disabled.
- Search and status filters exist.
- Config shows install health and support/maintenance actions.
- Main Process Access is surfaced as a stronger trust signal.
- DOM fixture tests cover the main happy, empty, error, and remount states.

The surface is shippable, but several interaction details still feel alpha:

- Search/filter rerenders are broad enough to disrupt focus and transient UI.
- Disabled/pending states do not always explain what is happening.
- Long tweak metadata can crowd action controls on narrow widths.
- The support hub still copies commands instead of helping users complete the
  support task in-app.
- The test fixture does not yet produce reviewable visual artifacts.

## Review Findings

### 1. Search likely loses focus while typing

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/test/settings-injector.test.ts`

Evidence:

- `input` on the search control writes `state.tweaksSearch` and immediately
  calls `rerender()` (`settings-injector.ts`, around `tweaksToolbar()`).
- `rerender()` replaces the active panel contents, which means the input node
  the user was typing in is destroyed and recreated.

Impact:

- Typing more than one character can become painful or impossible in real
  Codex, depending on focus restoration behavior.

Recommendation:

- Preserve focus and selection across Tweaks rerenders, or filter the existing
  DOM in place for search changes.
- Add a regression test that types multiple characters and asserts focus,
  selection, and final filtered rows are preserved.

### 2. Pending and disabled states need stronger affordances

Files:

- `packages/runtime/src/preload/settings-injector.ts`

Evidence:

- Icon-only toolbar buttons keep an empty `data-codexpp-label`, so
  `setButtonPending()` disables them but cannot show "Reloading" or "Opening".
- `switchControl()` uses the same base classes when disabled and relies mostly
  on nearby row opacity.
- Non-loadable toggles are disabled, but the disabled control itself does not
  expose a reason beyond nearby text.

Impact:

- Users can click actions and see little visible confirmation, especially on
  icon-only controls.
- Disabled switches may look like normal off switches.

Recommendation:

- Add a compact spinner/progress glyph for icon buttons.
- Add disabled switch styling and `aria-describedby` pointing to the load
  reason.
- Add tests for icon pending states and disabled reason wiring.

### 3. Config "Open logs" can reveal a placeholder path

Files:

- `packages/runtime/src/preload/settings-injector.ts`

Evidence:

- The Open logs action falls back to `"<user dir>/log"` when
  `codexpp:runtime-health` is unavailable.

Impact:

- In a degraded install, clicking Open logs can attempt to reveal a fake path,
  which is exactly when the support flow needs to be most reliable.

Recommendation:

- Use `codexpp:user-paths` as a fallback for tweak/log paths, or disable the
  Open logs action with an inline error when no real path is available.
- Add a test where runtime health fails and the maintenance action still uses a
  real log path or renders a useful failure.

### 4. Async errors can stack or update stale panels

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/test/settings-injector.test.ts`

Evidence:

- Update-check failures insert a new error row after the update row each time.
- Config health and update promises mutate their captured card even if the user
  navigates away and back before the promise resolves.

Impact:

- Repeated failures can clutter Config with duplicate error rows.
- Slow IPC calls can paint stale results into detached DOM or overwrite newer
  state if future UI adds concurrent refreshes.

Recommendation:

- Move async status into keyed state, render it declaratively, and ignore stale
  promises using request tokens.
- Add delayed-promise tests for repeated failures and navigation-away behavior.

### 5. External links are handled inconsistently

Files:

- `packages/runtime/src/preload/settings-injector.ts`

Evidence:

- GitHub repo clicks call `codexpp:open-external`.
- Homepage links are plain anchors with `target="_blank"`.

Impact:

- Depending on Electron sandbox/window behavior, homepage clicks may be less
  controlled than repo/release links.

Recommendation:

- Route all external links through the same IPC helper.
- Add URL validation before opening external links.
- Add tests for repository, homepage, release, and report-bug links.

### 6. Narrow viewport and long-content behavior is under-tested

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/test/fixtures/settings-ui-fixture.ts`

Evidence:

- Tweak rows use a left text stack plus shrink-0 action controls.
- Title/meta rows can contain long tweak names, repository names, tags, and
  capability labels.
- The fixture has a fixed 640px content width and no assertions for overflow,
  wrapping, or compact action placement.

Impact:

- Long names or many tags can crowd toggles and action buttons, especially in
  narrow Codex windows or high zoom.

Recommendation:

- Add fixture states for narrow width, very long names, many tags, many
  capabilities, missing icons, and update/action combinations.
- Adjust row layout to wrap actions beneath metadata below a width threshold.

### 7. Support hub should complete more tasks in-app

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/src/main.ts`
- `packages/installer/src/commands/support.ts`

Evidence:

- Config copies commands such as `codex-plusplus support bundle` and
  `codex-plusplus uninstall`, but does not create a support bundle or copy
  runtime diagnostics directly.

Impact:

- Users in a broken state still need to leave Codex, open a terminal, and know
  where the output landed.

Recommendation:

- Add safe runtime IPC helpers for:
  - copying `status --json`-equivalent runtime/install diagnostics
  - creating or revealing a support bundle through the installed CLI/runtime
  - copying the support bundle path after creation
- Keep command-copy rows as a fallback.

### 8. Capability/trust labels need explanatory disclosure

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/installer/src/commands/tweaks.ts`
- `SECURITY.md`

Evidence:

- Capability labels are friendlier now, but they are still chips without
  contextual definitions in the UI or CLI.

Impact:

- "Main Process Access" is clear, but labels such as "Scoped IPC" and "Custom
  Entry" still require prior knowledge.

Recommendation:

- Add an inline "Trust details" disclosure per tweak with one-sentence
  explanations for each capability.
- Mirror the same descriptions in `codex-plusplus tweaks list --verbose`.

### 9. CLI support UX lags behind the in-app surface

Files:

- `packages/installer/src/commands/tweaks.ts`
- `packages/installer/src/cli.ts`

Evidence:

- `tweaks list` prints a flat list with colored status and capability strings.
- There is no `--json`, `--verbose`, or grouped output.

Impact:

- Support, CI, and issue templates cannot easily consume tweak status.
- Terminal users do not get the same Needs Attention / Updates Available /
  Enabled / Disabled mental model as the app.

Recommendation:

- Add `codex-plusplus tweaks list --json`.
- Group human output by status and include trust details in `--verbose`.
- Align headings with the in-app groups where the available data supports it.

### 10. Visual review artifacts are still too implicit

Files:

- `packages/runtime/test/fixtures/settings-ui-fixture.ts`
- `packages/runtime/test/settings-injector.test.ts`

Evidence:

- The fixture exists for DOM tests, but there is no stable HTML fixture page,
  screenshot command, or golden artifact path for manual review.

Impact:

- Future UI changes can pass tests while still regressing density, wrapping,
  or visual hierarchy.

Recommendation:

- Add a dev-only fixture renderer that outputs representative Config/Tweaks
  states to deterministic HTML.
- Add a documented screenshot command using the existing browser tooling.
- Keep screenshots out of required tests unless they become stable enough.

## P1 Tasks

### 1. Fix search/filter interaction stability

- Preserve search input focus and selection while filtering.
- Avoid full-panel rerenders for simple search input when practical.
- Keep filter/search state stable across reloads and remounts.
- Add DOM tests for multi-character typing, focus retention, and no duplicate
  rows.

### 2. Harden Config support actions

- Replace placeholder path fallbacks with real `codexpp:user-paths` data or
  disabled/error states.
- Deduplicate update-check and health error messages.
- Add request tokens so stale async results cannot overwrite newer renders.
- Add tests for failed health, repeated update errors, and navigation during a
  pending Config request.

### 3. Improve async and disabled affordances

- Add visible pending indicators for icon-only buttons.
- Add clear disabled styling for switches.
- Wire unavailable switches to load-reason text with accessible descriptions.
- Add tests for pending icon buttons and disabled reason accessibility.

### 4. Normalize external navigation

- Route homepage links through `codexpp:open-external`.
- Validate external URL schemes before opening.
- Add tests for homepage, repo, release, and report-bug links.

## P2 Tasks

### 5. Make rows responsive and resilient to long content

- Add narrow-width fixture states for long tweak names, many tags, many
  capability labels, missing icons, update buttons, and disabled rows.
- Let action controls wrap below metadata on narrow widths.
- Add CSS/class adjustments so long repository names and paths cannot force
  horizontal overflow.

### 6. Add trust details disclosure

- Add a compact per-tweak "Trust details" disclosure.
- Explain each computed capability in one short sentence.
- Keep Main Process Access visually stronger than other labels.
- Add equivalent `tweaks list --verbose` output.

### 7. Improve terminal parity

- Add `codex-plusplus tweaks list --json`.
- Group human tweak-list output by actionable state.
- Include unavailable/incompatible reasons in a copy-paste-friendly shape.

## P3 Tasks

### 8. Add deterministic visual review harness

- Add a dev-only fixture page or script that renders representative Settings
  states without a real Codex app.
- Document how to open or screenshot:
  - empty install
  - healthy mixed tweaks
  - needs-attention state
  - many tags/capabilities
  - failed update check
  - unhealthy Config diagnostics

### 9. One-click support follow-through

- Explore a safe IPC path for creating and revealing support bundles from
  Config.
- Add "Copy diagnostics JSON" for runtime health and install status.
- Keep command-copy fallbacks visible for users who prefer terminal workflows.

## Test Plan

- Focused runtime DOM tests for:
  - search focus retention
  - filter/search state after rerender
  - unavailable switch `aria-describedby`
  - icon button pending state
  - repeated Config errors without duplicate rows
  - stale async Config requests ignored
  - homepage/release/repo/report-bug external navigation
  - narrow fixture content with long names/tags/capabilities
- Installer CLI tests for:
  - `tweaks list --json`
  - grouped human tweak output
  - `--verbose` capability descriptions
- Full validation:
  - `npm test`
  - `npm run build`
  - `npm run check`

## Out of Scope

- Marketplace or remote tweak browsing.
- Automatic tweak update installation.
- New runtime permission enforcement.
- React rewrite of the injected UI.
- Native installer UI.

## Suggested Delivery Order

1. Fix search focus retention and stale async state.
2. Tighten disabled/pending affordances.
3. Normalize external link handling.
4. Add responsive long-content fixture coverage and layout fixes.
5. Add trust details disclosure and CLI `--verbose` parity.
6. Add `tweaks list --json`.
7. Add deterministic visual review harness and docs.
