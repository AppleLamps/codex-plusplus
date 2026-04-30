# Phase 4 UI/UX Plan

## Goal

Make Codex++ feel like a polished, trustworthy part of Codex rather than a
developer diagnostic panel. Phase 4 should improve the in-app Settings
experience, make tweak status and safety easier to understand, reduce rough
edges in maintenance flows, and add enough UI-focused tests to keep the
injection layer stable.

## Implementation Status

Phase 4 is implemented in the runtime Settings injector and packaged installer
assets. The normal in-app management surface is now the Codex Plus Plus Config
and Tweaks pages only; the older duplicate manager preload module was removed
from startup and from generated runtime assets.

The Tweaks page now groups rows by Needs Attention, Updates Available, Enabled,
and Disabled, with search, status filtering, disabled unavailable toggles,
friendly capability labels, update actions, and inline async feedback. Tweaks
with Main Process Access get stronger warning treatment and a once-per-renderer
session confirmation before enablement.

The Config page now acts as the support hub: Codex++ update controls stay at
the top, install health summarizes runtime version, tweak/log paths, reload
status, and recent runtime errors, and maintenance rows open folders or copy the
recommended `codex-plusplus` support commands.

UI regression coverage lives in
`packages/runtime/test/settings-injector.test.ts`, with the deterministic mocked
Codex Settings fixture in
`packages/runtime/test/fixtures/settings-ui-fixture.ts`.

## Pre-Implementation Review

Phase 3 left the runtime in a solid technical state:

- Codex++ injects a sidebar group into Codex Settings.
- Config and Tweaks pages render inside Codex's existing settings surface.
- Tweaks show loadability, update availability, capability labels, and enable
  toggles.
- Runtime health diagnostics exist but are compact and mostly text-only.
- DOM fixture tests cover basic sidebar injection, unavailable tweaks,
  capability labels, and remount recovery.

The UX is functional, but still alpha-shaped:

- The Tweaks page is a dense list without filtering, grouping, or clear
  primary/secondary actions.
- Capability labels are exposed as raw chips, not an understandable trust
  summary.
- Enable/disable changes trigger reload behavior without much visible feedback.
- Empty, loading, error, and degraded-health states are present only in narrow
  places.
- Maintenance actions are scattered between Config, CLI docs, and diagnostics.
- The pre-Phase-4 tree still carried an older inline-styled Tweak Manager
  section that overlapped with the newer full Tweaks page.

## UX Principles

- Match Codex's settings UI: quiet, compact, utility-first, and built for
  repeated use.
- Prefer clear states over clever visuals: installed, disabled, unavailable,
  update available, needs attention, and healthy should be instantly scannable.
- Treat security and trust as product UX, not just documentation.
- Keep the default view calm; put advanced diagnostics behind progressive
  disclosure.
- Avoid introducing a design system dependency. Build reusable DOM helpers that
  emit Codex-token classes consistently.

## Review Findings

### 1. The Tweaks page needs information architecture

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/test/settings-injector.test.ts`

Findings:

- All tweaks are rendered as one card, so a mixed set of enabled, disabled,
  incompatible, and update-available tweaks is hard to scan.
- There is no search/filter affordance.
- Important statuses compete visually with tags and capability chips.
- The toggle is always visually available, even when a tweak is unavailable.

### 2. Capability labels need friendlier trust UX

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/src/preload/manager.ts`
- `packages/installer/src/commands/tweaks.ts`
- `docs/WRITING-TWEAKS.md`
- `SECURITY.md`

Findings:

- Labels like `main process` and `scoped IPC` are accurate but not enough for
  users to decide whether a tweak is safe to enable.
- Main-scope tweaks should get stronger visual treatment and a short
  explanation.
- The CLI and UI should use the same terminology.

