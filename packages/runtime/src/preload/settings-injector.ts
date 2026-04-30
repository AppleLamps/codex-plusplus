/**
 * Settings injector for Codex's Settings page.
 *
 * Codex's settings is a routed page (URL stays at `/index.html?hostId=local`)
 * NOT a modal dialog. The sidebar lives inside a `<div class="flex flex-col
 * gap-1 gap-0">` wrapper that holds one or more `<div class="flex flex-col
 * gap-px">` groups of buttons. There are no stable `role` / `aria-label` /
 * `data-testid` hooks on the shell so we identify the sidebar by text-content
 * match against known item labels (General, Appearance, Configuration, …).
 *
 * Layout we inject:
 *
 *   [Codex's existing items group]
 *   ───────────────────────────── (border-t-token-border)
 *   CODEX PLUS PLUS               (uppercase subtitle, text-token-text-tertiary)
 *   ⓘ Config
 *   ☰ Tweaks
 *
 * Clicking Config / Tweaks hides Codex's content panel children and renders
 * our own `main-surface` panel in their place. Clicking any of Codex's
 * sidebar items restores the original view.
 */

import { ipcRenderer } from "electron";
import type {
  SettingsSection,
  SettingsPage,
  SettingsHandle,
  TweakManifest,
} from "@codex-plusplus/sdk";

// Mirrors the runtime's main-side ListedTweak shape (kept in sync manually).
interface ListedTweak {
  manifest: TweakManifest;
  entry: string;
  dir: string;
  entryExists: boolean;
  enabled: boolean;
  loadable: boolean;
  loadError?: string;
  capabilities?: string[];
  update: TweakUpdateCheck | null;
}

interface TweakUpdateCheck {
  checkedAt: string;
  repo: string;
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
  error?: string;
}

interface CodexPlusPlusConfig {
  version: string;
  autoUpdate: boolean;
  updateCheck: CodexPlusPlusUpdateCheck | null;
}

interface CodexPlusPlusUpdateCheck {
  checkedAt: string;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  updateAvailable: boolean;
  error?: string;
}

interface RuntimeHealth {
  version: string;
  paths: {
    userRoot: string;
    runtimeDir: string;
    tweaksDir: string;
    logDir: string;
  };
  tweaks: {
    discovered: number;
    loadedMain: number;
    loadedRenderer: number | null;
  };
  startedAt: string;
  lastReload: { at: string; reason: string; ok: boolean; error?: string } | null;
  recentErrors: Array<{ at: string; level: "warn" | "error"; message: string }>;
}

type TweakStatusFilter = "all" | "attention" | "updates" | "enabled" | "disabled";
type FeedbackKind = "info" | "success" | "error";

/**
 * A tweak-registered page. We carry the owning tweak's manifest so we can
 * resolve relative iconUrls and show authorship in the page header.
 */
interface RegisteredPage {
  /** Fully-qualified id: `<tweakId>:<pageId>`. */
  id: string;
  tweakId: string;
  manifest: TweakManifest;
  page: SettingsPage;
  /** Per-page DOM teardown returned by `page.render`, if any. */
  teardown?: (() => void) | null;
  /** The injected sidebar button (so we can update its active state). */
  navButton?: HTMLButtonElement | null;
}

/** What page is currently selected in our injected nav. */
type ActivePage =
  | { kind: "config" }
  | { kind: "tweaks" }
  | { kind: "registered"; id: string };

interface InjectorState {
  sections: Map<string, SettingsSection>;
  pages: Map<string, RegisteredPage>;
  listedTweaks: ListedTweak[];
  /** Outer wrapper that holds Codex's items group + our injected groups. */
  outerWrapper: HTMLElement | null;
  /** Our "Codex Plus Plus" nav group (Config/Tweaks). */
  navGroup: HTMLElement | null;
  navButtons: { config: HTMLButtonElement; tweaks: HTMLButtonElement } | null;
  /** Our "Tweaks" nav group (per-tweak pages). Created lazily. */
  pagesGroup: HTMLElement | null;
  pagesGroupKey: string | null;
  panelHost: HTMLElement | null;
  observer: MutationObserver | null;
  fingerprint: string | null;
  sidebarDumped: boolean;
  activePage: ActivePage | null;
  sidebarRoot: HTMLElement | null;
  sidebarRestoreHandler: ((e: Event) => void) | null;
  tweaksSearch: string;
  tweaksFilter: TweakStatusFilter;
  feedback: Map<string, { kind: FeedbackKind; message: string }>;
  confirmedMainTweaks: Set<string>;
}

const state: InjectorState = {
  sections: new Map(),
  pages: new Map(),
  listedTweaks: [],
  outerWrapper: null,
  navGroup: null,
  navButtons: null,
  pagesGroup: null,
  pagesGroupKey: null,
  panelHost: null,
  observer: null,
  fingerprint: null,
  sidebarDumped: false,
  activePage: null,
  sidebarRoot: null,
  sidebarRestoreHandler: null,
  tweaksSearch: "",
  tweaksFilter: "all",
  feedback: new Map(),
  confirmedMainTweaks: new Set(),
};

function plog(msg: string, extra?: unknown): void {
  ipcRenderer.send(
    "codexpp:preload-log",
    "info",
    `[settings-injector] ${msg}${extra === undefined ? "" : " " + safeStringify(extra)}`,
  );
}
function safeStringify(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ───────────────────────────────────────────────────────────── public API ──

export function startSettingsInjector(): void {
  if (state.observer) return;

  const obs = new MutationObserver(() => {
    tryInject();
    maybeDumpDom();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  state.observer = obs;

  window.addEventListener("popstate", onNav);
  window.addEventListener("hashchange", onNav);
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = history[m];
    history[m] = function (this: History, ...args: Parameters<typeof orig>) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event(`codexpp-${m}`));
      return r;
    } as typeof orig;
    window.addEventListener(`codexpp-${m}`, onNav);
  }

  tryInject();
  maybeDumpDom();
  let ticks = 0;
  const interval = setInterval(() => {
    ticks++;
    tryInject();
    maybeDumpDom();
    if (ticks > 60) clearInterval(interval);
  }, 500);
}

export function __tryInjectForTests(): void {
  tryInject();
}

export function __resetSettingsInjectorForTests(): void {
  state.observer?.disconnect();
  state.observer = null;
  for (const p of state.pages.values()) {
    try {
      p.teardown?.();
    } catch {}
  }
  state.sections.clear();
  state.pages.clear();
  state.listedTweaks = [];
  state.outerWrapper = null;
  state.navGroup = null;
  state.navButtons = null;
  state.pagesGroup = null;
  state.pagesGroupKey = null;
  state.panelHost = null;
  state.fingerprint = null;
  state.sidebarDumped = false;
  state.activePage = null;
  state.sidebarRoot = null;
  state.sidebarRestoreHandler = null;
  state.tweaksSearch = "";
  state.tweaksFilter = "all";
  state.feedback.clear();
  state.confirmedMainTweaks.clear();
}

function onNav(): void {
  state.fingerprint = null;
  tryInject();
  maybeDumpDom();
}

export function registerSection(section: SettingsSection): SettingsHandle {
  state.sections.set(section.id, section);
  if (state.activePage?.kind === "tweaks") rerender();
  return {
    unregister: () => {
      state.sections.delete(section.id);
      if (state.activePage?.kind === "tweaks") rerender();
    },
  };
}

export function clearSections(): void {
  state.sections.clear();
  // Drop registered pages too — they're owned by tweaks that just got
  // torn down by the host. Run any teardowns before forgetting them.
  for (const p of state.pages.values()) {
    try {
      p.teardown?.();
    } catch (e) {
      plog("page teardown failed", { id: p.id, err: String(e) });
    }
  }
  state.pages.clear();
  syncPagesGroup();
  // If we were on a registered page that no longer exists, fall back to
  // restoring Codex's view.
  if (
    state.activePage?.kind === "registered" &&
    !state.pages.has(state.activePage.id)
  ) {
    restoreCodexView();
  } else if (state.activePage?.kind === "tweaks") {
    rerender();
  }
}

