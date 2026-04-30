# Security Policy

## Supported Versions

Only the latest released version receives security fixes while the project is in alpha.

## Reporting a Vulnerability

Report security issues privately to the repository maintainers. Do not open a public issue for suspected exploit paths.

Include:

- Affected version or commit.
- Platform and Codex app version.
- Reproduction steps.
- Impact and any proof-of-concept details.

## Tweak Update Policy

Tweaks are local code and should be treated as untrusted until reviewed. Codex++ checks GitHub Releases once per day and displays update availability, but it never downloads, installs, or replaces tweak code automatically.

Before updating a tweak, review the release notes, changed files, repository ownership, and any new permissions or network behavior.

## Runtime Boundaries

Renderer tweaks run in the preload context and can modify the Codex UI. Main-process tweaks can use the main-process API exposed by Codex++. Install only tweaks from sources you trust.

Codex++ surfaces capability labels in Settings and `tweaks list` to make that
trust decision easier:

- Renderer UI: can affect Codex's renderer/preload UI.
- Main Process Access: can run in Electron's main process and is more powerful.
- Local Data Storage: can read/write its own Codex++ data directory.
- Custom Entry: uses a non-default manifest entry file.
- Runtime Requirement: declares a minimum Codex++ runtime.

These labels are informational. They do not add OS-level sandboxing or make
unreviewed tweak code safe. The UI asks once per session before enabling a
main-process-capable tweak as a reminder to review the source.
