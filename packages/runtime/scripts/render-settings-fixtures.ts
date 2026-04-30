import Module from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setupSettingsDom } from "../test/fixtures/settings-ui-fixture";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "visual-review", "settings-ui");
const writeScreenshots = process.argv.includes("--screenshots");

const ipcOverrides = new Map<string, () => Promise<unknown>>();
const electronMock = {
  ipcRenderer: {
    send() {},
    invoke(channel: string) {
      const override = ipcOverrides.get(channel);
      if (override) return override();
      if (channel === "codexpp:read-tweak-asset") return Promise.resolve(null);
      if (channel === "codexpp:open-external") return Promise.resolve(undefined);
      if (channel === "codexpp:set-tweak-enabled") return Promise.resolve(true);
      if (channel === "codexpp:reload-tweaks") return Promise.resolve({ at: Date.now(), count: 1 });
      if (channel === "codexpp:reveal") return Promise.resolve(undefined);
      if (channel === "codexpp:copy-text") return Promise.resolve(true);
      if (channel === "codexpp:copy-diagnostics-json") return Promise.resolve({ json: "{}" });
      if (channel === "codexpp:create-support-bundle") return Promise.resolve({ dir: "/user/codex-plusplus/support/demo" });
      if (channel === "codexpp:user-paths") return Promise.resolve(defaultHealth.paths);
      if (channel === "codexpp:runtime-health") return Promise.resolve(defaultHealth);
      if (channel === "codexpp:get-config") {
        return Promise.resolve({ version: "0.1.0", autoUpdate: true, updateCheck: null });
      }
      if (channel === "codexpp:check-codexpp-update") {
        return Promise.resolve({
          checkedAt: "2026-01-01T00:03:00.000Z",
          currentVersion: "0.1.0",
          latestVersion: "0.1.0",
          releaseUrl: "https://github.com/AppleLamps/codex-plusplus/releases",
          releaseNotes: "No changes.",
          updateAvailable: false,
        });
      }
      return Promise.resolve(null);
    },
  },
};

const moduleLoader = Module as unknown as {
  _load: (request: string, parent?: unknown, isMain?: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") return electronMock;
  return originalLoad.call(this, request, parent, isMain);
};

let injector: typeof import("../src/preload/settings-injector");

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  injector = await import("../src/preload/settings-injector");

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  await render("empty-tweaks", "tweaks", []);
  await render("healthy-mixed", "tweaks", [
    tweak("enabled", { name: "Enabled Tweak" }),
    tweak("disabled", { name: "Disabled Tweak", enabled: false }),
    tweak("update", { name: "Update Tweak", updateAvailable: true }),
  ]);
  await render("needs-attention", "tweaks", [
    tweak("future", { name: "Future Tweak", loadable: false, loadError: "requires Codex++ 99.0.0 or newer" }),
  ]);
  await render("long-content", "tweaks", [
    tweak("long", {
      name: "A Very Long Tweak Name That Should Wrap Cleanly In Narrow Codex Windows",
      updateAvailable: true,
      homepage: "https://example.com/a/very/long/path",
      tags: ["very-long-tag-name", "another-layout-stress-tag"],
      capabilities: ["Renderer UI", "Main Process Access", "Local Data Storage", "Scoped IPC", "Custom Entry"],
    }),
  ], { width: 320 });
  await render("unhealthy-config", "config", [], {
    health: {
      ...defaultHealth,
      recentErrors: [{ at: "2026-01-01T00:04:00.000Z", level: "error", message: "preload failed" }],
    },
  });

  console.log(`Wrote settings UI fixtures to ${outDir}`);
}

async function render(
  name: string,
  page: "config" | "tweaks",
  tweaks: ReturnType<typeof tweak>[],
  opts: { width?: number; health?: typeof defaultHealth } = {},
): Promise<void> {
  ipcOverrides.clear();
  if (opts.health) ipcOverrides.set("codexpp:runtime-health", () => Promise.resolve(opts.health));
  setupSettingsDom({ width: opts.width });
  injector.__resetSettingsInjectorForTests();
  injector.setListedTweaks(tweaks);
  injector.__tryInjectForTests();
  click(`[data-codexpp="nav-${page}"]`);
  await flush();
  const html = pageHtml(name, document.body.innerHTML);
  writeFileSync(resolve(outDir, `${name}.html`), html);
  if (writeScreenshots) {
    writeFileSync(resolve(outDir, `${name}.svg`), screenshotSvg(name, document.body.innerHTML));
  }
}