/**
 * Register a tweak-owned settings page. The runtime injects a sidebar entry
 * under a "TWEAKS" group header (which appears only when at least one page
 * is registered) and routes clicks to the page's `render(root)`.
 */
export function registerPage(
  tweakId: string,
  manifest: TweakManifest,
  page: SettingsPage,
): SettingsHandle {
  const id = page.id; // already namespaced by tweak-host as `${tweakId}:${page.id}`
  const entry: RegisteredPage = { id, tweakId, manifest, page };
  state.pages.set(id, entry);
  plog("registerPage", { id, title: page.title, tweakId });
  syncPagesGroup();
  // If the user was already on this page (hot reload), re-mount its body.
  if (state.activePage?.kind === "registered" && state.activePage.id === id) {
    rerender();
  }
  return {
    unregister: () => {
      const e = state.pages.get(id);
      if (!e) return;
      try {
        e.teardown?.();
      } catch {}
      state.pages.delete(id);
      syncPagesGroup();
      if (state.activePage?.kind === "registered" && state.activePage.id === id) {
        restoreCodexView();
      }
    },
  };
}

/** Called by the tweak host after fetching the tweak list from main. */
export function setListedTweaks(list: ListedTweak[]): void {
  state.listedTweaks = list;
  if (state.activePage?.kind === "tweaks") rerender();
}

// ───────────────────────────────────────────────────────────── injection ──

function tryInject(): void {
  const itemsGroup = findSidebarItemsGroup();
  if (!itemsGroup) {
    plog("sidebar not found");
    return;
  }
  // Codex's items group lives inside an outer wrapper that's already styled
  // to hold multiple groups (`flex flex-col gap-1 gap-0`). We inject our
  // group as a sibling so the natural gap-1 acts as our visual separator.
  const outer = itemsGroup.parentElement ?? itemsGroup;
  state.sidebarRoot = outer;

  if (state.navGroup && outer.contains(state.navGroup)) {
    syncPagesGroup();
    // Codex re-renders its native sidebar buttons on its own state changes.
    // If one of our pages is active, re-strip Codex's active styling so
    // General doesn't reappear as selected.
    if (state.activePage !== null) syncCodexNativeNavActive(true);
    return;
  }

  // Sidebar was either freshly mounted (Settings just opened) or re-mounted
  // (closed and re-opened, or navigated away and back). In all of those
  // cases Codex resets to its default page (General), but our in-memory
  // `activePage` may still reference the last tweak/page the user had open
  // — which would cause that nav button to render with the active styling
  // even though Codex is showing General. Clear it so `syncPagesGroup` /
  // `setNavActive` start from a neutral state. The panelHost reference is
  // also stale (its DOM was discarded with the previous content area).
  if (state.activePage !== null || state.panelHost !== null) {
    plog("sidebar re-mount detected; clearing stale active state", {
      prevActive: state.activePage,
    });
    state.activePage = null;
    state.panelHost = null;
  }

  // ── Group container ───────────────────────────────────────────────────
  const group = document.createElement("div");
  group.dataset.codexpp = "nav-group";
  group.className = "flex flex-col gap-px";

  // ── Section header / subtitle ────────────────────────────────────────
  // Codex doesn't (currently) ship a sidebar group header, so we mirror the
  // visual weight of `text-token-description-foreground` uppercase labels
  // used elsewhere in their UI. Padding matches the `px-row-x` of items.
  const header = document.createElement("div");
  header.className =
    "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
  header.textContent = "Codex Plus Plus";
  group.appendChild(header);

  // ── Two sidebar items ────────────────────────────────────────────────
  const configBtn = makeSidebarItem("Config", configIconSvg());
  const tweaksBtn = makeSidebarItem("Tweaks", tweaksIconSvg());

  configBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activatePage({ kind: "config" });
  });
  tweaksBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activatePage({ kind: "tweaks" });
  });

  group.appendChild(configBtn);
  group.appendChild(tweaksBtn);
  outer.appendChild(group);

  state.navGroup = group;
  state.navButtons = { config: configBtn, tweaks: tweaksBtn };
  plog("nav group injected", { outerTag: outer.tagName });
  syncPagesGroup();
}

/**
 * Render (or re-render) the second sidebar group of per-tweak pages. The
 * group is created lazily and removed when the last page unregisters, so
 * users with no page-registering tweaks never see an empty "Tweaks" header.
 */
function syncPagesGroup(): void {
  const outer = state.sidebarRoot;
  if (!outer) return;
  const pages = [...state.pages.values()];

  // Build a deterministic fingerprint of the desired group state. If the
  // current DOM group already matches, this is a no-op — critical, because
  // syncPagesGroup is called on every MutationObserver tick and any DOM
  // write would re-trigger that observer (infinite loop, app freeze).
  const desiredKey = pages.length === 0
    ? "EMPTY"
    : pages.map((p) => `${p.id}|${p.page.title}|${p.page.iconSvg ?? ""}`).join("\n");
  const groupAttached = !!state.pagesGroup && outer.contains(state.pagesGroup);
  if (state.pagesGroupKey === desiredKey && (pages.length === 0 ? !groupAttached : groupAttached)) {
    return;
  }

  if (pages.length === 0) {
    if (state.pagesGroup) {
      state.pagesGroup.remove();
      state.pagesGroup = null;
    }
    for (const p of state.pages.values()) p.navButton = null;
    state.pagesGroupKey = desiredKey;
    return;
  }

  let group = state.pagesGroup;
  if (!group || !outer.contains(group)) {
    group = document.createElement("div");
    group.dataset.codexpp = "pages-group";
    group.className = "flex flex-col gap-px";
    const header = document.createElement("div");
    header.className =
      "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
    header.textContent = "Tweaks";
    group.appendChild(header);
    outer.appendChild(group);
    state.pagesGroup = group;
  } else {
    // Strip prior buttons (keep the header at index 0).
    while (group.children.length > 1) group.removeChild(group.lastChild!);
  }

  for (const p of pages) {
    const icon = p.page.iconSvg ?? defaultPageIconSvg();
    const btn = makeSidebarItem(p.page.title, icon);
    btn.dataset.codexpp = `nav-page-${p.id}`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      activatePage({ kind: "registered", id: p.id });
    });
    p.navButton = btn;
    group.appendChild(btn);
  }
  state.pagesGroupKey = desiredKey;
  plog("pages group synced", {
    count: pages.length,
    ids: pages.map((p) => p.id),
  });
  // Reflect current active state across the rebuilt buttons.
  setNavActive(state.activePage);
}

function makeSidebarItem(label: string, iconSvg: string): HTMLButtonElement {
  // Class string copied verbatim from Codex's sidebar buttons (General etc).
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.codexpp = `nav-${label.toLowerCase()}`;
  btn.setAttribute("aria-label", label);
  btn.className =
    "focus-visible:outline-token-border relative px-row-x py-row-y cursor-interaction shrink-0 items-center overflow-hidden rounded-lg text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 gap-2 flex w-full hover:bg-token-list-hover-background font-normal";

  const inner = document.createElement("div");
  inner.className =
    "flex min-w-0 items-center text-base gap-2 flex-1 text-token-foreground";
  inner.innerHTML = `${iconSvg}<span class="truncate">${label}</span>`;
  btn.appendChild(inner);
  return btn;
}

/** Internal key for the built-in nav buttons. */
type BuiltinPage = "config" | "tweaks";

function setNavActive(active: ActivePage | null): void {
  // Built-in (Config/Tweaks) buttons.
  if (state.navButtons) {
    const builtin: BuiltinPage | null =
      active?.kind === "config" ? "config" :
      active?.kind === "tweaks" ? "tweaks" : null;
    for (const [key, btn] of Object.entries(state.navButtons) as [BuiltinPage, HTMLButtonElement][]) {
      applyNavActive(btn, key === builtin);
    }
  }
  // Per-page registered buttons.
  for (const p of state.pages.values()) {
    if (!p.navButton) continue;
    const isActive = active?.kind === "registered" && active.id === p.id;
    applyNavActive(p.navButton, isActive);
  }
  // Codex's own sidebar buttons (General, Appearance, etc). When one of
  // our pages is active, Codex still has aria-current="page" and the
  // active-bg class on whichever item it considered the route — typically
  // General. That makes both buttons look selected. Strip Codex's active
  // styling while one of ours is active; restore it when none is.
  syncCodexNativeNavActive(active !== null);
}