### 3. Config and Maintenance are too sparse

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/installer/src/commands/support.ts`
- `docs/TROUBLESHOOTING.md`

Findings:

- Config currently mixes update settings and maintenance actions, but does not
  show install health, app path, runtime path, or support bundle guidance.
- Users who hit a broken state need a "what should I do next?" flow, not just
  raw diagnostics.
- The copy-command uninstall action is brittle and macOS-centric.

### 4. Runtime diagnostics should be progressive

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/src/preload/manager.ts`
- `packages/runtime/src/health.ts`

Findings:

- Health data is useful but currently reads like a sentence of debug text.
- Recent runtime errors are not visible in the primary UI.
- Healthy states should be compact; unhealthy states should show actionable
  next steps.

### 5. UI code needs local component primitives

Files:

- `packages/runtime/src/preload/settings-injector.ts`
- `packages/runtime/src/preload/manager.ts`

Findings:

- UI helpers exist (`roundedCard`, `compactButton`, `rowSimple`,
  `switchControl`) but are uneven and page-specific.
- The older `manager.ts` uses inline CSS and duplicates a smaller Tweak Manager
  experience now covered by the injected Tweaks page.
- Building small primitives for rows, badges, notices, toolbars, and status
  indicators will make Phase 4 safer than doing one-off DOM manipulation.

### 6. UI tests should verify states, not just existence

Files:

- `packages/runtime/test/settings-injector.test.ts`

Findings:

- Current tests prove injection works, but not layout-level states such as
  filtering, disabled controls, update badges, trust warnings, reload progress,
  diagnostics expansion, or no-overlap markup constraints.
- There is no snapshot-like HTML fixture for representative tweak lists.

## P1 Tasks

### 1. Redesign the Tweaks page around status groups

Implementation:

- Replace the single installed-tweaks card with grouped sections:
  - Needs attention: incompatible, missing entry, failed load, runtime errors.
  - Updates available.
  - Enabled.
  - Disabled.
- Keep groups hidden when empty to preserve calm density.
- Add a compact toolbar with:
  - search input
  - status filter segmented control
  - reload button
  - open tweaks folder button
- Disable enable toggles for non-loadable tweaks and show the reason inline.
- Make update actions secondary but clear: "View release" only when a release
  URL exists.

Acceptance checks:

- A mixed tweak list is scannable without reading every row.
- Empty groups do not render.
- Non-loadable tweaks cannot be toggled from the UI.
- Search/filter state does not duplicate or lose tweak rows after reload.

### 2. Improve trust and capability presentation

Implementation:

- Convert raw capability chips into a trust summary row:
  - Renderer UI
  - Main process access
  - Local data storage
  - Custom entry
  - Runtime requirement
- Add a stronger warning treatment for main-process access:
  - visible badge in the row
  - short explanatory text in expanded details
  - optional confirm dialog when enabling a main-process tweak for the first
    time in that session
- Keep the underlying capability metadata unchanged.
- Align CLI terms with the UI labels.

Acceptance checks:

- Main-scope access is obvious before enabling.
- Existing renderer-only tweaks do not feel scary or noisy.
- Docs and CLI use the same capability names.

### 3. Add first-class UI states

Implementation:

- Add reusable UI helpers for:
  - status badge
  - notice banner
  - empty state
  - loading row
  - error row
  - toolbar button
  - icon button with `aria-label`
- Use those helpers across Config, Tweaks, registered tweak sections, and
  diagnostics.
- Add visible pending state when:
  - toggling a tweak
  - forcing reload
  - checking for Codex++ updates
- Show success/failure feedback after async actions.

Acceptance checks:

- Async actions never look inert.
- Errors surface next to the action that failed.
- Buttons expose accessible labels and disabled states.

### 4. Make Config a support/maintenance hub

Implementation:

- Keep update settings at the top.
- Add an "Install Health" card using runtime health and user paths:
  - runtime version
  - tweaks directory
  - log directory
  - last reload status
  - recent errors count
- Add maintenance actions:
  - open tweaks folder
  - open logs
  - copy status command
  - copy support bundle command
  - copy uninstall command
- Avoid platform-specific hardcoded paths in copied commands where possible;
  prefer `codex-plusplus ...` commands.