function pageHtml(title: string, body: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Codex++ ${title}</title>
    <style>
      body { margin: 0; font: 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2328; background: #f6f8fa; }
      .flex { display: flex; } .flex-col { flex-direction: column; } .flex-wrap { flex-wrap: wrap; }
      .items-center { align-items: center; } .items-start { align-items: flex-start; } .justify-between { justify-content: space-between; }
      .gap-1 { gap: 4px; } .gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .gap-4 { gap: 16px; }
      .p-3 { padding: 12px; } .px-2 { padding-left: 8px; padding-right: 8px; } .py-0\\.5 { padding-top: 2px; padding-bottom: 2px; }
      .rounded-lg { border-radius: 8px; } .rounded-md { border-radius: 6px; } .rounded-full { border-radius: 999px; }
      .border { border: 1px solid #d0d7de; } .border-t-\\[0\\.5px\\] { border-top: 1px solid #d0d7de; }
      .text-xs { font-size: 12px; } .text-sm { font-size: 14px; } .text-base { font-size: 16px; } .font-medium { font-weight: 600; }
      .text-token-text-secondary, .text-token-description-foreground { color: #57606a; }
      .text-token-text-primary { color: #1f2328; } .text-token-text-link-foreground { color: #0969da; }
      .text-token-charts-red { color: #cf222e; } .text-token-charts-green { color: #1a7f37; }
      .bg-token-foreground\\/5 { background: rgba(31,35,40,.05); } .bg-token-foreground\\/20 { background: rgba(31,35,40,.2); }
      .h-8 { height: 32px; } .w-8 { width: 32px; } .min-w-0 { min-width: 0; } .break-all { word-break: break-all; } .break-words { overflow-wrap: anywhere; }
      aside { width: 220px; padding: 16px; border-right: 1px solid #d0d7de; }
      main, .main-surface { flex: 1; min-width: 0; } button { font: inherit; } input { font: inherit; }
      [data-codexpp="panel-host"] { width: 100%; } .mx-auto { margin-left: auto; margin-right: auto; } .max-w-2xl { max-width: 672px; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function screenshotSvg(title: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720">
  <rect width="960" height="720" fill="#f6f8fa"/>
  <foreignObject width="960" height="680">
    <div xmlns="http://www.w3.org/1999/xhtml">
      <style>
        body { margin: 0; font: 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2328; background: #f6f8fa; }
        .flex { display: flex; } .flex-col { flex-direction: column; } .flex-wrap { flex-wrap: wrap; }
        .items-center { align-items: center; } .items-start { align-items: flex-start; } .justify-between { justify-content: space-between; }
        .gap-1 { gap: 4px; } .gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .gap-4 { gap: 16px; }
        .p-3 { padding: 12px; } .px-2 { padding-left: 8px; padding-right: 8px; }
        .rounded-lg { border-radius: 8px; } .rounded-md { border-radius: 6px; } .rounded-full { border-radius: 999px; }
        .border { border: 1px solid #d0d7de; } .text-xs { font-size: 12px; } .text-sm { font-size: 14px; } .text-base { font-size: 16px; } .font-medium { font-weight: 600; }
        .text-token-text-secondary, .text-token-description-foreground { color: #57606a; }
        .text-token-text-primary { color: #1f2328; } .text-token-text-link-foreground { color: #0969da; }
        .text-token-charts-red { color: #cf222e; } .text-token-charts-green { color: #1a7f37; }
        .bg-token-foreground\\/5 { background: rgba(31,35,40,.05); } .min-w-0 { min-width: 0; } .break-all { word-break: break-all; } .break-words { overflow-wrap: anywhere; }
        aside { width: 220px; padding: 16px; border-right: 1px solid #d0d7de; }
        main, .main-surface { flex: 1; min-width: 0; } button { font: inherit; } input { font: inherit; }
      </style>
      ${body}
    </div>
  </foreignObject>
  <text x="16" y="704" font-family="system-ui" font-size="14">${escapeXml(title)}</text>
</svg>`;
}

function tweak(
  id: string,
  patch: Partial<{
    name: string;
    enabled: boolean;
    loadable: boolean;
    loadError: string;
    capabilities: string[];
    updateAvailable: boolean;
    homepage: string;
    tags: string[];
  }> = {},
) {
  return {
    manifest: {
      id,
      name: patch.name ?? id,
      version: "1.0.0",
      githubRepo: "owner/repo",
      description: `${patch.name ?? id} description`,
      ...(patch.homepage ? { homepage: patch.homepage } : {}),
      ...(patch.tags ? { tags: patch.tags } : {}),
    },
    entry: `/tmp/${id}/index.js`,
    dir: `/tmp/${id}`,
    entryExists: true,
    enabled: patch.enabled ?? true,
    loadable: patch.loadable ?? true,
    ...(patch.loadError ? { loadError: patch.loadError } : {}),
    update: patch.updateAvailable ? {
      checkedAt: "2026-01-01T00:01:00.000Z",
      repo: "owner/repo",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      latestTag: "v1.1.0",
      releaseUrl: "https://github.com/owner/repo/releases/tag/v1.1.0",
      updateAvailable: true,
    } : null,
    capabilities: patch.capabilities ?? ["Renderer UI", "Local Data Storage", "Scoped IPC"],
  };
}

function click(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.click();
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const defaultHealth = {
  version: "0.1.0",
  paths: {
    userRoot: "/user/codex-plusplus",
    runtimeDir: "/user/codex-plusplus/runtime",
    tweaksDir: "/user/codex-plusplus/tweaks",
    logDir: "/user/codex-plusplus/log",
  },
  tweaks: { discovered: 2, loadedMain: 1, loadedRenderer: null },
  startedAt: "2026-01-01T00:00:00.000Z",
  lastReload: { at: "2026-01-01T00:02:00.000Z", reason: "manual", ok: true },
  recentErrors: [] as Array<{ at: string; level: "warn" | "error"; message: string }>,
};