/**
 * Mute Codex's own active-state styling on its sidebar buttons. We don't
 * touch Codex's React state — when the user clicks a native item, Codex
 * re-renders the buttons and re-applies its own correct state, then our
 * sidebar-click listener fires `restoreCodexView` (which calls back into
 * `setNavActive(null)` and lets Codex's styling stand).
 *
 * `mute=true`  → strip aria-current and swap active bg → hover bg
 * `mute=false` → no-op (Codex's own re-render already restored things)
 */
function syncCodexNativeNavActive(mute: boolean): void {
  if (!mute) return;
  const root = state.sidebarRoot;
  if (!root) return;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  for (const btn of buttons) {
    // Skip our own buttons.
    if (btn.dataset.codexpp) continue;
    if (btn.getAttribute("aria-current") === "page") {
      btn.removeAttribute("aria-current");
    }
    if (btn.classList.contains("bg-token-list-hover-background")) {
      btn.classList.remove("bg-token-list-hover-background");
      btn.classList.add("hover:bg-token-list-hover-background");
    }
  }
}

function applyNavActive(btn: HTMLButtonElement, active: boolean): void {
  const inner = btn.firstElementChild as HTMLElement | null;
  if (active) {
      btn.classList.remove("hover:bg-token-list-hover-background", "font-normal");
      btn.classList.add("bg-token-list-hover-background");
      btn.setAttribute("aria-current", "page");
      if (inner) {
        inner.classList.remove("text-token-foreground");
        inner.classList.add("text-token-list-active-selection-foreground");
        inner
          .querySelector("svg")
          ?.classList.add("text-token-list-active-selection-icon-foreground");
      }
    } else {
      btn.classList.add("hover:bg-token-list-hover-background", "font-normal");
      btn.classList.remove("bg-token-list-hover-background");
      btn.removeAttribute("aria-current");
      if (inner) {
        inner.classList.add("text-token-foreground");
        inner.classList.remove("text-token-list-active-selection-foreground");
        inner
          .querySelector("svg")
          ?.classList.remove("text-token-list-active-selection-icon-foreground");
      }
    }
}

// ─────────────────────────────────────────────────────────── activation ──

function activatePage(page: ActivePage): void {
  const content = findContentArea();
  if (!content) {
    plog("activate: content area not found");
    return;
  }
  state.activePage = page;
  plog("activate", { page });

  // Hide Codex's content children, show ours.
  for (const child of Array.from(content.children) as HTMLElement[]) {
    if (child.dataset.codexpp === "tweaks-panel") continue;
    if (child.dataset.codexppHidden === undefined) {
      child.dataset.codexppHidden = child.style.display || "";
    }
    child.style.display = "none";
  }
  let panel = content.querySelector<HTMLElement>('[data-codexpp="tweaks-panel"]');
  if (!panel) {
    panel = document.createElement("div");
    panel.dataset.codexpp = "tweaks-panel";
    panel.style.cssText = "width:100%;height:100%;overflow:auto;";
    content.appendChild(panel);
  }
  panel.style.display = "block";
  state.panelHost = panel;
  rerender();
  setNavActive(page);
  // restore Codex's view. Re-register if needed.
  const sidebar = state.sidebarRoot;
  if (sidebar) {
    if (state.sidebarRestoreHandler) {
      sidebar.removeEventListener("click", state.sidebarRestoreHandler, true);
    }
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (state.navGroup?.contains(target)) return; // our buttons
      if (state.pagesGroup?.contains(target)) return; // our page buttons
      restoreCodexView();
    };
    state.sidebarRestoreHandler = handler;
    sidebar.addEventListener("click", handler, true);
  }
}

function restoreCodexView(): void {
  plog("restore codex view");
  const content = findContentArea();
  if (!content) return;
  if (state.panelHost) state.panelHost.style.display = "none";
  for (const child of Array.from(content.children) as HTMLElement[]) {
    if (child === state.panelHost) continue;
    if (child.dataset.codexppHidden !== undefined) {
      child.style.display = child.dataset.codexppHidden;
      delete child.dataset.codexppHidden;
    }
  }
  state.activePage = null;
  setNavActive(null);
  if (state.sidebarRoot && state.sidebarRestoreHandler) {
    state.sidebarRoot.removeEventListener(
      "click",
      state.sidebarRestoreHandler,
      true,
    );
    state.sidebarRestoreHandler = null;
  }
}

function rerender(): void {
  if (!state.activePage) return;
  const host = state.panelHost;
  if (!host) return;
  host.innerHTML = "";

  const ap = state.activePage;
  if (ap.kind === "registered") {
    const entry = state.pages.get(ap.id);
    if (!entry) {
      restoreCodexView();
      return;
    }
    const subtitle = entry.page.description
      ? `${entry.manifest.name}: ${entry.page.description}`
      : entry.manifest.name;
    const root = panelShell(entry.page.title, subtitle);
    host.appendChild(root.outer);
    if (entry.manifest.scope === "main" || entry.manifest.scope === "both") {
      root.sectionsWrap.appendChild(noticeRow(
        "Main Process Access",
        "This tweak can run code in Codex's main process. Use settings from sources you trust.",
        "warn",
      ));
    }
    try {
      // Tear down any prior render before re-rendering (hot reload).
      try { entry.teardown?.(); } catch {}
      entry.teardown = null;
      const ret = entry.page.render(root.sectionsWrap);
      if (typeof ret === "function") entry.teardown = ret;
    } catch (e) {
      root.sectionsWrap.appendChild(errorRow("Error rendering page", (e as Error).message));
    }
    return;
  }

  const title = ap.kind === "tweaks" ? "Tweaks" : "Config";
  const subtitle = ap.kind === "tweaks"
    ? "Manage your installed Codex++ tweaks."
    : "Configure Codex++ itself.";
  const root = panelShell(title, subtitle);
  host.appendChild(root.outer);
  if (ap.kind === "tweaks") renderTweaksPage(root.sectionsWrap);
  else renderConfigPage(root.sectionsWrap);
}

// ───────────────────────────────────────────────────────────── pages ──

function renderConfigPage(sectionsWrap: HTMLElement): void {
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Codex++ Updates"));
  const card = roundedCard();
  const loading = rowSimple("Loading update settings", "Checking current Codex++ configuration.");
  card.appendChild(loading);
  section.appendChild(card);
  sectionsWrap.appendChild(section);

  void ipcRenderer
    .invoke("codexpp:get-config")
    .then((config) => {
      card.textContent = "";
      renderCodexPlusPlusConfig(card, config as CodexPlusPlusConfig);
    })
    .catch((e) => {
      card.textContent = "";
      card.appendChild(rowSimple("Could not load update settings", String(e)));
    });

  renderInstallHealth(sectionsWrap);

  const maintenance = document.createElement("section");
  maintenance.className = "flex flex-col gap-2";
  maintenance.appendChild(sectionTitle("Support & Maintenance"));
  const maintenanceCard = roundedCard();
  maintenanceCard.appendChild(maintenanceActionRow(
    "Open tweaks folder",
    "Open the folder where local tweak packages live.",
    "Open",
    () => invokeAction("maintenance:open-tweaks", "Opening tweaks folder", "Opened tweaks folder.", () =>
      ipcRenderer.invoke("codexpp:reveal", tweaksPath()),
    ),
    "maintenance:open-tweaks",
  ));
  maintenanceCard.appendChild(maintenanceActionRow(
    "Open logs",
    "Open Codex++ runtime logs for local debugging.",
    "Open",
    () => invokeAction("maintenance:open-logs", "Opening logs", "Opened logs.", async () => {
      const health = await loadRuntimeHealth();
      await ipcRenderer.invoke("codexpp:reveal", health?.paths.logDir ?? "<user dir>/log");
    }),
    "maintenance:open-logs",
  ));
  maintenanceCard.appendChild(copyCommandRow("Copy status command", "Machine-readable install status.", "codex-plusplus status --json"));
  maintenanceCard.appendChild(copyCommandRow("Copy support bundle command", "Redacted support diagnostics.", "codex-plusplus support bundle"));
  maintenanceCard.appendChild(copyCommandRow("Copy uninstall command", "Run after quitting Codex to restore the app backup.", "codex-plusplus uninstall"));
  maintenanceCard.appendChild(reportBugRow());
  maintenance.appendChild(maintenanceCard);
  sectionsWrap.appendChild(maintenance);
}