Acceptance checks:

- Users can find support actions without reading docs.
- Healthy installs stay visually quiet.
- Unhealthy installs show next steps.

## P2 Tasks

### 5. Retire the older manager section

Implementation:

- Remove `packages/runtime/src/preload/manager.ts` because the full Tweaks page
  supersedes it.
- Avoid showing two different Tweak Manager experiences in normal operation.
- Keep any useful helper behavior by moving it into the new UI primitives.

Acceptance checks:

- Normal Settings has one coherent Codex++ tweak-management surface.
- No duplicated tweak lists or conflicting action labels remain.

### 6. Add richer DOM fixture coverage

Implementation:

- Extend `settings-injector.test.ts` with representative fixtures:
  - no tweaks installed
  - enabled renderer tweak
  - disabled tweak
  - update available
  - incompatible tweak
  - main-process tweak
  - runtime-health warning
  - failed async action
- Assert semantic behavior:
  - groups and filters
  - disabled toggles
  - warning copy
  - pending/success/error feedback
  - no duplicate nav/groups after remount
- Add targeted markup assertions for accessible labels and button roles.

Acceptance checks:

- UI regressions fail in `npm test`.
- Tests remain independent of a real Codex app.

### 7. Improve author-facing page UX

Implementation:

- For tweak-registered settings pages, add a consistent header treatment:
  - tweak name
  - page title
  - trust badge if main/both scoped
  - optional description
- Make render errors appear as polished error rows instead of plain text.
- Ensure page teardown/re-render keeps nav active state consistent.

Acceptance checks:

- Third-party tweak pages feel like part of the same settings product.
- Render failures are understandable and do not break the rest of Settings.

## P3 Tasks

### 8. Add screenshots or visual review artifacts

Implementation:

- Add a small local fixture page or test harness that renders the settings UI
  with mocked IPC data.
- Use it for manual screenshots of:
  - empty state
  - healthy installed tweaks
  - needs-attention state
  - main-process warning
  - diagnostics expanded
- Do not require a real Codex app for these screenshots.

Acceptance checks:

- Design review can happen from deterministic fixtures.
- Future UI changes can be compared against known states.

### 9. Polish docs around the user journey

Implementation:

- Update README with a short "Using the Tweak Manager" section.
- Update troubleshooting with in-app support-bundle guidance.
- Update writing-tweaks docs with screenshots or descriptions of how manifest
  fields appear in the manager.

Acceptance checks:

- A new user can install, find Tweaks, understand statuses, and collect support
  diagnostics without reverse-engineering CLI commands.

## Suggested Delivery Order

1. Create UI primitives in `settings-injector.ts` or a small adjacent module.
2. Redesign Tweaks page grouping, toolbar, and states.
3. Improve trust/capability copy and main-process warning.
4. Redesign Config as maintenance/support hub.
5. Retire or re-scope `manager.ts`.
6. Expand DOM fixture tests.
7. Regenerate packaged runtime assets.
8. Update docs and screenshots/fixtures.

## Validation

- `npm test`
- `npm run build`
- `npm run check`
- Manual DOM fixture review for:
  - narrow viewport
  - long tweak names
  - many tags/capabilities
  - missing icons
  - failed update check
  - unavailable tweak
- Manual Codex smoke test when available:
  - open Settings
  - switch Codex++ Config/Tweaks pages
  - search/filter tweaks
  - enable/disable tweak
  - force reload
  - open logs/tweaks folder

## Out of Scope for Phase 4

- Marketplace or remote tweak browsing.
- Automatic tweak updates.
- New sandbox enforcement beyond current capability labels.
- Replacing the injection architecture with a full React integration.
- Native installer UI.

## Notes

- Phase 4 should prioritize clarity and trust over decoration.
- The in-app UI should remain compact and Codex-native; avoid a marketing-style
  dashboard.
- Any UI code refactor should be paired with DOM fixture tests before visual
  polish expands the surface area.