function renderInstallHealth(sectionsWrap: HTMLElement): void {
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Install Health"));
  const card = roundedCard();
  card.appendChild(loadingRow("Loading runtime health", "Checking runtime paths and reload status."));
  section.appendChild(card);
  sectionsWrap.appendChild(section);

  void loadRuntimeHealth()
    .then((health) => {
      card.textContent = "";
      if (!health) {
        card.appendChild(errorRow("Runtime health unavailable", "Codex++ could not read runtime diagnostics from the main process."));
        return;
      }
      const reload = health.lastReload
        ? `${health.lastReload.ok ? "Last reload succeeded" : "Last reload failed"} ${formatDate(health.lastReload.at)}`
        : "No reload has run this session.";
      const unhealthy = health.recentErrors.length > 0 || health.lastReload?.ok === false;
      card.appendChild(noticeRow(
        unhealthy ? "Needs Attention" : "Healthy",
        unhealthy
          ? "Recent runtime errors were recorded. Open logs or create a support bundle if behavior looks wrong."
          : "Runtime diagnostics look healthy.",
        unhealthy ? "warn" : "success",
      ));
      card.appendChild(rowSimple("Runtime", `v${health.version}; ${reload}`));
      card.appendChild(rowSimple("Tweaks directory", health.paths.tweaksDir));
      card.appendChild(rowSimple("Log directory", health.paths.logDir));
      card.appendChild(rowSimple(
        "Loaded tweaks",
        `Discovered ${health.tweaks.discovered}; main loaded ${health.tweaks.loadedMain}; renderer loaded ${health.tweaks.loadedRenderer ?? "unknown"}.`,
      ));
      if (health.recentErrors.length > 0) {
        const latest = health.recentErrors[health.recentErrors.length - 1];
        card.appendChild(errorRow("Most recent runtime issue", `${formatDate(latest.at)}: ${latest.message}`));
      }
    })
    .catch((e) => {
      card.textContent = "";
      card.appendChild(errorRow("Could not load runtime health", String(e)));
    });
}

function renderCodexPlusPlusConfig(card: HTMLElement, config: CodexPlusPlusConfig): void {
  card.appendChild(autoUpdateRow(config));
  card.appendChild(checkForUpdatesRow(config.updateCheck));
  if (config.updateCheck) card.appendChild(releaseNotesRow(config.updateCheck));
}

function autoUpdateRow(config: CodexPlusPlusConfig): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = "Automatically refresh Codex++";
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = `Installed version v${config.version}. The watcher can refresh the Codex++ runtime after you rerun the GitHub installer.`;
  left.appendChild(title);
  left.appendChild(desc);
  row.appendChild(left);
  row.appendChild(
    switchControl(config.autoUpdate, async (next) => {
      await ipcRenderer.invoke("codexpp:set-auto-update", next);
    }),
  );
  return row;
}

function checkForUpdatesRow(check: CodexPlusPlusUpdateCheck | null): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = check?.updateAvailable ? "Codex++ update available" : "Codex++ is up to date";
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = updateSummary(check);
  left.appendChild(title);
  left.appendChild(desc);
  row.appendChild(left);

  const actions = document.createElement("div");
  actions.className = "flex shrink-0 items-center gap-2";
  if (check?.releaseUrl) {
    actions.appendChild(
      compactButton("Release Notes", () => {
        void ipcRenderer.invoke("codexpp:open-external", check.releaseUrl);
      }),
    );
  }
  actions.appendChild(
    actionButton("Check Now", "Check for Codex++ updates", async (btn) => {
      setButtonPending(btn, true, "Checking");
      try {
        const next = await ipcRenderer.invoke("codexpp:check-codexpp-update", true);
        const card = row.parentElement;
        if (!card) return;
        card.textContent = "";
        const config = await ipcRenderer.invoke("codexpp:get-config");
        renderCodexPlusPlusConfig(card, {
          ...(config as CodexPlusPlusConfig),
          updateCheck: next as CodexPlusPlusUpdateCheck,
        });
      } catch (e) {
        plog("Codex++ update check failed", String(e));
        row.insertAdjacentElement("afterend", errorRow("Update check failed", String(e)));
      } finally {
        setButtonPending(btn, false);
      }
    }),
  );
  row.appendChild(actions);
  return row;
}

function releaseNotesRow(check: CodexPlusPlusUpdateCheck): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex flex-col gap-2 p-3";
  const title = document.createElement("div");
  title.className = "text-sm text-token-text-primary";
  title.textContent = "Latest release notes";
  row.appendChild(title);
  const body = document.createElement("pre");
  body.className =
    "max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-foreground/5 p-3 text-xs text-token-text-secondary";
  body.textContent = check.releaseNotes?.trim() || check.error || "No release notes available.";
  row.appendChild(body);
  return row;
}

function updateSummary(check: CodexPlusPlusUpdateCheck | null): string {
  if (!check) return "No update check has run yet.";
  const latest = check.latestVersion ? `Latest v${check.latestVersion}. ` : "";
  const checked = `Checked ${new Date(check.checkedAt).toLocaleString()}.`;
  if (check.error) return `${latest}${checked} ${check.error}`;
  return `${latest}${checked}`;
}

function reportBugRow(): HTMLElement {
  return maintenanceActionRow(
    "Report a bug",
    "Open a GitHub issue with runtime, installer, or tweak-manager details.",
    "Open Issue",
    () => {
      const title = encodeURIComponent("[Bug]: ");
      const body = encodeURIComponent(
        [
          "## What happened?",
          "",
          "## Steps to reproduce",
          "1. ",
          "",
          "## Environment",
          "- Codex++ version: ",
          "- Codex app version: ",
          "- OS: ",
          "",
          "## Diagnostics",
          "Run `codex-plusplus support bundle` and attach relevant redacted output.",
        ].join("\n"),
      );
      void ipcRenderer.invoke(
        "codexpp:open-external",
        `https://github.com/b-nnett/codex-plusplus/issues/new?title=${title}&body=${body}`,
      );
    },
  );
}

function maintenanceActionRow(
  titleText: string,
  description: string,
  actionLabel: string,
  onAction: () => void,
  feedbackKey?: string,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-col gap-1";
  const title = document.createElement("div");
  title.className = "min-w-0 text-sm text-token-text-primary";
  title.textContent = titleText;
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary min-w-0 text-sm";
  desc.textContent = description;
  left.appendChild(title);
  left.appendChild(desc);
  const feedback = feedbackKey ? state.feedback.get(feedbackKey) : null;
  if (feedback) left.appendChild(inlineFeedback(feedback.kind, feedback.message));
  row.appendChild(left);
  const actions = document.createElement("div");
  actions.dataset.codexppRowActions = "true";
  actions.className = "flex shrink-0 items-center gap-2";
  actions.appendChild(compactButton(actionLabel, onAction));
  row.appendChild(actions);
  return row;
}

function copyCommandRow(title: string, description: string, command: string): HTMLElement {
  const key = `copy:${command}`;
  return maintenanceActionRow(title, `${description} ${command}`, "Copy", () => {
    void invokeAction(key, "Copying command", "Command copied.", () =>
      ipcRenderer.invoke("codexpp:copy-text", command),
    );
  }, key);
}

function renderTweaksPage(sectionsWrap: HTMLElement): void {
  // Group registered SettingsSections by tweak id (prefix split at ":").
  const sectionsByTweak = new Map<string, SettingsSection[]>();
  for (const s of state.sections.values()) {
    const tweakId = s.id.split(":")[0];
    if (!sectionsByTweak.has(tweakId)) sectionsByTweak.set(tweakId, []);
    sectionsByTweak.get(tweakId)!.push(s);
  }

  const wrap = document.createElement("section");
  wrap.className = "flex flex-col gap-3";
  wrap.appendChild(sectionTitle("Installed Tweaks"));
  wrap.appendChild(tweaksToolbar());

  const globalFeedback = state.feedback.get("tweaks:global");
  if (globalFeedback) wrap.appendChild(noticeRow("Tweaks", globalFeedback.message, globalFeedback.kind));

  if (state.listedTweaks.length === 0) {
    wrap.appendChild(emptyState(
      "No tweaks installed",
      `Drop a tweak folder into ${tweaksPath()} and reload.`,
    ));
    sectionsWrap.appendChild(wrap);
    return;
  }

  const visible = filteredTweaks(state.listedTweaks);
  if (visible.length === 0) {
    wrap.appendChild(emptyState("No tweaks match", "Try a different search or filter."));
    sectionsWrap.appendChild(wrap);
    return;
  }

  for (const group of tweakGroups(visible)) {
    if (group.items.length === 0) continue;
    const section = document.createElement("section");
    section.className = "flex flex-col gap-2";
    section.appendChild(sectionTitle(`${group.title} (${group.items.length})`));
    const card = roundedCard();
    for (const t of group.items) {
      card.appendChild(tweakRow(t, sectionsByTweak.get(t.manifest.id) ?? []));
    }
    section.appendChild(card);
    wrap.appendChild(section);
  }
  sectionsWrap.appendChild(wrap);
}

function tweaksToolbar(): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "flex flex-wrap items-center gap-2";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Tweak manager controls");

  const search = document.createElement("input");
  search.type = "search";
  search.value = state.tweaksSearch;
  search.placeholder = "Search tweaks";
  search.setAttribute("aria-label", "Search tweaks");
  search.className =
    "border-token-border h-8 min-w-48 flex-1 rounded-lg border bg-transparent px-2 text-sm text-token-text-primary outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border";
  search.addEventListener("input", () => {
    state.tweaksSearch = search.value;
    rerender();
  });
  toolbar.appendChild(search);

  toolbar.appendChild(filterSegmentedControl());
  toolbar.appendChild(iconButton("Reload tweaks", refreshIconSvg(), async (btn) => {
    setButtonPending(btn, true, "Reloading");
    state.feedback.set("tweaks:global", { kind: "info", message: "Reloading tweaks..." });
    rerender();
    try {
      await ipcRenderer.invoke("codexpp:reload-tweaks");
      state.feedback.set("tweaks:global", { kind: "success", message: "Tweaks reloaded. Reloading window..." });
      rerender();
      location.reload();
    } catch (e) {
      state.feedback.set("tweaks:global", { kind: "error", message: `Reload failed: ${String(e)}` });
      rerender();
    } finally {
      setButtonPending(btn, false);
    }
  }));
  toolbar.appendChild(iconButton("Open tweaks folder", folderIconSvg(), async (btn) => {
    setButtonPending(btn, true, "Opening");
    try {
      await ipcRenderer.invoke("codexpp:reveal", tweaksPath());
      state.feedback.set("tweaks:global", { kind: "success", message: "Opened tweaks folder." });
    } catch (e) {
      state.feedback.set("tweaks:global", { kind: "error", message: `Could not open tweaks folder: ${String(e)}` });
    } finally {
      setButtonPending(btn, false);
      rerender();
    }
  }));
  return toolbar;
}

function filterSegmentedControl(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "border-token-border inline-flex h-8 overflow-hidden rounded-lg border";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Filter tweaks by status");
  const options: Array<[TweakStatusFilter, string]> = [
    ["all", "All"],
    ["attention", "Attention"],
    ["updates", "Updates"],
    ["enabled", "Enabled"],
    ["disabled", "Disabled"],
  ];
  for (const [value, label] of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.codexppFilter = value;
    btn.className =
      "h-8 px-2 text-xs text-token-text-secondary hover:bg-token-list-hover-background aria-pressed:bg-token-list-hover-background aria-pressed:text-token-text-primary";
    btn.setAttribute("aria-pressed", String(state.tweaksFilter === value));
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      state.tweaksFilter = value;
      rerender();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function tweakRow(t: ListedTweak, sections: SettingsSection[]): HTMLElement {
  const m = t.manifest;
  const needsMainWarning = hasMainProcessAccess(t);

  // Outer cell wraps the header row + (optional) nested sections so the
  // parent card's divider stays between *tweaks*, not between header and
  // body of the same tweak.
  const cell = document.createElement("div");
  cell.className = "flex flex-col";
  if (!t.enabled || !t.loadable) cell.style.opacity = "0.7";

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-4 p-3";

  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-1 items-start gap-3";

  // ── Avatar ─────────────────────────────────────────────────────────────
  const avatar = document.createElement("div");
  avatar.className =
    "flex shrink-0 items-center justify-center rounded-md border border-token-border overflow-hidden text-token-text-secondary";
  avatar.style.width = "56px";
  avatar.style.height = "56px";
  avatar.style.backgroundColor = "var(--color-token-bg-fog, transparent)";
  if (m.iconUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.className = "size-full object-contain";
    // Initial: show fallback initial in case the icon fails to load.
    const initial = (m.name?.[0] ?? "?").toUpperCase();
    const fallback = document.createElement("span");
    fallback.className = "text-xl font-medium";
    fallback.textContent = initial;
    avatar.appendChild(fallback);
    img.style.display = "none";
    img.addEventListener("load", () => {
      fallback.remove();
      img.style.display = "";
    });
    img.addEventListener("error", () => {
      img.remove();
    });
    void resolveIconUrl(m.iconUrl, t.dir).then((url) => {
      if (url) img.src = url;
      else img.remove();
    });
    avatar.appendChild(img);
  } else {
    const initial = (m.name?.[0] ?? "?").toUpperCase();
    const span = document.createElement("span");
    span.className = "text-xl font-medium";
    span.textContent = initial;
    avatar.appendChild(span);
  }
  left.appendChild(avatar);

  // ── Text stack ────────────────────────────────────────────────────────
  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-col gap-0.5";

  const titleRow = document.createElement("div");
  titleRow.className = "flex items-center gap-2";
  const name = document.createElement("div");
  name.className = "min-w-0 text-sm font-medium text-token-text-primary";
  name.textContent = m.name;
  titleRow.appendChild(name);
  if (m.version) {
    const ver = document.createElement("span");
    ver.className =
      "text-token-text-secondary text-xs font-normal tabular-nums";
    ver.textContent = `v${m.version}`;
    titleRow.appendChild(ver);
  }
  if (t.update?.updateAvailable) {
    titleRow.appendChild(statusBadge("Update Available", "info"));
  }
  if (!t.loadable) {
    titleRow.appendChild(statusBadge("Not Loaded", "warn"));
  }
  if (needsMainWarning) {
    titleRow.appendChild(statusBadge("Main Process Access", "danger"));
  }
  stack.appendChild(titleRow);

  if (t.loadError) {
    const desc = document.createElement("div");
    desc.className = "text-token-text-secondary min-w-0 text-sm";
    desc.textContent = t.loadError;
    stack.appendChild(desc);
  } else if (m.description) {
    const desc = document.createElement("div");
    desc.className = "text-token-text-secondary min-w-0 text-sm";
    desc.textContent = m.description;
    stack.appendChild(desc);
  }

  const meta = document.createElement("div");
  meta.className = "flex items-center gap-2 text-xs text-token-text-secondary";
  const authorEl = renderAuthor(m.author);
  if (authorEl) meta.appendChild(authorEl);
  if (m.githubRepo) {
    if (meta.children.length > 0) meta.appendChild(dot());
    const repo = document.createElement("button");
    repo.type = "button";
    repo.className = "inline-flex text-token-text-link-foreground hover:underline";
    repo.textContent = m.githubRepo;
    repo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void ipcRenderer.invoke("codexpp:open-external", `https://github.com/${m.githubRepo}`);
    });
    meta.appendChild(repo);
  }
  if (m.homepage) {
    if (meta.children.length > 0) meta.appendChild(dot());
    const link = document.createElement("a");
    link.href = m.homepage;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "inline-flex text-token-text-link-foreground hover:underline";
    link.textContent = "Homepage";
    meta.appendChild(link);
  }
  if (meta.children.length > 0) stack.appendChild(meta);

  // Tags row (if any) — small pill chips below the meta line.
  if (m.tags && m.tags.length > 0) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "flex flex-wrap items-center gap-1 pt-0.5";
    for (const tag of m.tags) {
      const pill = document.createElement("span");
      pill.className =
        "rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] text-token-text-secondary";
      pill.textContent = tag;
      tagsRow.appendChild(pill);
    }
    stack.appendChild(tagsRow);
  }

  if (needsMainWarning) {
    const warn = document.createElement("div");
    warn.className = "text-token-text-secondary min-w-0 text-xs";
    warn.textContent = "Can run in Codex's main process. Enable only tweaks from sources you trust.";
    stack.appendChild(warn);
  }

  const friendlyCapabilities = friendlyCapabilityLabels(t.capabilities ?? []);
  if (friendlyCapabilities.length > 0) {
    const capRow = document.createElement("div");
    capRow.className = "flex flex-wrap items-center gap-1 pt-0.5";
    for (const cap of friendlyCapabilities) capRow.appendChild(statusBadge(cap, "muted"));
    stack.appendChild(capRow);
  }

  const feedback = state.feedback.get(`tweak:${m.id}`);
  if (feedback) stack.appendChild(inlineFeedback(feedback.kind, feedback.message));

  left.appendChild(stack);
  header.appendChild(left);

  // ── Toggle ────────────────────────────────────────────────────────────
  const right = document.createElement("div");
  right.className = "flex shrink-0 items-center gap-2 pt-0.5";
  if (t.update?.updateAvailable && t.update.releaseUrl) {
    right.appendChild(
      compactButton("View Release", () => {
        void ipcRenderer.invoke("codexpp:open-external", t.update!.releaseUrl);
      }),
    );
  }
  const toggle = switchControl(t.enabled, async (next) => {
      if (next && needsMainWarning && !state.confirmedMainTweaks.has(m.id)) {
        const ok = window.confirm(
          `${m.name} can run in Codex's main process.\n\nOnly enable main-process tweaks from sources you trust.`,
        );
        if (!ok) return false;
        state.confirmedMainTweaks.add(m.id);
      }
      state.feedback.set(`tweak:${m.id}`, {
        kind: "info",
        message: next ? "Enabling..." : "Disabling...",
      });
      rerender();
      try {
        await ipcRenderer.invoke("codexpp:set-tweak-enabled", m.id, next);
        state.listedTweaks = state.listedTweaks.map((item) =>
          item.manifest.id === m.id ? { ...item, enabled: next } : item,
        );
        state.feedback.set(`tweak:${m.id}`, {
          kind: "success",
          message: next ? "Enabled. Reloading tweaks..." : "Disabled. Reloading tweaks...",
        });
        rerender();
        return true;
      } catch (e) {
        state.feedback.set(`tweak:${m.id}`, {
          kind: "error",
          message: `Could not ${next ? "enable" : "disable"}: ${String(e)}`,
        });
        rerender();
        return false;
      }
    }, {
      disabled: !t.loadable || !t.entryExists,
      ariaLabel: `${t.enabled ? "Disable" : "Enable"} ${m.name}`,
    });
  right.appendChild(toggle);
  header.appendChild(right);

  cell.appendChild(header);

  // If the tweak is enabled and registered settings sections, render those
  // bodies as nested rows beneath the header inside the same cell.
  if (t.enabled && t.loadable && sections.length > 0) {
    const nested = document.createElement("div");
    nested.className =
      "flex flex-col divide-y-[0.5px] divide-token-border border-t-[0.5px] border-token-border";
    for (const s of sections) {
      const body = document.createElement("div");
      body.className = "p-3";
      try {
        s.render(body);
      } catch (e) {
        body.appendChild(errorRow("Error rendering tweak section", (e as Error).message));
      }
      nested.appendChild(body);
    }
    cell.appendChild(nested);
  }

  return cell;
}

function renderAuthor(author: TweakManifest["author"]): HTMLElement | null {
  if (!author) return null;
  const wrap = document.createElement("span");
  wrap.className = "inline-flex items-center gap-1";
  if (typeof author === "string") {
    wrap.textContent = `by ${author}`;
    return wrap;
  }
  wrap.appendChild(document.createTextNode("by "));
  if (author.url) {
    const a = document.createElement("a");
    a.href = author.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.className = "inline-flex text-token-text-link-foreground hover:underline";
    a.textContent = author.name;
    wrap.appendChild(a);
  } else {
    const span = document.createElement("span");
    span.textContent = author.name;
    wrap.appendChild(span);
  }
  return wrap;
}

function filteredTweaks(tweaks: ListedTweak[]): ListedTweak[] {
  const q = state.tweaksSearch.trim().toLowerCase();
  return tweaks.filter((t) => {
    const haystack = [
      t.manifest.name,
      t.manifest.id,
      t.manifest.description,
      t.manifest.githubRepo,
      ...(t.manifest.tags ?? []),
      ...friendlyCapabilityLabels(t.capabilities ?? []),
      t.loadError,
    ].filter(Boolean).join(" ").toLowerCase();
    if (q && !haystack.includes(q)) return false;
    switch (state.tweaksFilter) {
      case "attention": return isAttentionTweak(t);
      case "updates": return !!t.update?.updateAvailable;
      case "enabled": return t.enabled && t.loadable;
      case "disabled": return !t.enabled;
      default: return true;
    }
  });
}

function tweakGroups(tweaks: ListedTweak[]): Array<{ title: string; items: ListedTweak[] }> {
  const seen = new Set<string>();
  const take = (predicate: (t: ListedTweak) => boolean): ListedTweak[] => {
    const out: ListedTweak[] = [];
    for (const tweak of tweaks) {
      if (seen.has(tweak.manifest.id)) continue;
      if (!predicate(tweak)) continue;
      seen.add(tweak.manifest.id);
      out.push(tweak);
    }
    return out;
  };
  return [
    { title: "Needs Attention", items: take(isAttentionTweak) },
    { title: "Updates Available", items: take((t) => !!t.update?.updateAvailable) },
    { title: "Enabled", items: take((t) => t.enabled) },
    { title: "Disabled", items: take((t) => !t.enabled) },
  ];
}

function isAttentionTweak(t: ListedTweak): boolean {
  return !t.loadable || !t.entryExists || !!t.loadError;
}

function hasMainProcessAccess(t: ListedTweak): boolean {
  return (t.capabilities ?? []).some((c) => {
    const normalized = c.toLowerCase();
    return normalized === "main process" || normalized === "main process access";
  });
}

function friendlyCapabilityLabels(capabilities: string[]): string[] {
  const map: Record<string, string> = {
    "renderer ui": "Renderer UI",
    "main process": "Main Process Access",
    "isolated storage": "Local Data Storage",
    "scoped ipc": "Scoped IPC",
    "custom entry": "Custom Entry",
    "runtime gate": "Runtime Requirement",
  };
  const labels = capabilities.map((c) => map[c.toLowerCase()] ?? c);
  return [...new Set(labels)];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function loadRuntimeHealth(): Promise<RuntimeHealth | null> {
  return (await ipcRenderer.invoke("codexpp:runtime-health").catch(() => null)) as RuntimeHealth | null;
}

async function invokeAction(
  key: string,
  pending: string,
  success: string,
  action: () => Promise<unknown>,
): Promise<void> {
  state.feedback.set(key, { kind: "info", message: pending });
  rerender();
  try {
    await action();
    state.feedback.set(key, { kind: "success", message: success });
  } catch (e) {
    state.feedback.set(key, { kind: "error", message: String(e) });
  }
  rerender();
}

// ───────────────────────────────────────────────────────────── components ──

/** The full panel shell (toolbar + scroll + heading + sections wrap). */
function panelShell(
  title: string,
  subtitle?: string,
): { outer: HTMLElement; sectionsWrap: HTMLElement } {
  const outer = document.createElement("div");
  outer.className = "main-surface flex h-full min-h-0 flex-col";

  const toolbar = document.createElement("div");
  toolbar.className =
    "draggable flex items-center px-panel electron:h-toolbar extension:h-toolbar-sm";
  outer.appendChild(toolbar);

  const scroll = document.createElement("div");
  scroll.className = "flex-1 overflow-y-auto p-panel";
  outer.appendChild(scroll);

  const inner = document.createElement("div");
  inner.className =
    "mx-auto flex w-full flex-col max-w-2xl electron:min-w-[calc(320px*var(--codex-window-zoom))]";
  scroll.appendChild(inner);

  const headerWrap = document.createElement("div");
  headerWrap.className = "flex items-center justify-between gap-3 pb-panel";
  const headerInner = document.createElement("div");
  headerInner.className = "flex min-w-0 flex-1 flex-col gap-1.5 pb-panel";
  const heading = document.createElement("div");
  heading.className = "electron:heading-lg heading-base truncate";
  heading.textContent = title;
  headerInner.appendChild(heading);
  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "text-token-text-secondary text-sm";
    sub.textContent = subtitle;
    headerInner.appendChild(sub);
  }
  headerWrap.appendChild(headerInner);
  inner.appendChild(headerWrap);

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "flex flex-col gap-[var(--padding-panel)]";
  inner.appendChild(sectionsWrap);

  return { outer, sectionsWrap };
}

function sectionTitle(text: string, trailing?: HTMLElement): HTMLElement {
  const titleRow = document.createElement("div");
  titleRow.className =
    "flex h-toolbar items-center justify-between gap-2 px-0 py-0";
  const titleInner = document.createElement("div");
  titleInner.className = "flex min-w-0 flex-1 flex-col gap-1";
  const t = document.createElement("div");
  t.className = "text-base font-medium text-token-text-primary";
  t.textContent = text;
  titleInner.appendChild(t);
  titleRow.appendChild(titleInner);
  if (trailing) {
    const right = document.createElement("div");
    right.className = "flex items-center gap-2";
    right.appendChild(trailing);
    titleRow.appendChild(right);
  }
  return titleRow;
}

function statusBadge(label: string, kind: "info" | "success" | "warn" | "danger" | "muted" = "muted"): HTMLElement {
  const badge = document.createElement("span");
  const tone =
    kind === "danger" ? "text-token-charts-red"
    : kind === "warn" ? "text-token-text-primary"
    : kind === "success" ? "text-token-charts-green"
    : kind === "info" ? "text-token-text-primary"
    : "text-token-description-foreground";
  badge.className =
    `rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] font-medium ${tone}`;
  badge.textContent = label;
  return badge;
}

function noticeRow(
  titleText: string,
  description: string,
  kind: FeedbackKind | "warn" = "info",
): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex flex-col gap-1 p-3";
  const title = document.createElement("div");
  title.className =
    kind === "error" ? "text-sm font-medium text-token-charts-red"
    : kind === "success" ? "text-sm font-medium text-token-charts-green"
    : "text-sm font-medium text-token-text-primary";
  title.textContent = titleText;
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary text-sm";
  desc.textContent = description;
  row.append(title, desc);
  return row;
}

function loadingRow(title: string, description: string): HTMLElement {
  return rowSimple(title, description);
}

function errorRow(title: string, description: string): HTMLElement {
  return noticeRow(title, description, "error");
}

function emptyState(title: string, description: string): HTMLElement {
  const card = roundedCard();
  card.appendChild(rowSimple(title, description));
  return card;
}

function inlineFeedback(kind: FeedbackKind, message: string): HTMLElement {
  const el = document.createElement("div");
  el.className =
    kind === "error" ? "text-xs text-token-charts-red"
    : kind === "success" ? "text-xs text-token-charts-green"
    : "text-xs text-token-text-secondary";
  el.textContent = message;
  return el;
}

/**
 * Codex's "Open config.toml"-style trailing button: ghost border, muted
 * label, top-right diagonal arrow icon. Markup mirrors Configuration panel.
 */
function openInPlaceButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "border-token-border user-select-none no-drag cursor-interaction flex items-center gap-1 border whitespace-nowrap focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 rounded-lg text-token-description-foreground enabled:hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background border-transparent h-token-button-composer px-2 py-0 text-base leading-[18px]";
  btn.innerHTML =
    `${label}` +
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xs" aria-hidden="true">` +
    `<path d="M14.3349 13.3301V6.60645L5.47065 15.4707C5.21095 15.7304 4.78895 15.7304 4.52925 15.4707C4.26955 15.211 4.26955 14.789 4.52925 14.5293L13.3935 5.66504H6.66011C6.29284 5.66504 5.99507 5.36727 5.99507 5C5.99507 4.63273 6.29284 4.33496 6.66011 4.33496H14.9999L15.1337 4.34863C15.4369 4.41057 15.665 4.67857 15.665 5V13.3301C15.6649 13.6973 15.3672 13.9951 14.9999 13.9951C14.6327 13.9951 14.335 13.6973 14.3349 13.3301Z" fill="currentColor"></path>` +
    `</svg>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function compactButton(label: string, onClick: () => void): HTMLButtonElement {
  return actionButton(label, label, (_btn) => {
    onClick();
  });
}

function actionButton(
  label: string,
  ariaLabel: string,
  onClick: (btn: HTMLButtonElement) => void | Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", ariaLabel);
  btn.className =
    "border-token-border user-select-none no-drag cursor-interaction inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-2 text-sm text-token-text-primary enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40";
  btn.textContent = label;
  btn.dataset.codexppLabel = label;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await onClick(btn);
  });
  return btn;
}

function iconButton(
  label: string,
  iconSvg: string,
  onClick: (btn: HTMLButtonElement) => void | Promise<void>,
): HTMLButtonElement {
  const btn = actionButton("", label, onClick);
  btn.className =
    "border-token-border user-select-none no-drag cursor-interaction inline-flex h-8 w-8 items-center justify-center rounded-lg border text-token-text-primary enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40";
  btn.innerHTML = iconSvg;
  btn.dataset.codexppLabel = "";
  return btn;
}

function setButtonPending(btn: HTMLButtonElement, pending: boolean, label = "Working"): void {
  btn.disabled = pending;
  if (btn.dataset.codexppLabel) {
    btn.textContent = pending ? label : btn.dataset.codexppLabel;
  }
}

function roundedCard(): HTMLElement {
  const card = document.createElement("div");
  card.className =
    "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border";
  card.setAttribute(
    "style",
    "background-color: var(--color-background-panel, var(--color-token-bg-fog));",
  );
  return card;
}

function rowSimple(title: string | undefined, description?: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-4 p-3";
  const left = document.createElement("div");
  left.className = "flex min-w-0 items-center gap-3";
  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-col gap-1";
  if (title) {
    const t = document.createElement("div");
    t.className = "min-w-0 text-sm text-token-text-primary";
    t.textContent = title;
    stack.appendChild(t);
  }
  if (description) {
    const d = document.createElement("div");
    d.className = "text-token-text-secondary min-w-0 text-sm";
    d.textContent = description;
    stack.appendChild(d);
  }
  left.appendChild(stack);
  row.appendChild(left);
  return row;
}

/**
 * Codex-styled toggle switch. Markup mirrors the General > Permissions row
 * switch we captured: outer button (role=switch), inner pill, sliding knob.
 */
function switchControl(
  initial: boolean,
  onChange: (next: boolean) => boolean | void | Promise<boolean | void>,
  opts: { disabled?: boolean; ariaLabel?: string } = {},
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  if (opts.ariaLabel) btn.setAttribute("aria-label", opts.ariaLabel);

  const pill = document.createElement("span");
  const knob = document.createElement("span");
  knob.className =
    "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] shadow-sm transition-transform duration-200 ease-out h-4 w-4";
  pill.appendChild(knob);

  const apply = (on: boolean): void => {
    btn.setAttribute("aria-checked", String(on));
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.className =
      "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction";
    pill.className = `relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out h-5 w-8 ${
      on ? "bg-token-charts-blue" : "bg-token-foreground/20"
    }`;
    pill.dataset.state = on ? "checked" : "unchecked";
    knob.dataset.state = on ? "checked" : "unchecked";
    knob.style.transform = on ? "translateX(14px)" : "translateX(2px)";
  };
  apply(initial);
  btn.disabled = opts.disabled === true;

  btn.appendChild(pill);
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;
    const next = btn.getAttribute("aria-checked") !== "true";
    apply(next);
    btn.disabled = true;
    try {
      const result = await onChange(next);
      if (result === false) apply(!next);
    } catch (err) {
      apply(!next);
      console.warn("[codex-plusplus] switch action failed", err);
    } finally {
      btn.disabled = opts.disabled === true;
    }
  });
  return btn;
}

function dot(): HTMLElement {
  const s = document.createElement("span");
  s.className = "text-token-description-foreground";
  s.textContent = "·";
  return s;
}

// ──────────────────────────────────────────────────────────────── icons ──

function configIconSvg(): string {
  // Sliders / settings glyph. 20x20 currentColor.
  return (
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
    `<path d="M3 5h9M15 5h2M3 10h2M8 10h9M3 15h11M17 15h0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
    `<circle cx="13" cy="5" r="1.6" fill="currentColor"/>` +
    `<circle cx="6" cy="10" r="1.6" fill="currentColor"/>` +
    `<circle cx="15" cy="15" r="1.6" fill="currentColor"/>` +
    `</svg>`
  );
}

function tweaksIconSvg(): string {
  // Sparkles / "++" glyph for tweaks.
  return (
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
    `<path d="M10 2.5 L11.4 8.6 L17.5 10 L11.4 11.4 L10 17.5 L8.6 11.4 L2.5 10 L8.6 8.6 Z" fill="currentColor"/>` +
    `<path d="M15.5 3 L16 5 L18 5.5 L16 6 L15.5 8 L15 6 L13 5.5 L15 5 Z" fill="currentColor" opacity="0.7"/>` +
    `</svg>`
  );
}

function defaultPageIconSvg(): string {
  // Document/page glyph for tweak-registered pages without their own icon.
  return (
    `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">` +
    `<path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M12 3v3a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` +
    `</svg>`
  );
}

function refreshIconSvg(): string {
  return (
    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<path d="M4 10a6 6 0 0 1 10.24-4.24L16 7.5M16 4v3.5h-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M16 10a6 6 0 0 1-10.24 4.24L4 12.5M4 16v-3.5h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

function folderIconSvg(): string {
  return (
    `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H8l1.5 1.8H14.5A2.5 2.5 0 0 1 17 8.3v5.2A2.5 2.5 0 0 1 14.5 16h-9A2.5 2.5 0 0 1 3 13.5v-7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

async function resolveIconUrl(
  url: string,
  tweakDir: string,
): Promise<string | null> {
  if (/^(https?:|data:)/.test(url)) return url;
  // Relative path → ask main to read the file and return a data: URL.
  // Renderer is sandboxed so file:// won't load directly.
  const rel = url.startsWith("./") ? url.slice(2) : url;
  try {
    return (await ipcRenderer.invoke(
      "codexpp:read-tweak-asset",
      tweakDir,
      rel,
    )) as string;
  } catch (e) {
    plog("icon load failed", { url, tweakDir, err: String(e) });
    return null;
  }
}

// ─────────────────────────────────────────────────────── DOM heuristics ──

function findSidebarItemsGroup(): HTMLElement | null {
  // Anchor strategy first (would be ideal if Codex switches to <a>).
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a[href*='/settings/']"),
  );
  if (links.length >= 2) {
    let node: HTMLElement | null = links[0].parentElement;
    while (node) {
      const inside = node.querySelectorAll("a[href*='/settings/']");
      if (inside.length >= Math.max(2, links.length - 1)) return node;
      node = node.parentElement;
    }
  }

  // Text-content match against Codex's known sidebar labels.
  const KNOWN = [
    "General",
    "Appearance",
    "Configuration",
    "Personalization",
    "MCP servers",
    "MCP Servers",
    "Git",
    "Environments",
  ];
  const matches: HTMLElement[] = [];
  const all = document.querySelectorAll<HTMLElement>(
    "button, a, [role='button'], li, div",
  );
  for (const el of Array.from(all)) {
    const t = (el.textContent ?? "").trim();
    if (t.length > 30) continue;
    if (KNOWN.some((k) => t === k)) matches.push(el);
    if (matches.length > 50) break;
  }
  if (matches.length >= 2) {
    let node: HTMLElement | null = matches[0].parentElement;
    while (node) {
      let count = 0;
      for (const m of matches) if (node.contains(m)) count++;
      if (count >= Math.min(3, matches.length)) return node;
      node = node.parentElement;
    }
  }
  return null;
}

function findContentArea(): HTMLElement | null {
  const sidebar = findSidebarItemsGroup();
  if (!sidebar) return null;
  let parent = sidebar.parentElement;
  while (parent) {
    for (const child of Array.from(parent.children) as HTMLElement[]) {
      if (child === sidebar || child.contains(sidebar)) continue;
      const r = child.getBoundingClientRect();
      if (r.width > 300 && r.height > 200) return child;
    }
    parent = parent.parentElement;
  }
  return null;
}

function maybeDumpDom(): void {
  try {
    const sidebar = findSidebarItemsGroup();
    if (sidebar && !state.sidebarDumped) {
      state.sidebarDumped = true;
      const sbRoot = sidebar.parentElement ?? sidebar;
      plog(`codex sidebar HTML`, sbRoot.outerHTML.slice(0, 32000));
    }
    const content = findContentArea();
    if (!content) {
      if (state.fingerprint !== location.href) {
        state.fingerprint = location.href;
        plog("dom probe (no content)", {
          url: location.href,
          sidebar: sidebar ? describe(sidebar) : null,
        });
      }
      return;
    }
    let panel: HTMLElement | null = null;
    for (const child of Array.from(content.children) as HTMLElement[]) {
      if (child.dataset.codexpp === "tweaks-panel") continue;
      if (child.style.display === "none") continue;
      panel = child;
      break;
    }
    const activeNav = sidebar
      ? Array.from(sidebar.querySelectorAll<HTMLElement>("button, a")).find(
          (b) =>
            b.getAttribute("aria-current") === "page" ||
            b.getAttribute("data-active") === "true" ||
            b.getAttribute("aria-selected") === "true" ||
            b.classList.contains("active"),
        )
      : null;
    const heading = panel?.querySelector<HTMLElement>(
      "h1, h2, h3, [class*='heading']",
    );
    const fingerprint = `${activeNav?.textContent ?? ""}|${heading?.textContent ?? ""}|${panel?.children.length ?? 0}`;
    if (state.fingerprint === fingerprint) return;
    state.fingerprint = fingerprint;
    plog("dom probe", {
      url: location.href,
      activeNav: activeNav?.textContent?.trim() ?? null,
      heading: heading?.textContent?.trim() ?? null,
      content: describe(content),
    });
    if (panel) {
      const html = panel.outerHTML;
      plog(
        `codex panel HTML (${activeNav?.textContent?.trim() ?? "?"})`,
        html.slice(0, 32000),
      );
    }
  } catch (e) {
    plog("dom probe failed", String(e));
  }
}

function describe(el: HTMLElement): Record<string, unknown> {
  return {
    tag: el.tagName,
    cls: el.className.slice(0, 120),
    id: el.id || undefined,
    children: el.children.length,
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })(),
  };
}

function tweaksPath(): string {
  return (
    (window as unknown as { __codexpp_tweaks_dir__?: string }).__codexpp_tweaks_dir__ ??
    "<user dir>/tweaks"
  );
}
