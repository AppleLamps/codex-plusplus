"use strict";

// src/preload/index.ts
var import_electron3 = require("electron");

// src/preload/react-hook.ts
function installReactHook() {
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
  const renderers = /* @__PURE__ */ new Map();
  let nextId = 1;
  const listeners = /* @__PURE__ */ new Map();
  const hook = {
    supportsFiber: true,
    renderers,
    inject(renderer) {
      const id = nextId++;
      renderers.set(id, renderer);
      console.debug(
        "[codex-plusplus] React renderer attached:",
        renderer.rendererPackageName,
        renderer.version
      );
      return id;
    },
    on(event, fn) {
      let s = listeners.get(event);
      if (!s) listeners.set(event, s = /* @__PURE__ */ new Set());
      s.add(fn);
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
    onCommitFiberRoot() {
    },
    onCommitFiberUnmount() {
    },
    onScheduleFiberRoot() {
    },
    checkDCE() {
    }
  };
  Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
    configurable: true,
    enumerable: false,
    writable: true,
    // allow real DevTools to overwrite if user installs it
    value: hook
  });
  window.__codexpp__ = { hook, renderers };
}
function fiberForNode(node) {
  const renderers = window.__codexpp__?.renderers;
  if (renderers) {
    for (const r of renderers.values()) {
      const f = r.findFiberByHostInstance?.(node);
      if (f) return f;
    }
  }
  for (const k of Object.keys(node)) {
    if (k.startsWith("__reactFiber")) return node[k];
  }
  return null;
}

// src/preload/settings-injector.ts
var import_electron = require("electron");
var state = {
  sections: /* @__PURE__ */ new Map(),
  pages: /* @__PURE__ */ new Map(),
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
  feedback: /* @__PURE__ */ new Map(),
  confirmedMainTweaks: /* @__PURE__ */ new Set(),
  configRequestToken: 0,
  healthRequestToken: 0,
  updateRequestToken: 0,
  lastSupportBundleDir: null
};
function plog(msg, extra) {
  import_electron.ipcRenderer.send(
    "codexpp:preload-log",
    "info",
    `[settings-injector] ${msg}${extra === void 0 ? "" : " " + safeStringify(extra)}`
  );
}
function safeStringify(v) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function startSettingsInjector() {
  if (state.observer) return;
  const obs = new MutationObserver(() => {
    tryInject();
    maybeDumpDom();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  state.observer = obs;
  window.addEventListener("popstate", onNav);
  window.addEventListener("hashchange", onNav);
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function(...args) {
      const r = orig.apply(this, args);
      window.dispatchEvent(new Event(`codexpp-${m}`));
      return r;
    };
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
function onNav() {
  state.fingerprint = null;
  tryInject();
  maybeDumpDom();
}
function registerSection(section) {
  state.sections.set(section.id, section);
  if (state.activePage?.kind === "tweaks") rerender();
  return {
    unregister: () => {
      state.sections.delete(section.id);
      if (state.activePage?.kind === "tweaks") rerender();
    }
  };
}
function clearSections() {
  state.sections.clear();
  for (const p of state.pages.values()) {
    try {
      p.teardown?.();
    } catch (e) {
      plog("page teardown failed", { id: p.id, err: String(e) });
    }
  }
  state.pages.clear();
  syncPagesGroup();
  if (state.activePage?.kind === "registered" && !state.pages.has(state.activePage.id)) {
    restoreCodexView();
  } else if (state.activePage?.kind === "tweaks") {
    rerender();
  }
}
function registerPage(tweakId, manifest, page) {
  const id = page.id;
  const entry = { id, tweakId, manifest, page };
  state.pages.set(id, entry);
  plog("registerPage", { id, title: page.title, tweakId });
  syncPagesGroup();
  if (state.activePage?.kind === "registered" && state.activePage.id === id) {
    rerender();
  }
  return {
    unregister: () => {
      const e = state.pages.get(id);
      if (!e) return;
      try {
        e.teardown?.();
      } catch {
      }
      state.pages.delete(id);
      syncPagesGroup();
      if (state.activePage?.kind === "registered" && state.activePage.id === id) {
        restoreCodexView();
      }
    }
  };
}
function setListedTweaks(list) {
  state.listedTweaks = list;
  if (state.activePage?.kind === "tweaks") rerender();
}
function tryInject() {
  const itemsGroup = findSidebarItemsGroup();
  if (!itemsGroup) {
    plog("sidebar not found");
    return;
  }
  const outer = itemsGroup.parentElement ?? itemsGroup;
  state.sidebarRoot = outer;
  if (state.navGroup && outer.contains(state.navGroup)) {
    syncPagesGroup();
    if (state.activePage !== null) syncCodexNativeNavActive(true);
    return;
  }
  if (state.activePage !== null || state.panelHost !== null) {
    plog("sidebar re-mount detected; clearing stale active state", {
      prevActive: state.activePage
    });
    state.activePage = null;
    state.panelHost = null;
  }
  const group = document.createElement("div");
  group.dataset.codexpp = "nav-group";
  group.className = "flex flex-col gap-px";
  const header = document.createElement("div");
  header.className = "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
  header.textContent = "Codex Plus Plus";
  group.appendChild(header);
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
function syncPagesGroup() {
  const outer = state.sidebarRoot;
  if (!outer) return;
  const pages = [...state.pages.values()];
  const desiredKey = pages.length === 0 ? "EMPTY" : pages.map((p) => `${p.id}|${p.page.title}|${p.page.iconSvg ?? ""}`).join("\n");
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
    header.className = "px-row-x pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-token-description-foreground select-none";
    header.textContent = "Tweaks";
    group.appendChild(header);
    outer.appendChild(group);
    state.pagesGroup = group;
  } else {
    while (group.children.length > 1) group.removeChild(group.lastChild);
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
    ids: pages.map((p) => p.id)
  });
  setNavActive(state.activePage);
}
function makeSidebarItem(label, iconSvg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.codexpp = `nav-${label.toLowerCase()}`;
  btn.setAttribute("aria-label", label);
  btn.className = "focus-visible:outline-token-border relative px-row-x py-row-y cursor-interaction shrink-0 items-center overflow-hidden rounded-lg text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 gap-2 flex w-full hover:bg-token-list-hover-background font-normal";
  const inner = document.createElement("div");
  inner.className = "flex min-w-0 items-center text-base gap-2 flex-1 text-token-foreground";
  inner.innerHTML = `${iconSvg}<span class="truncate">${label}</span>`;
  btn.appendChild(inner);
  return btn;
}
function setNavActive(active) {
  if (state.navButtons) {
    const builtin = active?.kind === "config" ? "config" : active?.kind === "tweaks" ? "tweaks" : null;
    for (const [key, btn] of Object.entries(state.navButtons)) {
      applyNavActive(btn, key === builtin);
    }
  }
  for (const p of state.pages.values()) {
    if (!p.navButton) continue;
    const isActive = active?.kind === "registered" && active.id === p.id;
    applyNavActive(p.navButton, isActive);
  }
  syncCodexNativeNavActive(active !== null);
}
function syncCodexNativeNavActive(mute) {
  if (!mute) return;
  const root = state.sidebarRoot;
  if (!root) return;
  const buttons = Array.from(root.querySelectorAll("button"));
  for (const btn of buttons) {
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
function applyNavActive(btn, active) {
  const inner = btn.firstElementChild;
  if (active) {
    btn.classList.remove("hover:bg-token-list-hover-background", "font-normal");
    btn.classList.add("bg-token-list-hover-background");
    btn.setAttribute("aria-current", "page");
    if (inner) {
      inner.classList.remove("text-token-foreground");
      inner.classList.add("text-token-list-active-selection-foreground");
      inner.querySelector("svg")?.classList.add("text-token-list-active-selection-icon-foreground");
    }
  } else {
    btn.classList.add("hover:bg-token-list-hover-background", "font-normal");
    btn.classList.remove("bg-token-list-hover-background");
    btn.removeAttribute("aria-current");
    if (inner) {
      inner.classList.add("text-token-foreground");
      inner.classList.remove("text-token-list-active-selection-foreground");
      inner.querySelector("svg")?.classList.remove("text-token-list-active-selection-icon-foreground");
    }
  }
}
function activatePage(page) {
  const content = findContentArea();
  if (!content) {
    plog("activate: content area not found");
    return;
  }
  state.activePage = page;
  plog("activate", { page });
  for (const child of Array.from(content.children)) {
    if (child.dataset.codexpp === "tweaks-panel") continue;
    if (child.dataset.codexppHidden === void 0) {
      child.dataset.codexppHidden = child.style.display || "";
    }
    child.style.display = "none";
  }
  let panel = content.querySelector('[data-codexpp="tweaks-panel"]');
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
  const sidebar = state.sidebarRoot;
  if (sidebar) {
    if (state.sidebarRestoreHandler) {
      sidebar.removeEventListener("click", state.sidebarRestoreHandler, true);
    }
    const handler = (e) => {
      const target = e.target;
      if (!target) return;
      if (state.navGroup?.contains(target)) return;
      if (state.pagesGroup?.contains(target)) return;
      restoreCodexView();
    };
    state.sidebarRestoreHandler = handler;
    sidebar.addEventListener("click", handler, true);
  }
}
function restoreCodexView() {
  plog("restore codex view");
  const content = findContentArea();
  if (!content) return;
  if (state.panelHost) state.panelHost.style.display = "none";
  for (const child of Array.from(content.children)) {
    if (child === state.panelHost) continue;
    if (child.dataset.codexppHidden !== void 0) {
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
      true
    );
    state.sidebarRestoreHandler = null;
  }
}
function rerender() {
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
    const subtitle2 = entry.page.description ? `${entry.manifest.name}: ${entry.page.description}` : entry.manifest.name;
    const root2 = panelShell(entry.page.title, subtitle2);
    host.appendChild(root2.outer);
    if (entry.manifest.scope === "main" || entry.manifest.scope === "both") {
      root2.sectionsWrap.appendChild(noticeRow(
        "Main Process Access",
        "This tweak can run code in Codex's main process. Use settings from sources you trust.",
        "warn"
      ));
    }
    try {
      try {
        entry.teardown?.();
      } catch {
      }
      entry.teardown = null;
      const ret = entry.page.render(root2.sectionsWrap);
      if (typeof ret === "function") entry.teardown = ret;
    } catch (e) {
      root2.sectionsWrap.appendChild(errorRow("Error rendering page", e.message));
    }
    return;
  }
  const title = ap.kind === "tweaks" ? "Tweaks" : "Config";
  const subtitle = ap.kind === "tweaks" ? "Manage your installed Codex++ tweaks." : "Configure Codex++ itself.";
  const root = panelShell(title, subtitle);
  host.appendChild(root.outer);
  if (ap.kind === "tweaks") renderTweaksPage(root.sectionsWrap);
  else renderConfigPage(root.sectionsWrap);
}
function renderConfigPage(sectionsWrap) {
  const configToken = ++state.configRequestToken;
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Codex++ Updates"));
  const card = roundedCard();
  const loading = rowSimple("Loading update settings", "Checking current Codex++ configuration.");
  card.appendChild(loading);
  section.appendChild(card);
  sectionsWrap.appendChild(section);
  void import_electron.ipcRenderer.invoke("codexpp:get-config").then((config) => {
    if (configToken !== state.configRequestToken || !card.isConnected) return;
    card.textContent = "";
    renderCodexPlusPlusConfig(card, config);
  }).catch((e) => {
    if (configToken !== state.configRequestToken || !card.isConnected) return;
    card.textContent = "";
    card.appendChild(errorRow("Could not load update settings", String(e)));
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
    () => invokeAction(
      "maintenance:open-tweaks",
      "Opening tweaks folder",
      "Opened tweaks folder.",
      () => import_electron.ipcRenderer.invoke("codexpp:reveal", tweaksPath())
    ),
    "maintenance:open-tweaks"
  ));
  maintenanceCard.appendChild(maintenanceActionRow(
    "Open logs",
    "Open Codex++ runtime logs for local debugging.",
    "Open",
    () => invokeAction("maintenance:open-logs", "Opening logs", "Opened logs.", async () => {
      const paths = await loadUserPaths();
      if (!paths?.logDir) throw new Error("Log directory is unavailable.");
      await import_electron.ipcRenderer.invoke("codexpp:reveal", paths.logDir);
    }),
    "maintenance:open-logs"
  ));
  maintenanceCard.appendChild(maintenanceActionRow(
    "Create support bundle",
    "Create a redacted diagnostics folder and copy its path.",
    "Create",
    () => invokeAction("maintenance:create-support", "Creating support bundle", "Support bundle created and path copied.", async () => {
      const result = await import_electron.ipcRenderer.invoke("codexpp:create-support-bundle");
      state.lastSupportBundleDir = result.dir;
      await import_electron.ipcRenderer.invoke("codexpp:copy-text", result.dir);
    }),
    "maintenance:create-support"
  ));
  maintenanceCard.appendChild(maintenanceActionRow(
    "Reveal support bundle",
    "Open the most recent in-app support bundle.",
    "Reveal",
    () => invokeAction("maintenance:reveal-support", "Opening support bundle", "Opened support bundle.", async () => {
      if (!state.lastSupportBundleDir) throw new Error("Create a support bundle first.");
      await import_electron.ipcRenderer.invoke("codexpp:reveal", state.lastSupportBundleDir);
    }),
    "maintenance:reveal-support"
  ));
  maintenanceCard.appendChild(maintenanceActionRow(
    "Copy diagnostics JSON",
    "Copy redacted runtime diagnostics for support.",
    "Copy",
    () => invokeAction(
      "maintenance:copy-diagnostics",
      "Copying diagnostics",
      "Diagnostics copied.",
      () => import_electron.ipcRenderer.invoke("codexpp:copy-diagnostics-json")
    ),
    "maintenance:copy-diagnostics"
  ));
  maintenanceCard.appendChild(copyCommandRow("Copy status command", "Machine-readable install status.", "codex-plusplus status --json"));
  maintenanceCard.appendChild(copyCommandRow("Copy support bundle command", "Redacted support diagnostics.", "codex-plusplus support bundle"));
  maintenanceCard.appendChild(copyCommandRow("Copy uninstall command", "Run after quitting Codex to restore the app backup.", "codex-plusplus uninstall"));
  maintenanceCard.appendChild(reportBugRow());
  maintenance.appendChild(maintenanceCard);
  sectionsWrap.appendChild(maintenance);
}
function renderInstallHealth(sectionsWrap) {
  const healthToken = ++state.healthRequestToken;
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Install Health"));
  const card = roundedCard();
  card.appendChild(loadingRow("Loading runtime health", "Checking runtime paths and reload status."));
  section.appendChild(card);
  sectionsWrap.appendChild(section);
  void loadRuntimeHealth().then((health) => {
    if (healthToken !== state.healthRequestToken || !card.isConnected) return;
    card.textContent = "";
    if (!health) {
      card.appendChild(errorRow("Runtime health unavailable", "Codex++ could not read runtime diagnostics from the main process."));
      return;
    }
    const reload = health.lastReload ? `${health.lastReload.ok ? "Last reload succeeded" : "Last reload failed"} ${formatDate(health.lastReload.at)}` : "No reload has run this session.";
    const unhealthy = health.recentErrors.length > 0 || health.lastReload?.ok === false;
    card.appendChild(noticeRow(
      unhealthy ? "Needs Attention" : "Healthy",
      unhealthy ? "Recent runtime errors were recorded. Open logs or create a support bundle if behavior looks wrong." : "Runtime diagnostics look healthy.",
      unhealthy ? "warn" : "success"
    ));
    card.appendChild(rowSimple("Runtime", `v${health.version}; ${reload}`));
    card.appendChild(rowSimple("Tweaks directory", health.paths.tweaksDir));
    card.appendChild(rowSimple("Log directory", health.paths.logDir));
    card.appendChild(rowSimple(
      "Loaded tweaks",
      `Discovered ${health.tweaks.discovered}; main loaded ${health.tweaks.loadedMain}; renderer loaded ${health.tweaks.loadedRenderer ?? "unknown"}.`
    ));
    if (health.recentErrors.length > 0) {
      const latest = health.recentErrors[health.recentErrors.length - 1];
      card.appendChild(errorRow("Most recent runtime issue", `${formatDate(latest.at)}: ${latest.message}`));
    }
  }).catch((e) => {
    if (healthToken !== state.healthRequestToken || !card.isConnected) return;
    card.textContent = "";
    card.appendChild(errorRow("Could not load runtime health", String(e)));
  });
}
function renderCodexPlusPlusConfig(card, config) {
  card.appendChild(autoUpdateRow(config));
  card.appendChild(checkForUpdatesRow(config.updateCheck));
  const updateFeedback = state.feedback.get("config:update-check");
  if (updateFeedback) {
    const row = noticeRow("Update check", updateFeedback.message, updateFeedback.kind);
    row.dataset.codexppUpdateFeedback = "true";
    card.appendChild(row);
  }
  if (config.updateCheck) card.appendChild(releaseNotesRow(config.updateCheck));
}
function autoUpdateRow(config) {
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
      await import_electron.ipcRenderer.invoke("codexpp:set-auto-update", next);
    })
  );
  return row;
}
function checkForUpdatesRow(check) {
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
        void openExternal(check.releaseUrl);
      })
    );
  }
  actions.appendChild(
    actionButton("Check Now", "Check for Codex++ updates", async (btn) => {
      const updateToken = ++state.updateRequestToken;
      setButtonPending(btn, true, "Checking");
      state.feedback.set("config:update-check", { kind: "info", message: "Checking for Codex++ updates..." });
      try {
        const next = await import_electron.ipcRenderer.invoke("codexpp:check-codexpp-update", true);
        if (updateToken !== state.updateRequestToken || !row.isConnected) return;
        const card = row.parentElement;
        if (!card) return;
        state.feedback.delete("config:update-check");
        card.textContent = "";
        const config = await import_electron.ipcRenderer.invoke("codexpp:get-config");
        if (updateToken !== state.updateRequestToken || !card.isConnected) return;
        renderCodexPlusPlusConfig(card, {
          ...config,
          updateCheck: next
        });
      } catch (e) {
        if (updateToken !== state.updateRequestToken || !row.isConnected) return;
        plog("Codex++ update check failed", String(e));
        state.feedback.set("config:update-check", { kind: "error", message: `Update check failed: ${String(e)}` });
        const card = row.parentElement;
        if (card) {
          card.querySelector('[data-codexpp-update-feedback="true"]')?.remove();
          const feedback = noticeRow("Update check", `Update check failed: ${String(e)}`, "error");
          feedback.dataset.codexppUpdateFeedback = "true";
          row.insertAdjacentElement("afterend", feedback);
        }
      } finally {
        setButtonPending(btn, false);
      }
    })
  );
  row.appendChild(actions);
  return row;
}
function releaseNotesRow(check) {
  const row = document.createElement("div");
  row.className = "flex flex-col gap-2 p-3";
  const title = document.createElement("div");
  title.className = "text-sm text-token-text-primary";
  title.textContent = "Latest release notes";
  row.appendChild(title);
  const body = document.createElement("pre");
  body.className = "max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-foreground/5 p-3 text-xs text-token-text-secondary";
  body.textContent = check.releaseNotes?.trim() || check.error || "No release notes available.";
  row.appendChild(body);
  return row;
}
function updateSummary(check) {
  if (!check) return "No update check has run yet.";
  const latest = check.latestVersion ? `Latest v${check.latestVersion}. ` : "";
  const checked = `Checked ${new Date(check.checkedAt).toLocaleString()}.`;
  if (check.error) return `${latest}${checked} ${check.error}`;
  return `${latest}${checked}`;
}
function reportBugRow() {
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
          "Run `codex-plusplus support bundle` and attach relevant redacted output."
        ].join("\n")
      );
      void openExternal(`https://github.com/AppleLamps/codex-plusplus/issues/new?title=${title}&body=${body}`);
    }
  );
}
function maintenanceActionRow(titleText, description, actionLabel, onAction, feedbackKey) {
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
function copyCommandRow(title, description, command) {
  const key = `copy:${command}`;
  return maintenanceActionRow(title, `${description} ${command}`, "Copy", () => {
    void invokeAction(
      key,
      "Copying command",
      "Command copied.",
      () => import_electron.ipcRenderer.invoke("codexpp:copy-text", command)
    );
  }, key);
}
function renderTweaksPage(sectionsWrap) {
  const sectionsByTweak = /* @__PURE__ */ new Map();
  for (const s of state.sections.values()) {
    const tweakId = s.id.split(":")[0];
    if (!sectionsByTweak.has(tweakId)) sectionsByTweak.set(tweakId, []);
    sectionsByTweak.get(tweakId).push(s);
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
      `Drop a tweak folder into ${tweaksPath()} and reload.`
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
function tweaksToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "flex flex-wrap items-center gap-2";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Tweak manager controls");
  const search = document.createElement("input");
  search.type = "search";
  search.dataset.codexppSearch = "tweaks";
  search.value = state.tweaksSearch;
  search.placeholder = "Search tweaks";
  search.setAttribute("aria-label", "Search tweaks");
  search.className = "border-token-border h-8 min-w-48 flex-1 rounded-lg border bg-transparent px-2 text-sm text-token-text-primary outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border";
  search.addEventListener("input", () => {
    const selectionStart = search.selectionStart ?? search.value.length;
    const selectionEnd = search.selectionEnd ?? selectionStart;
    state.tweaksSearch = search.value;
    rerender();
    restoreSearchFocus(selectionStart, selectionEnd);
  });
  toolbar.appendChild(search);
  toolbar.appendChild(filterSegmentedControl());
  toolbar.appendChild(iconButton("Reload tweaks", refreshIconSvg(), async (btn) => {
    setButtonPending(btn, true, "Reloading");
    state.feedback.set("tweaks:global", { kind: "info", message: "Reloading tweaks..." });
    try {
      await import_electron.ipcRenderer.invoke("codexpp:reload-tweaks");
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
      await import_electron.ipcRenderer.invoke("codexpp:reveal", tweaksPath());
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
function filterSegmentedControl() {
  const wrap = document.createElement("div");
  wrap.className = "border-token-border inline-flex h-8 overflow-hidden rounded-lg border";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Filter tweaks by status");
  const options = [
    ["all", "All"],
    ["attention", "Attention"],
    ["updates", "Updates"],
    ["enabled", "Enabled"],
    ["disabled", "Disabled"]
  ];
  for (const [value, label] of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.codexppFilter = value;
    btn.className = "h-8 px-2 text-xs text-token-text-secondary hover:bg-token-list-hover-background aria-pressed:bg-token-list-hover-background aria-pressed:text-token-text-primary";
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
function tweakRow(t, sections) {
  const m = t.manifest;
  const needsMainWarning = hasMainProcessAccess(t);
  const cell = document.createElement("div");
  cell.className = "flex flex-col";
  if (!t.enabled || !t.loadable) cell.style.opacity = "0.7";
  const header = document.createElement("div");
  header.className = "flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between";
  const left = document.createElement("div");
  left.className = "flex min-w-0 flex-1 items-start gap-3";
  const avatar = document.createElement("div");
  avatar.className = "flex shrink-0 items-center justify-center rounded-md border border-token-border overflow-hidden text-token-text-secondary";
  avatar.style.width = "56px";
  avatar.style.height = "56px";
  avatar.style.backgroundColor = "var(--color-token-bg-fog, transparent)";
  if (m.iconUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.className = "size-full object-contain";
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
  const stack = document.createElement("div");
  stack.className = "flex min-w-0 flex-col gap-0.5";
  const titleRow = document.createElement("div");
  titleRow.className = "flex min-w-0 flex-wrap items-center gap-2";
  const name = document.createElement("div");
  name.className = "min-w-0 break-words text-sm font-medium text-token-text-primary";
  name.textContent = m.name;
  titleRow.appendChild(name);
  if (m.version) {
    const ver = document.createElement("span");
    ver.className = "text-token-text-secondary text-xs font-normal tabular-nums";
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
  const loadReason = t.loadError || (!t.entryExists ? "Entry file is missing." : "");
  const loadReasonId = loadReason ? `codexpp-load-reason-${safeDomId(m.id)}` : void 0;
  if (loadReason) {
    const desc = document.createElement("div");
    if (loadReasonId) desc.id = loadReasonId;
    desc.className = "text-token-text-secondary min-w-0 text-sm";
    desc.textContent = loadReason;
    stack.appendChild(desc);
  } else if (m.description) {
    const desc = document.createElement("div");
    desc.className = "text-token-text-secondary min-w-0 text-sm";
    desc.textContent = m.description;
    stack.appendChild(desc);
  }
  const meta = document.createElement("div");
  meta.className = "flex min-w-0 flex-wrap items-center gap-2 text-xs text-token-text-secondary";
  const authorEl = renderAuthor(m.author);
  if (authorEl) meta.appendChild(authorEl);
  if (m.githubRepo) {
    if (meta.children.length > 0) meta.appendChild(dot());
    const repo = document.createElement("button");
    repo.type = "button";
    repo.className = "inline-flex min-w-0 break-all text-token-text-link-foreground hover:underline";
    repo.textContent = m.githubRepo;
    repo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void openExternal(`https://github.com/${m.githubRepo}`);
    });
    meta.appendChild(repo);
  }
  if (m.homepage) {
    if (meta.children.length > 0) meta.appendChild(dot());
    const link = document.createElement("button");
    link.type = "button";
    link.className = "inline-flex min-w-0 break-all text-token-text-link-foreground hover:underline";
    link.textContent = "Homepage";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void openExternal(m.homepage);
    });
    meta.appendChild(link);
  }
  if (meta.children.length > 0) stack.appendChild(meta);
  if (m.tags && m.tags.length > 0) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "flex flex-wrap items-center gap-1 pt-0.5";
    for (const tag of m.tags) {
      const pill = document.createElement("span");
      pill.className = "rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] text-token-text-secondary";
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
    stack.appendChild(trustDetails(friendlyCapabilities));
  }
  const feedback = state.feedback.get(`tweak:${m.id}`);
  if (feedback) stack.appendChild(inlineFeedback(feedback.kind, feedback.message));
  left.appendChild(stack);
  header.appendChild(left);
  const right = document.createElement("div");
  right.className = "flex shrink-0 flex-wrap items-center gap-2 pt-0.5 sm:justify-end";
  if (t.update?.updateAvailable && t.update.releaseUrl) {
    right.appendChild(
      compactButton("View Release", () => {
        void openExternal(t.update.releaseUrl);
      })
    );
  }
  const toggle = switchControl(t.enabled, async (next) => {
    if (next && needsMainWarning && !state.confirmedMainTweaks.has(m.id)) {
      const ok = window.confirm(
        `${m.name} can run in Codex's main process.

Only enable main-process tweaks from sources you trust.`
      );
      if (!ok) return false;
      state.confirmedMainTweaks.add(m.id);
    }
    state.feedback.set(`tweak:${m.id}`, {
      kind: "info",
      message: next ? "Enabling..." : "Disabling..."
    });
    rerender();
    try {
      await import_electron.ipcRenderer.invoke("codexpp:set-tweak-enabled", m.id, next);
      state.listedTweaks = state.listedTweaks.map(
        (item) => item.manifest.id === m.id ? { ...item, enabled: next } : item
      );
      state.feedback.set(`tweak:${m.id}`, {
        kind: "success",
        message: next ? "Enabled. Reloading tweaks..." : "Disabled. Reloading tweaks..."
      });
      rerender();
      return true;
    } catch (e) {
      state.feedback.set(`tweak:${m.id}`, {
        kind: "error",
        message: `Could not ${next ? "enable" : "disable"}: ${String(e)}`
      });
      rerender();
      return false;
    }
  }, {
    disabled: !t.loadable || !t.entryExists,
    ariaLabel: `${t.enabled ? "Disable" : "Enable"} ${m.name}`,
    describedBy: loadReasonId
  });
  right.appendChild(toggle);
  header.appendChild(right);
  cell.appendChild(header);
  if (t.enabled && t.loadable && sections.length > 0) {
    const nested = document.createElement("div");
    nested.className = "flex flex-col divide-y-[0.5px] divide-token-border border-t-[0.5px] border-token-border";
    for (const s of sections) {
      const body = document.createElement("div");
      body.className = "p-3";
      try {
        s.render(body);
      } catch (e) {
        body.appendChild(errorRow("Error rendering tweak section", e.message));
      }
      nested.appendChild(body);
    }
    cell.appendChild(nested);
  }
  return cell;
}
function renderAuthor(author) {
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
function filteredTweaks(tweaks) {
  const q = state.tweaksSearch.trim().toLowerCase();
  return tweaks.filter((t) => {
    const haystack = [
      t.manifest.name,
      t.manifest.id,
      t.manifest.description,
      t.manifest.githubRepo,
      ...t.manifest.tags ?? [],
      ...friendlyCapabilityLabels(t.capabilities ?? []),
      t.loadError
    ].filter(Boolean).join(" ").toLowerCase();
    if (q && !haystack.includes(q)) return false;
    switch (state.tweaksFilter) {
      case "attention":
        return isAttentionTweak(t);
      case "updates":
        return !!t.update?.updateAvailable;
      case "enabled":
        return t.enabled && t.loadable;
      case "disabled":
        return !t.enabled;
      default:
        return true;
    }
  });
}
function tweakGroups(tweaks) {
  const seen = /* @__PURE__ */ new Set();
  const take = (predicate) => {
    const out = [];
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
    { title: "Disabled", items: take((t) => !t.enabled) }
  ];
}
function isAttentionTweak(t) {
  return !t.loadable || !t.entryExists || !!t.loadError;
}
function hasMainProcessAccess(t) {
  return (t.capabilities ?? []).some((c) => {
    const normalized = c.toLowerCase();
    return normalized === "main process" || normalized === "main process access";
  });
}
function friendlyCapabilityLabels(capabilities) {
  const map = {
    "renderer ui": "Renderer UI",
    "main process": "Main Process Access",
    "isolated storage": "Local Data Storage",
    "scoped ipc": "Scoped IPC",
    "custom entry": "Custom Entry",
    "runtime gate": "Runtime Requirement"
  };
  const labels = capabilities.map((c) => map[c.toLowerCase()] ?? c);
  return [...new Set(labels)];
}
function trustDetails(capabilities) {
  const details = document.createElement("details");
  details.className = "pt-1 text-xs text-token-text-secondary";
  const summary = document.createElement("summary");
  summary.className = "cursor-pointer text-token-text-primary";
  summary.textContent = "Trust details";
  details.appendChild(summary);
  const list = document.createElement("ul");
  list.className = "mt-1 flex flex-col gap-1";
  for (const cap of capabilities) {
    const item = document.createElement("li");
    item.textContent = `${cap}: ${capabilityDescription(cap)}`;
    list.appendChild(item);
  }
  details.appendChild(list);
  return details;
}
function capabilityDescription(label) {
  const descriptions = {
    "Renderer UI": "can add renderer-side UI and settings.",
    "Main Process Access": "can run code in Codex's main process.",
    "Local Data Storage": "can read and write its own Codex++ data.",
    "Scoped IPC": "can communicate through Codex++ scoped IPC helpers.",
    "Custom Entry": "uses a custom manifest entry file.",
    "Runtime Requirement": "declares a minimum Codex++ runtime version."
  };
  return descriptions[label] ?? "reported by the tweak manifest.";
}
function safeDomId(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
async function loadRuntimeHealth() {
  return await import_electron.ipcRenderer.invoke("codexpp:runtime-health").catch(() => null);
}
async function loadUserPaths() {
  const paths = await import_electron.ipcRenderer.invoke("codexpp:user-paths").catch(() => null);
  return paths;
}
async function openExternal(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Only https links can be opened.");
  await import_electron.ipcRenderer.invoke("codexpp:open-external", parsed.toString());
}
function restoreSearchFocus(selectionStart, selectionEnd) {
  const next = document.querySelector('input[data-codexpp-search="tweaks"]');
  if (!next) return;
  next.focus();
  try {
    next.setSelectionRange(selectionStart, selectionEnd);
  } catch {
  }
}
async function invokeAction(key, pending, success, action) {
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
function panelShell(title, subtitle) {
  const outer = document.createElement("div");
  outer.className = "main-surface flex h-full min-h-0 flex-col";
  const toolbar = document.createElement("div");
  toolbar.className = "draggable flex items-center px-panel electron:h-toolbar extension:h-toolbar-sm";
  outer.appendChild(toolbar);
  const scroll = document.createElement("div");
  scroll.className = "flex-1 overflow-y-auto p-panel";
  outer.appendChild(scroll);
  const inner = document.createElement("div");
  inner.className = "mx-auto flex w-full flex-col max-w-2xl electron:min-w-[calc(320px*var(--codex-window-zoom))]";
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
function sectionTitle(text, trailing) {
  const titleRow = document.createElement("div");
  titleRow.className = "flex h-toolbar items-center justify-between gap-2 px-0 py-0";
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
function statusBadge(label, kind = "muted") {
  const badge = document.createElement("span");
  const tone = kind === "danger" ? "text-token-charts-red" : kind === "warn" ? "text-token-text-primary" : kind === "success" ? "text-token-charts-green" : kind === "info" ? "text-token-text-primary" : "text-token-description-foreground";
  badge.className = `rounded-full border border-token-border bg-token-foreground/5 px-2 py-0.5 text-[11px] font-medium ${tone}`;
  badge.textContent = label;
  return badge;
}
function noticeRow(titleText, description, kind = "info") {
  const row = document.createElement("div");
  row.className = "flex flex-col gap-1 p-3";
  const title = document.createElement("div");
  title.className = kind === "error" ? "text-sm font-medium text-token-charts-red" : kind === "success" ? "text-sm font-medium text-token-charts-green" : "text-sm font-medium text-token-text-primary";
  title.textContent = titleText;
  const desc = document.createElement("div");
  desc.className = "text-token-text-secondary text-sm";
  desc.textContent = description;
  row.append(title, desc);
  return row;
}
function loadingRow(title, description) {
  return rowSimple(title, description);
}
function errorRow(title, description) {
  return noticeRow(title, description, "error");
}
function emptyState(title, description) {
  const card = roundedCard();
  card.appendChild(rowSimple(title, description));
  return card;
}
function inlineFeedback(kind, message) {
  const el = document.createElement("div");
  el.className = kind === "error" ? "text-xs text-token-charts-red" : kind === "success" ? "text-xs text-token-charts-green" : "text-xs text-token-text-secondary";
  el.textContent = message;
  return el;
}
function compactButton(label, onClick) {
  return actionButton(label, label, (_btn) => {
    onClick();
  });
}
function actionButton(label, ariaLabel, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", ariaLabel);
  btn.className = "border-token-border user-select-none no-drag cursor-interaction inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-2 text-sm text-token-text-primary enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40";
  btn.textContent = label;
  btn.dataset.codexppLabel = label;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await onClick(btn);
  });
  return btn;
}
function iconButton(label, iconSvg, onClick) {
  const btn = actionButton("", label, onClick);
  btn.className = "border-token-border user-select-none no-drag cursor-interaction inline-flex h-8 w-8 items-center justify-center rounded-lg border text-token-text-primary enabled:hover:bg-token-list-hover-background disabled:cursor-not-allowed disabled:opacity-40";
  btn.innerHTML = iconSvg;
  btn.dataset.codexppLabel = "";
  btn.dataset.codexppIcon = iconSvg;
  btn.dataset.codexppPendingLabel = label;
  return btn;
}
function setButtonPending(btn, pending, label = "Working") {
  btn.disabled = pending;
  btn.setAttribute("aria-busy", String(pending));
  if (btn.dataset.codexppLabel) {
    btn.textContent = pending ? label : btn.dataset.codexppLabel;
  } else if (btn.dataset.codexppIcon) {
    btn.innerHTML = pending ? spinnerIconSvg() : btn.dataset.codexppIcon;
    btn.title = pending ? label : btn.dataset.codexppPendingLabel ?? "";
  }
}
function roundedCard() {
  const card = document.createElement("div");
  card.className = "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border";
  card.setAttribute(
    "style",
    "background-color: var(--color-background-panel, var(--color-token-bg-fog));"
  );
  return card;
}
function rowSimple(title, description) {
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
function switchControl(initial, onChange, opts = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  if (opts.ariaLabel) btn.setAttribute("aria-label", opts.ariaLabel);
  if (opts.describedBy) btn.setAttribute("aria-describedby", opts.describedBy);
  const pill = document.createElement("span");
  const knob = document.createElement("span");
  knob.className = "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] shadow-sm transition-transform duration-200 ease-out h-4 w-4";
  pill.appendChild(knob);
  const apply = (on) => {
    btn.setAttribute("aria-checked", String(on));
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.className = "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction disabled:cursor-not-allowed disabled:opacity-50";
    pill.className = `relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out h-5 w-8 ${opts.disabled ? "bg-token-foreground/10" : on ? "bg-token-charts-blue" : "bg-token-foreground/20"}`;
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
function dot() {
  const s = document.createElement("span");
  s.className = "text-token-description-foreground";
  s.textContent = "\xB7";
  return s;
}
function configIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true"><path d="M3 5h9M15 5h2M3 10h2M8 10h9M3 15h11M17 15h0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="13" cy="5" r="1.6" fill="currentColor"/><circle cx="6" cy="10" r="1.6" fill="currentColor"/><circle cx="15" cy="15" r="1.6" fill="currentColor"/></svg>`;
}
function tweaksIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true"><path d="M10 2.5 L11.4 8.6 L17.5 10 L11.4 11.4 L10 17.5 L8.6 11.4 L2.5 10 L8.6 8.6 Z" fill="currentColor"/><path d="M15.5 3 L16 5 L18 5.5 L16 6 L15.5 8 L15 6 L13 5.5 L15 5 Z" fill="currentColor" opacity="0.7"/></svg>`;
}
function defaultPageIconSvg() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true"><path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 3v3a1 1 0 0 0 1 1h2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}
function refreshIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 10a6 6 0 0 1 10.24-4.24L16 7.5M16 4v3.5h-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10a6 6 0 0 1-10.24 4.24L4 12.5M4 16v-3.5h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function folderIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H8l1.5 1.8H14.5A2.5 2.5 0 0 1 17 8.3v5.2A2.5 2.5 0 0 1 14.5 16h-9A2.5 2.5 0 0 1 3 13.5v-7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
function spinnerIconSvg() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 3a7 7 0 1 1-6.06 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/></svg>`;
}
async function resolveIconUrl(url, tweakDir) {
  if (/^(https?:|data:)/.test(url)) return url;
  const rel = url.startsWith("./") ? url.slice(2) : url;
  try {
    return await import_electron.ipcRenderer.invoke(
      "codexpp:read-tweak-asset",
      tweakDir,
      rel
    );
  } catch (e) {
    plog("icon load failed", { url, tweakDir, err: String(e) });
    return null;
  }
}
function findSidebarItemsGroup() {
  const links = Array.from(
    document.querySelectorAll("a[href*='/settings/']")
  );
  if (links.length >= 2) {
    let node = links[0].parentElement;
    while (node) {
      const inside = node.querySelectorAll("a[href*='/settings/']");
      if (inside.length >= Math.max(2, links.length - 1)) return node;
      node = node.parentElement;
    }
  }
  const KNOWN = [
    "General",
    "Appearance",
    "Configuration",
    "Personalization",
    "MCP servers",
    "MCP Servers",
    "Git",
    "Environments"
  ];
  const matches = [];
  const all = document.querySelectorAll(
    "button, a, [role='button'], li, div"
  );
  for (const el of Array.from(all)) {
    const t = (el.textContent ?? "").trim();
    if (t.length > 30) continue;
    if (KNOWN.some((k) => t === k)) matches.push(el);
    if (matches.length > 50) break;
  }
  if (matches.length >= 2) {
    let node = matches[0].parentElement;
    while (node) {
      let count = 0;
      for (const m of matches) if (node.contains(m)) count++;
      if (count >= Math.min(3, matches.length)) return node;
      node = node.parentElement;
    }
  }
  return null;
}
function findContentArea() {
  const sidebar = findSidebarItemsGroup();
  if (!sidebar) return null;
  let parent = sidebar.parentElement;
  while (parent) {
    for (const child of Array.from(parent.children)) {
      if (child === sidebar || child.contains(sidebar)) continue;
      const r = child.getBoundingClientRect();
      if (r.width > 300 && r.height > 200) return child;
    }
    parent = parent.parentElement;
  }
  return null;
}
function maybeDumpDom() {
  try {
    const sidebar = findSidebarItemsGroup();
    if (sidebar && !state.sidebarDumped) {
      state.sidebarDumped = true;
      const sbRoot = sidebar.parentElement ?? sidebar;
      plog(`codex sidebar HTML`, sbRoot.outerHTML.slice(0, 32e3));
    }
    const content = findContentArea();
    if (!content) {
      if (state.fingerprint !== location.href) {
        state.fingerprint = location.href;
        plog("dom probe (no content)", {
          url: location.href,
          sidebar: sidebar ? describe(sidebar) : null
        });
      }
      return;
    }
    let panel = null;
    for (const child of Array.from(content.children)) {
      if (child.dataset.codexpp === "tweaks-panel") continue;
      if (child.style.display === "none") continue;
      panel = child;
      break;
    }
    const activeNav = sidebar ? Array.from(sidebar.querySelectorAll("button, a")).find(
      (b) => b.getAttribute("aria-current") === "page" || b.getAttribute("data-active") === "true" || b.getAttribute("aria-selected") === "true" || b.classList.contains("active")
    ) : null;
    const heading = panel?.querySelector(
      "h1, h2, h3, [class*='heading']"
    );
    const fingerprint = `${activeNav?.textContent ?? ""}|${heading?.textContent ?? ""}|${panel?.children.length ?? 0}`;
    if (state.fingerprint === fingerprint) return;
    state.fingerprint = fingerprint;
    plog("dom probe", {
      url: location.href,
      activeNav: activeNav?.textContent?.trim() ?? null,
      heading: heading?.textContent?.trim() ?? null,
      content: describe(content)
    });
    if (panel) {
      const html = panel.outerHTML;
      plog(
        `codex panel HTML (${activeNav?.textContent?.trim() ?? "?"})`,
        html.slice(0, 32e3)
      );
    }
  } catch (e) {
    plog("dom probe failed", String(e));
  }
}
function describe(el) {
  return {
    tag: el.tagName,
    cls: el.className.slice(0, 120),
    id: el.id || void 0,
    children: el.children.length,
    rect: (() => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })()
  };
}
function tweaksPath() {
  return window.__codexpp_tweaks_dir__ ?? "<user dir>/tweaks";
}

// src/preload/tweak-host.ts
var import_electron2 = require("electron");
var loaded = /* @__PURE__ */ new Map();
var cachedPaths = null;
async function startTweakHost() {
  const tweaks = await import_electron2.ipcRenderer.invoke("codexpp:list-tweaks");
  const paths = await import_electron2.ipcRenderer.invoke("codexpp:user-paths");
  cachedPaths = paths;
  setListedTweaks(tweaks);
  window.__codexpp_tweaks_dir__ = paths.tweaksDir;
  for (const t of tweaks) {
    if (t.manifest.scope === "main") continue;
    if (!t.entryExists) continue;
    if (!t.enabled) continue;
    if (!t.loadable) continue;
    try {
      await loadTweak(t, paths);
    } catch (e) {
      console.error("[codex-plusplus] tweak load failed:", t.manifest.id, e);
    }
  }
  console.info(
    `[codex-plusplus] renderer host loaded ${loaded.size} tweak(s):`,
    [...loaded.keys()].join(", ") || "(none)"
  );
  import_electron2.ipcRenderer.send(
    "codexpp:preload-log",
    "info",
    `renderer host loaded ${loaded.size} tweak(s): ${[...loaded.keys()].join(", ") || "(none)"}`
  );
}
async function teardownTweakHost() {
  for (const [id, t] of loaded) {
    try {
      await t.stop?.();
    } catch (e) {
      console.warn("[codex-plusplus] tweak stop failed:", id, e);
    }
  }
  loaded.clear();
  clearSections();
}
async function loadTweak(t, paths) {
  const source = await import_electron2.ipcRenderer.invoke(
    "codexpp:read-tweak-source",
    t.entry
  );
  const module2 = { exports: {} };
  const exports2 = module2.exports;
  const fn = new Function(
    "module",
    "exports",
    "console",
    `${source}
//# sourceURL=codexpp-tweak://${encodeURIComponent(t.manifest.id)}/${encodeURIComponent(t.entry)}`
  );
  fn(module2, exports2, console);
  const mod = module2.exports;
  const tweak = mod.default ?? mod;
  if (typeof tweak?.start !== "function") {
    throw new Error(`tweak ${t.manifest.id} has no start()`);
  }
  const api = makeRendererApi(t.manifest, paths);
  await tweak.start(api);
  loaded.set(t.manifest.id, { stop: tweak.stop?.bind(tweak) });
}
function makeRendererApi(manifest, paths) {
  const id = manifest.id;
  const log = (level, ...a) => {
    const consoleFn = level === "debug" ? console.debug : level === "warn" ? console.warn : level === "error" ? console.error : console.log;
    consoleFn(`[codex-plusplus][${id}]`, ...a);
    try {
      const parts = a.map((v) => {
        if (typeof v === "string") return v;
        if (v instanceof Error) return `${v.name}: ${v.message}`;
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      });
      import_electron2.ipcRenderer.send(
        "codexpp:preload-log",
        level,
        `[tweak ${id}] ${parts.join(" ")}`
      );
    } catch {
    }
  };
  return {
    manifest,
    process: "renderer",
    log: {
      debug: (...a) => log("debug", ...a),
      info: (...a) => log("info", ...a),
      warn: (...a) => log("warn", ...a),
      error: (...a) => log("error", ...a)
    },
    storage: rendererStorage(id),
    settings: {
      register: (s) => registerSection({ ...s, id: `${id}:${s.id}` }),
      registerPage: (p) => registerPage(id, manifest, { ...p, id: `${id}:${p.id}` })
    },
    react: {
      getFiber: (n) => fiberForNode(n),
      findOwnerByName: (n, name) => {
        let f = fiberForNode(n);
        while (f) {
          const t = f.type;
          if (t && (t.displayName === name || t.name === name)) return f;
          f = f.return;
        }
        return null;
      },
      waitForElement: (sel, timeoutMs = 5e3) => new Promise((resolve, reject) => {
        const existing = document.querySelector(sel);
        if (existing) return resolve(existing);
        const deadline = Date.now() + timeoutMs;
        const obs = new MutationObserver(() => {
          const el = document.querySelector(sel);
          if (el) {
            obs.disconnect();
            resolve(el);
          } else if (Date.now() > deadline) {
            obs.disconnect();
            reject(new Error(`timeout waiting for ${sel}`));
          }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
      })
    },
    ipc: {
      on: (c, h) => {
        const wrapped = (_e, ...args) => h(...args);
        import_electron2.ipcRenderer.on(`codexpp:${id}:${c}`, wrapped);
        return () => import_electron2.ipcRenderer.removeListener(`codexpp:${id}:${c}`, wrapped);
      },
      send: (c, ...args) => import_electron2.ipcRenderer.send(`codexpp:${id}:${c}`, ...args),
      invoke: (c, ...args) => import_electron2.ipcRenderer.invoke(`codexpp:${id}:${c}`, ...args)
    },
    fs: rendererFs(id, paths)
  };
}
function rendererStorage(id) {
  const key = `codexpp:storage:${id}`;
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  };
  const write = (v) => localStorage.setItem(key, JSON.stringify(v));
  return {
    get: (k, d) => k in read() ? read()[k] : d,
    set: (k, v) => {
      const o = read();
      o[k] = v;
      write(o);
    },
    delete: (k) => {
      const o = read();
      delete o[k];
      write(o);
    },
    all: () => read()
  };
}
function rendererFs(id, _paths) {
  return {
    dataDir: `<remote>/tweak-data/${id}`,
    read: (p) => import_electron2.ipcRenderer.invoke("codexpp:tweak-fs", "read", id, p),
    write: (p, c) => import_electron2.ipcRenderer.invoke("codexpp:tweak-fs", "write", id, p, c),
    exists: (p) => import_electron2.ipcRenderer.invoke("codexpp:tweak-fs", "exists", id, p)
  };
}

// src/preload/index.ts
function fileLog(stage, extra) {
  const msg = `[codex-plusplus preload] ${stage}${extra === void 0 ? "" : " " + safeStringify2(extra)}`;
  try {
    console.error(msg);
  } catch {
  }
  try {
    import_electron3.ipcRenderer.send("codexpp:preload-log", "info", msg);
  } catch {
  }
}
function safeStringify2(v) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
fileLog("preload entry", { url: location.href });
try {
  installReactHook();
  fileLog("react hook installed");
} catch (e) {
  fileLog("react hook FAILED", String(e));
}
queueMicrotask(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
});
async function boot() {
  fileLog("boot start", { readyState: document.readyState });
  try {
    startSettingsInjector();
    fileLog("settings injector started");
    await startTweakHost();
    fileLog("tweak host started");
    subscribeReload();
    fileLog("boot complete");
  } catch (e) {
    fileLog("boot FAILED", String(e?.stack ?? e));
    console.error("[codex-plusplus] preload boot failed:", e);
  }
}
var reloading = null;
function subscribeReload() {
  import_electron3.ipcRenderer.on("codexpp:tweaks-changed", () => {
    if (reloading) return;
    reloading = (async () => {
      try {
        console.info("[codex-plusplus] hot-reloading tweaks");
        await teardownTweakHost();
        await startTweakHost();
      } catch (e) {
        console.error("[codex-plusplus] hot reload failed:", e);
      } finally {
        reloading = null;
      }
    })();
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ByZWxvYWQvaW5kZXgudHMiLCAiLi4vc3JjL3ByZWxvYWQvcmVhY3QtaG9vay50cyIsICIuLi9zcmMvcHJlbG9hZC9zZXR0aW5ncy1pbmplY3Rvci50cyIsICIuLi9zcmMvcHJlbG9hZC90d2Vhay1ob3N0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcclxuICogUmVuZGVyZXIgcHJlbG9hZCBlbnRyeS4gUnVucyBpbiBhbiBpc29sYXRlZCB3b3JsZCBiZWZvcmUgQ29kZXgncyBwYWdlIEpTLlxyXG4gKiBSZXNwb25zaWJpbGl0aWVzOlxyXG4gKiAgIDEuIEluc3RhbGwgYSBSZWFjdCBEZXZUb29scy1zaGFwZWQgZ2xvYmFsIGhvb2sgdG8gY2FwdHVyZSB0aGUgcmVuZGVyZXJcclxuICogICAgICByZWZlcmVuY2Ugd2hlbiBSZWFjdCBtb3VudHMuIFdlIHVzZSB0aGlzIGZvciBmaWJlciB3YWxraW5nLlxyXG4gKiAgIDIuIEFmdGVyIERPTUNvbnRlbnRMb2FkZWQsIGtpY2sgb2ZmIHNldHRpbmdzLWluamVjdGlvbiBsb2dpYy5cclxuICogICAzLiBEaXNjb3ZlciByZW5kZXJlci1zY29wZWQgdHdlYWtzICh2aWEgSVBDIHRvIG1haW4pIGFuZCBzdGFydCB0aGVtLlxyXG4gKiAgIDQuIExpc3RlbiBmb3IgYGNvZGV4cHA6dHdlYWtzLWNoYW5nZWRgIGZyb20gbWFpbiAoZmlsZXN5c3RlbSB3YXRjaGVyKSBhbmRcclxuICogICAgICBob3QtcmVsb2FkIHR3ZWFrcyB3aXRob3V0IGRyb3BwaW5nIHRoZSBwYWdlLlxyXG4gKi9cclxuXHJcbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XHJcbmltcG9ydCB7IGluc3RhbGxSZWFjdEhvb2sgfSBmcm9tIFwiLi9yZWFjdC1ob29rXCI7XG5pbXBvcnQgeyBzdGFydFNldHRpbmdzSW5qZWN0b3IgfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xuaW1wb3J0IHsgc3RhcnRUd2Vha0hvc3QsIHRlYXJkb3duVHdlYWtIb3N0IH0gZnJvbSBcIi4vdHdlYWstaG9zdFwiO1xuXHJcbi8vIEZpbGUtbG9nIHByZWxvYWQgcHJvZ3Jlc3Mgc28gd2UgY2FuIGRpYWdub3NlIHdpdGhvdXQgRGV2VG9vbHMuIEJlc3QtZWZmb3J0OlxyXG4vLyBmYWlsdXJlcyBoZXJlIG11c3QgbmV2ZXIgdGhyb3cgYmVjYXVzZSB3ZSdkIHRha2UgdGhlIHBhZ2UgZG93biB3aXRoIHVzLlxyXG4vL1xyXG4vLyBDb2RleCdzIHJlbmRlcmVyIGlzIHNhbmRib3hlZCAoc2FuZGJveDogdHJ1ZSksIHNvIGByZXF1aXJlKFwibm9kZTpmc1wiKWAgaXNcclxuLy8gdW5hdmFpbGFibGUuIFdlIGZvcndhcmQgbG9nIGxpbmVzIHRvIG1haW4gdmlhIElQQzsgbWFpbiB3cml0ZXMgdGhlIGZpbGUuXHJcbmZ1bmN0aW9uIGZpbGVMb2coc3RhZ2U6IHN0cmluZywgZXh0cmE/OiB1bmtub3duKTogdm9pZCB7XHJcbiAgY29uc3QgbXNnID0gYFtjb2RleC1wbHVzcGx1cyBwcmVsb2FkXSAke3N0YWdlfSR7XHJcbiAgICBleHRyYSA9PT0gdW5kZWZpbmVkID8gXCJcIiA6IFwiIFwiICsgc2FmZVN0cmluZ2lmeShleHRyYSlcclxuICB9YDtcclxuICB0cnkge1xyXG4gICAgY29uc29sZS5lcnJvcihtc2cpO1xyXG4gIH0gY2F0Y2gge31cclxuICB0cnkge1xyXG4gICAgaXBjUmVuZGVyZXIuc2VuZChcImNvZGV4cHA6cHJlbG9hZC1sb2dcIiwgXCJpbmZvXCIsIG1zZyk7XHJcbiAgfSBjYXRjaCB7fVxyXG59XHJcbmZ1bmN0aW9uIHNhZmVTdHJpbmdpZnkodjogdW5rbm93bik6IHN0cmluZyB7XHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBKU09OLnN0cmluZ2lmeSh2KTtcclxuICB9IGNhdGNoIHtcclxuICAgIHJldHVybiBTdHJpbmcodik7XHJcbiAgfVxyXG59XHJcblxyXG5maWxlTG9nKFwicHJlbG9hZCBlbnRyeVwiLCB7IHVybDogbG9jYXRpb24uaHJlZiB9KTtcclxuXHJcbi8vIFJlYWN0IGhvb2sgbXVzdCBiZSBpbnN0YWxsZWQgKmJlZm9yZSogQ29kZXgncyBidW5kbGUgcnVucy5cclxudHJ5IHtcclxuICBpbnN0YWxsUmVhY3RIb29rKCk7XHJcbiAgZmlsZUxvZyhcInJlYWN0IGhvb2sgaW5zdGFsbGVkXCIpO1xyXG59IGNhdGNoIChlKSB7XHJcbiAgZmlsZUxvZyhcInJlYWN0IGhvb2sgRkFJTEVEXCIsIFN0cmluZyhlKSk7XHJcbn1cclxuXHJcbnF1ZXVlTWljcm90YXNrKCgpID0+IHtcclxuICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkaW5nXCIpIHtcclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsIGJvb3QsIHsgb25jZTogdHJ1ZSB9KTtcclxuICB9IGVsc2Uge1xyXG4gICAgYm9vdCgpO1xyXG4gIH1cclxufSk7XHJcblxyXG5hc3luYyBmdW5jdGlvbiBib290KCkge1xyXG4gIGZpbGVMb2coXCJib290IHN0YXJ0XCIsIHsgcmVhZHlTdGF0ZTogZG9jdW1lbnQucmVhZHlTdGF0ZSB9KTtcclxuICB0cnkge1xyXG4gICAgc3RhcnRTZXR0aW5nc0luamVjdG9yKCk7XG4gICAgZmlsZUxvZyhcInNldHRpbmdzIGluamVjdG9yIHN0YXJ0ZWRcIik7XG4gICAgYXdhaXQgc3RhcnRUd2Vha0hvc3QoKTtcbiAgICBmaWxlTG9nKFwidHdlYWsgaG9zdCBzdGFydGVkXCIpO1xuICAgIHN1YnNjcmliZVJlbG9hZCgpO1xuICAgIGZpbGVMb2coXCJib290IGNvbXBsZXRlXCIpO1xuICB9IGNhdGNoIChlKSB7XHJcbiAgICBmaWxlTG9nKFwiYm9vdCBGQUlMRURcIiwgU3RyaW5nKChlIGFzIEVycm9yKT8uc3RhY2sgPz8gZSkpO1xyXG4gICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gcHJlbG9hZCBib290IGZhaWxlZDpcIiwgZSk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBIb3QgcmVsb2FkOiBnYXRlZCBiZWhpbmQgYSBzbWFsbCBpbi1mbGlnaHQgbG9jayBzbyBhIGZsdXJyeSBvZiBmcyBldmVudHNcclxuLy8gZG9lc24ndCByZWVudHJhbnRseSB0ZWFyIGRvd24gdGhlIGhvc3QgbWlkLWxvYWQuXHJcbmxldCByZWxvYWRpbmc6IFByb21pc2U8dm9pZD4gfCBudWxsID0gbnVsbDtcclxuZnVuY3Rpb24gc3Vic2NyaWJlUmVsb2FkKCk6IHZvaWQge1xyXG4gIGlwY1JlbmRlcmVyLm9uKFwiY29kZXhwcDp0d2Vha3MtY2hhbmdlZFwiLCAoKSA9PiB7XHJcbiAgICBpZiAocmVsb2FkaW5nKSByZXR1cm47XHJcbiAgICByZWxvYWRpbmcgPSAoYXN5bmMgKCkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnNvbGUuaW5mbyhcIltjb2RleC1wbHVzcGx1c10gaG90LXJlbG9hZGluZyB0d2Vha3NcIik7XG4gICAgICAgIGF3YWl0IHRlYXJkb3duVHdlYWtIb3N0KCk7XG4gICAgICAgIGF3YWl0IHN0YXJ0VHdlYWtIb3N0KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdIGhvdCByZWxvYWQgZmFpbGVkOlwiLCBlKTtcclxuICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICByZWxvYWRpbmcgPSBudWxsO1xyXG4gICAgICB9XHJcbiAgICB9KSgpO1xyXG4gIH0pO1xyXG59XHJcbiIsICIvKipcclxuICogSW5zdGFsbCBhIG1pbmltYWwgX19SRUFDVF9ERVZUT09MU19HTE9CQUxfSE9PS19fLiBSZWFjdCBjYWxsc1xyXG4gKiBgaG9vay5pbmplY3QocmVuZGVyZXJJbnRlcm5hbHMpYCBkdXJpbmcgYGNyZWF0ZVJvb3RgL2BoeWRyYXRlUm9vdGAuIFRoZVxyXG4gKiBcImludGVybmFsc1wiIG9iamVjdCBleHBvc2VzIGZpbmRGaWJlckJ5SG9zdEluc3RhbmNlLCB3aGljaCBsZXRzIHVzIHR1cm4gYVxyXG4gKiBET00gbm9kZSBpbnRvIGEgUmVhY3QgZmliZXIgXHUyMDE0IG5lY2Vzc2FyeSBmb3Igb3VyIFNldHRpbmdzIGluamVjdG9yLlxyXG4gKlxyXG4gKiBXZSBkb24ndCB3YW50IHRvIGJyZWFrIHJlYWwgUmVhY3QgRGV2VG9vbHMgaWYgdGhlIHVzZXIgb3BlbnMgaXQ7IHdlIGluc3RhbGxcclxuICogb25seSBpZiBubyBob29rIGV4aXN0cyB5ZXQsIGFuZCB3ZSBmb3J3YXJkIGNhbGxzIHRvIGEgZG93bnN0cmVhbSBob29rIGlmXHJcbiAqIG9uZSBpcyBsYXRlciBhc3NpZ25lZC5cclxuICovXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICBpbnRlcmZhY2UgV2luZG93IHtcclxuICAgIF9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXz86IFJlYWN0RGV2dG9vbHNIb29rO1xyXG4gICAgX19jb2RleHBwX18/OiB7XHJcbiAgICAgIGhvb2s6IFJlYWN0RGV2dG9vbHNIb29rO1xyXG4gICAgICByZW5kZXJlcnM6IE1hcDxudW1iZXIsIFJlbmRlcmVySW50ZXJuYWxzPjtcclxuICAgIH07XHJcbiAgfVxyXG59XHJcblxyXG5pbnRlcmZhY2UgUmVuZGVyZXJJbnRlcm5hbHMge1xyXG4gIGZpbmRGaWJlckJ5SG9zdEluc3RhbmNlPzogKG46IE5vZGUpID0+IHVua25vd247XHJcbiAgdmVyc2lvbj86IHN0cmluZztcclxuICBidW5kbGVUeXBlPzogbnVtYmVyO1xyXG4gIHJlbmRlcmVyUGFja2FnZU5hbWU/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSZWFjdERldnRvb2xzSG9vayB7XHJcbiAgc3VwcG9ydHNGaWJlcjogdHJ1ZTtcclxuICByZW5kZXJlcnM6IE1hcDxudW1iZXIsIFJlbmRlcmVySW50ZXJuYWxzPjtcclxuICBvbihldmVudDogc3RyaW5nLCBmbjogKC4uLmE6IHVua25vd25bXSkgPT4gdm9pZCk6IHZvaWQ7XHJcbiAgb2ZmKGV2ZW50OiBzdHJpbmcsIGZuOiAoLi4uYTogdW5rbm93bltdKSA9PiB2b2lkKTogdm9pZDtcclxuICBlbWl0KGV2ZW50OiBzdHJpbmcsIC4uLmE6IHVua25vd25bXSk6IHZvaWQ7XHJcbiAgaW5qZWN0KHJlbmRlcmVyOiBSZW5kZXJlckludGVybmFscyk6IG51bWJlcjtcclxuICBvblNjaGVkdWxlRmliZXJSb290PygpOiB2b2lkO1xyXG4gIG9uQ29tbWl0RmliZXJSb290PygpOiB2b2lkO1xyXG4gIG9uQ29tbWl0RmliZXJVbm1vdW50PygpOiB2b2lkO1xyXG4gIGNoZWNrRENFPygpOiB2b2lkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbFJlYWN0SG9vaygpOiB2b2lkIHtcclxuICBpZiAod2luZG93Ll9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXykgcmV0dXJuO1xyXG4gIGNvbnN0IHJlbmRlcmVycyA9IG5ldyBNYXA8bnVtYmVyLCBSZW5kZXJlckludGVybmFscz4oKTtcclxuICBsZXQgbmV4dElkID0gMTtcclxuICBjb25zdCBsaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PCguLi5hOiB1bmtub3duW10pID0+IHZvaWQ+PigpO1xyXG5cclxuICBjb25zdCBob29rOiBSZWFjdERldnRvb2xzSG9vayA9IHtcclxuICAgIHN1cHBvcnRzRmliZXI6IHRydWUsXHJcbiAgICByZW5kZXJlcnMsXHJcbiAgICBpbmplY3QocmVuZGVyZXIpIHtcclxuICAgICAgY29uc3QgaWQgPSBuZXh0SWQrKztcclxuICAgICAgcmVuZGVyZXJzLnNldChpZCwgcmVuZGVyZXIpO1xyXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgICBjb25zb2xlLmRlYnVnKFxyXG4gICAgICAgIFwiW2NvZGV4LXBsdXNwbHVzXSBSZWFjdCByZW5kZXJlciBhdHRhY2hlZDpcIixcclxuICAgICAgICByZW5kZXJlci5yZW5kZXJlclBhY2thZ2VOYW1lLFxyXG4gICAgICAgIHJlbmRlcmVyLnZlcnNpb24sXHJcbiAgICAgICk7XHJcbiAgICAgIHJldHVybiBpZDtcclxuICAgIH0sXHJcbiAgICBvbihldmVudCwgZm4pIHtcclxuICAgICAgbGV0IHMgPSBsaXN0ZW5lcnMuZ2V0KGV2ZW50KTtcclxuICAgICAgaWYgKCFzKSBsaXN0ZW5lcnMuc2V0KGV2ZW50LCAocyA9IG5ldyBTZXQoKSkpO1xyXG4gICAgICBzLmFkZChmbik7XHJcbiAgICB9LFxyXG4gICAgb2ZmKGV2ZW50LCBmbikge1xyXG4gICAgICBsaXN0ZW5lcnMuZ2V0KGV2ZW50KT8uZGVsZXRlKGZuKTtcclxuICAgIH0sXHJcbiAgICBlbWl0KGV2ZW50LCAuLi5hcmdzKSB7XHJcbiAgICAgIGxpc3RlbmVycy5nZXQoZXZlbnQpPy5mb3JFYWNoKChmbikgPT4gZm4oLi4uYXJncykpO1xyXG4gICAgfSxcclxuICAgIG9uQ29tbWl0RmliZXJSb290KCkge30sXHJcbiAgICBvbkNvbW1pdEZpYmVyVW5tb3VudCgpIHt9LFxyXG4gICAgb25TY2hlZHVsZUZpYmVyUm9vdCgpIHt9LFxyXG4gICAgY2hlY2tEQ0UoKSB7fSxcclxuICB9O1xyXG5cclxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkod2luZG93LCBcIl9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfX1wiLCB7XHJcbiAgICBjb25maWd1cmFibGU6IHRydWUsXHJcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcclxuICAgIHdyaXRhYmxlOiB0cnVlLCAvLyBhbGxvdyByZWFsIERldlRvb2xzIHRvIG92ZXJ3cml0ZSBpZiB1c2VyIGluc3RhbGxzIGl0XHJcbiAgICB2YWx1ZTogaG9vayxcclxuICB9KTtcclxuXHJcbiAgd2luZG93Ll9fY29kZXhwcF9fID0geyBob29rLCByZW5kZXJlcnMgfTtcclxufVxyXG5cclxuLyoqIFJlc29sdmUgdGhlIFJlYWN0IGZpYmVyIGZvciBhIERPTSBub2RlLCBpZiBhbnkgcmVuZGVyZXIgaGFzIG9uZS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGZpYmVyRm9yTm9kZShub2RlOiBOb2RlKTogdW5rbm93biB8IG51bGwge1xyXG4gIGNvbnN0IHJlbmRlcmVycyA9IHdpbmRvdy5fX2NvZGV4cHBfXz8ucmVuZGVyZXJzO1xyXG4gIGlmIChyZW5kZXJlcnMpIHtcclxuICAgIGZvciAoY29uc3QgciBvZiByZW5kZXJlcnMudmFsdWVzKCkpIHtcclxuICAgICAgY29uc3QgZiA9IHIuZmluZEZpYmVyQnlIb3N0SW5zdGFuY2U/Lihub2RlKTtcclxuICAgICAgaWYgKGYpIHJldHVybiBmO1xyXG4gICAgfVxyXG4gIH1cclxuICAvLyBGYWxsYmFjazogcmVhZCB0aGUgUmVhY3QgaW50ZXJuYWwgcHJvcGVydHkgZGlyZWN0bHkgZnJvbSB0aGUgRE9NIG5vZGUuXHJcbiAgLy8gUmVhY3Qgc3RvcmVzIGZpYmVycyBhcyBhIHByb3BlcnR5IHdob3NlIGtleSBzdGFydHMgd2l0aCBcIl9fcmVhY3RGaWJlclwiLlxyXG4gIGZvciAoY29uc3QgayBvZiBPYmplY3Qua2V5cyhub2RlKSkge1xyXG4gICAgaWYgKGsuc3RhcnRzV2l0aChcIl9fcmVhY3RGaWJlclwiKSkgcmV0dXJuIChub2RlIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tdO1xyXG4gIH1cclxuICByZXR1cm4gbnVsbDtcclxufVxyXG4iLCAiLyoqXHJcbiAqIFNldHRpbmdzIGluamVjdG9yIGZvciBDb2RleCdzIFNldHRpbmdzIHBhZ2UuXHJcbiAqXHJcbiAqIENvZGV4J3Mgc2V0dGluZ3MgaXMgYSByb3V0ZWQgcGFnZSAoVVJMIHN0YXlzIGF0IGAvaW5kZXguaHRtbD9ob3N0SWQ9bG9jYWxgKVxyXG4gKiBOT1QgYSBtb2RhbCBkaWFsb2cuIFRoZSBzaWRlYmFyIGxpdmVzIGluc2lkZSBhIGA8ZGl2IGNsYXNzPVwiZmxleCBmbGV4LWNvbFxyXG4gKiBnYXAtMSBnYXAtMFwiPmAgd3JhcHBlciB0aGF0IGhvbGRzIG9uZSBvciBtb3JlIGA8ZGl2IGNsYXNzPVwiZmxleCBmbGV4LWNvbFxyXG4gKiBnYXAtcHhcIj5gIGdyb3VwcyBvZiBidXR0b25zLiBUaGVyZSBhcmUgbm8gc3RhYmxlIGByb2xlYCAvIGBhcmlhLWxhYmVsYCAvXHJcbiAqIGBkYXRhLXRlc3RpZGAgaG9va3Mgb24gdGhlIHNoZWxsIHNvIHdlIGlkZW50aWZ5IHRoZSBzaWRlYmFyIGJ5IHRleHQtY29udGVudFxyXG4gKiBtYXRjaCBhZ2FpbnN0IGtub3duIGl0ZW0gbGFiZWxzIChHZW5lcmFsLCBBcHBlYXJhbmNlLCBDb25maWd1cmF0aW9uLCBcdTIwMjYpLlxyXG4gKlxyXG4gKiBMYXlvdXQgd2UgaW5qZWN0OlxyXG4gKlxyXG4gKiAgIFtDb2RleCdzIGV4aXN0aW5nIGl0ZW1zIGdyb3VwXVxyXG4gKiAgIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCAoYm9yZGVyLXQtdG9rZW4tYm9yZGVyKVxyXG4gKiAgIENPREVYIFBMVVMgUExVUyAgICAgICAgICAgICAgICh1cHBlcmNhc2Ugc3VidGl0bGUsIHRleHQtdG9rZW4tdGV4dC10ZXJ0aWFyeSlcclxuICogICBcdTI0RDggQ29uZmlnXHJcbiAqICAgXHUyNjMwIFR3ZWFrc1xyXG4gKlxyXG4gKiBDbGlja2luZyBDb25maWcgLyBUd2Vha3MgaGlkZXMgQ29kZXgncyBjb250ZW50IHBhbmVsIGNoaWxkcmVuIGFuZCByZW5kZXJzXHJcbiAqIG91ciBvd24gYG1haW4tc3VyZmFjZWAgcGFuZWwgaW4gdGhlaXIgcGxhY2UuIENsaWNraW5nIGFueSBvZiBDb2RleCdzXHJcbiAqIHNpZGViYXIgaXRlbXMgcmVzdG9yZXMgdGhlIG9yaWdpbmFsIHZpZXcuXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIFNldHRpbmdzU2VjdGlvbixcclxuICBTZXR0aW5nc1BhZ2UsXHJcbiAgU2V0dGluZ3NIYW5kbGUsXHJcbiAgVHdlYWtNYW5pZmVzdCxcclxufSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xyXG5cclxuLy8gTWlycm9ycyB0aGUgcnVudGltZSdzIG1haW4tc2lkZSBMaXN0ZWRUd2VhayBzaGFwZSAoa2VwdCBpbiBzeW5jIG1hbnVhbGx5KS5cclxuaW50ZXJmYWNlIExpc3RlZFR3ZWFrIHtcclxuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcclxuICBlbnRyeTogc3RyaW5nO1xyXG4gIGRpcjogc3RyaW5nO1xuICBlbnRyeUV4aXN0czogYm9vbGVhbjtcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgbG9hZGFibGU6IGJvb2xlYW47XG4gIGxvYWRFcnJvcj86IHN0cmluZztcbiAgY2FwYWJpbGl0aWVzPzogc3RyaW5nW107XG4gIHVwZGF0ZTogVHdlYWtVcGRhdGVDaGVjayB8IG51bGw7XG59XG5cclxuaW50ZXJmYWNlIFR3ZWFrVXBkYXRlQ2hlY2sge1xyXG4gIGNoZWNrZWRBdDogc3RyaW5nO1xyXG4gIHJlcG86IHN0cmluZztcclxuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xyXG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XHJcbiAgbGF0ZXN0VGFnOiBzdHJpbmcgfCBudWxsO1xyXG4gIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XHJcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xyXG4gIGVycm9yPzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29kZXhQbHVzUGx1c0NvbmZpZyB7XHJcbiAgdmVyc2lvbjogc3RyaW5nO1xyXG4gIGF1dG9VcGRhdGU6IGJvb2xlYW47XHJcbiAgdXBkYXRlQ2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB8IG51bGw7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sge1xuICBjaGVja2VkQXQ6IHN0cmluZztcclxuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xyXG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XHJcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcclxuICByZWxlYXNlTm90ZXM6IHN0cmluZyB8IG51bGw7XHJcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xyXG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUnVudGltZUhlYWx0aCB7XG4gIHZlcnNpb246IHN0cmluZztcbiAgcGF0aHM6IHtcbiAgICB1c2VyUm9vdDogc3RyaW5nO1xuICAgIHJ1bnRpbWVEaXI6IHN0cmluZztcbiAgICB0d2Vha3NEaXI6IHN0cmluZztcbiAgICBsb2dEaXI6IHN0cmluZztcbiAgfTtcbiAgdHdlYWtzOiB7XG4gICAgZGlzY292ZXJlZDogbnVtYmVyO1xuICAgIGxvYWRlZE1haW46IG51bWJlcjtcbiAgICBsb2FkZWRSZW5kZXJlcjogbnVtYmVyIHwgbnVsbDtcbiAgfTtcbiAgc3RhcnRlZEF0OiBzdHJpbmc7XG4gIGxhc3RSZWxvYWQ6IHsgYXQ6IHN0cmluZzsgcmVhc29uOiBzdHJpbmc7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9IHwgbnVsbDtcbiAgcmVjZW50RXJyb3JzOiBBcnJheTx7IGF0OiBzdHJpbmc7IGxldmVsOiBcIndhcm5cIiB8IFwiZXJyb3JcIjsgbWVzc2FnZTogc3RyaW5nIH0+O1xufVxuXG5pbnRlcmZhY2UgVXNlclBhdGhzIHtcbiAgdXNlclJvb3Q6IHN0cmluZztcbiAgcnVudGltZURpcjogc3RyaW5nO1xuICB0d2Vha3NEaXI6IHN0cmluZztcbiAgbG9nRGlyOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTdXBwb3J0QnVuZGxlUmVzdWx0IHtcbiAgZGlyOiBzdHJpbmc7XG59XG5cbnR5cGUgVHdlYWtTdGF0dXNGaWx0ZXIgPSBcImFsbFwiIHwgXCJhdHRlbnRpb25cIiB8IFwidXBkYXRlc1wiIHwgXCJlbmFibGVkXCIgfCBcImRpc2FibGVkXCI7XG50eXBlIEZlZWRiYWNrS2luZCA9IFwiaW5mb1wiIHwgXCJzdWNjZXNzXCIgfCBcImVycm9yXCI7XG5cbi8qKlxuICogQSB0d2Vhay1yZWdpc3RlcmVkIHBhZ2UuIFdlIGNhcnJ5IHRoZSBvd25pbmcgdHdlYWsncyBtYW5pZmVzdCBzbyB3ZSBjYW5cbiAqIHJlc29sdmUgcmVsYXRpdmUgaWNvblVybHMgYW5kIHNob3cgYXV0aG9yc2hpcCBpbiB0aGUgcGFnZSBoZWFkZXIuXHJcbiAqL1xyXG5pbnRlcmZhY2UgUmVnaXN0ZXJlZFBhZ2Uge1xyXG4gIC8qKiBGdWxseS1xdWFsaWZpZWQgaWQ6IGA8dHdlYWtJZD46PHBhZ2VJZD5gLiAqL1xyXG4gIGlkOiBzdHJpbmc7XHJcbiAgdHdlYWtJZDogc3RyaW5nO1xyXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xyXG4gIHBhZ2U6IFNldHRpbmdzUGFnZTtcclxuICAvKiogUGVyLXBhZ2UgRE9NIHRlYXJkb3duIHJldHVybmVkIGJ5IGBwYWdlLnJlbmRlcmAsIGlmIGFueS4gKi9cclxuICB0ZWFyZG93bj86ICgoKSA9PiB2b2lkKSB8IG51bGw7XHJcbiAgLyoqIFRoZSBpbmplY3RlZCBzaWRlYmFyIGJ1dHRvbiAoc28gd2UgY2FuIHVwZGF0ZSBpdHMgYWN0aXZlIHN0YXRlKS4gKi9cclxuICBuYXZCdXR0b24/OiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGw7XHJcbn1cclxuXHJcbi8qKiBXaGF0IHBhZ2UgaXMgY3VycmVudGx5IHNlbGVjdGVkIGluIG91ciBpbmplY3RlZCBuYXYuICovXHJcbnR5cGUgQWN0aXZlUGFnZSA9XHJcbiAgfCB7IGtpbmQ6IFwiY29uZmlnXCIgfVxyXG4gIHwgeyBraW5kOiBcInR3ZWFrc1wiIH1cclxuICB8IHsga2luZDogXCJyZWdpc3RlcmVkXCI7IGlkOiBzdHJpbmcgfTtcclxuXHJcbmludGVyZmFjZSBJbmplY3RvclN0YXRlIHtcclxuICBzZWN0aW9uczogTWFwPHN0cmluZywgU2V0dGluZ3NTZWN0aW9uPjtcclxuICBwYWdlczogTWFwPHN0cmluZywgUmVnaXN0ZXJlZFBhZ2U+O1xyXG4gIGxpc3RlZFR3ZWFrczogTGlzdGVkVHdlYWtbXTtcclxuICAvKiogT3V0ZXIgd3JhcHBlciB0aGF0IGhvbGRzIENvZGV4J3MgaXRlbXMgZ3JvdXAgKyBvdXIgaW5qZWN0ZWQgZ3JvdXBzLiAqL1xyXG4gIG91dGVyV3JhcHBlcjogSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gIC8qKiBPdXIgXCJDb2RleCBQbHVzIFBsdXNcIiBuYXYgZ3JvdXAgKENvbmZpZy9Ud2Vha3MpLiAqL1xyXG4gIG5hdkdyb3VwOiBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgbmF2QnV0dG9uczogeyBjb25maWc6IEhUTUxCdXR0b25FbGVtZW50OyB0d2Vha3M6IEhUTUxCdXR0b25FbGVtZW50IH0gfCBudWxsO1xyXG4gIC8qKiBPdXIgXCJUd2Vha3NcIiBuYXYgZ3JvdXAgKHBlci10d2VhayBwYWdlcykuIENyZWF0ZWQgbGF6aWx5LiAqL1xyXG4gIHBhZ2VzR3JvdXA6IEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICBwYWdlc0dyb3VwS2V5OiBzdHJpbmcgfCBudWxsO1xyXG4gIHBhbmVsSG9zdDogSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gIG9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyIHwgbnVsbDtcclxuICBmaW5nZXJwcmludDogc3RyaW5nIHwgbnVsbDtcbiAgc2lkZWJhckR1bXBlZDogYm9vbGVhbjtcbiAgYWN0aXZlUGFnZTogQWN0aXZlUGFnZSB8IG51bGw7XG4gIHNpZGViYXJSb290OiBIVE1MRWxlbWVudCB8IG51bGw7XG4gIHNpZGViYXJSZXN0b3JlSGFuZGxlcjogKChlOiBFdmVudCkgPT4gdm9pZCkgfCBudWxsO1xuICB0d2Vha3NTZWFyY2g6IHN0cmluZztcbiAgdHdlYWtzRmlsdGVyOiBUd2Vha1N0YXR1c0ZpbHRlcjtcbiAgZmVlZGJhY2s6IE1hcDxzdHJpbmcsIHsga2luZDogRmVlZGJhY2tLaW5kOyBtZXNzYWdlOiBzdHJpbmcgfT47XG4gIGNvbmZpcm1lZE1haW5Ud2Vha3M6IFNldDxzdHJpbmc+O1xuICBjb25maWdSZXF1ZXN0VG9rZW46IG51bWJlcjtcbiAgaGVhbHRoUmVxdWVzdFRva2VuOiBudW1iZXI7XG4gIHVwZGF0ZVJlcXVlc3RUb2tlbjogbnVtYmVyO1xuICBsYXN0U3VwcG9ydEJ1bmRsZURpcjogc3RyaW5nIHwgbnVsbDtcbn1cblxyXG5jb25zdCBzdGF0ZTogSW5qZWN0b3JTdGF0ZSA9IHtcclxuICBzZWN0aW9uczogbmV3IE1hcCgpLFxyXG4gIHBhZ2VzOiBuZXcgTWFwKCksXHJcbiAgbGlzdGVkVHdlYWtzOiBbXSxcclxuICBvdXRlcldyYXBwZXI6IG51bGwsXHJcbiAgbmF2R3JvdXA6IG51bGwsXHJcbiAgbmF2QnV0dG9uczogbnVsbCxcclxuICBwYWdlc0dyb3VwOiBudWxsLFxyXG4gIHBhZ2VzR3JvdXBLZXk6IG51bGwsXHJcbiAgcGFuZWxIb3N0OiBudWxsLFxyXG4gIG9ic2VydmVyOiBudWxsLFxyXG4gIGZpbmdlcnByaW50OiBudWxsLFxyXG4gIHNpZGViYXJEdW1wZWQ6IGZhbHNlLFxyXG4gIGFjdGl2ZVBhZ2U6IG51bGwsXG4gIHNpZGViYXJSb290OiBudWxsLFxuICBzaWRlYmFyUmVzdG9yZUhhbmRsZXI6IG51bGwsXG4gIHR3ZWFrc1NlYXJjaDogXCJcIixcbiAgdHdlYWtzRmlsdGVyOiBcImFsbFwiLFxuICBmZWVkYmFjazogbmV3IE1hcCgpLFxuICBjb25maXJtZWRNYWluVHdlYWtzOiBuZXcgU2V0KCksXG4gIGNvbmZpZ1JlcXVlc3RUb2tlbjogMCxcbiAgaGVhbHRoUmVxdWVzdFRva2VuOiAwLFxuICB1cGRhdGVSZXF1ZXN0VG9rZW46IDAsXG4gIGxhc3RTdXBwb3J0QnVuZGxlRGlyOiBudWxsLFxufTtcblxyXG5mdW5jdGlvbiBwbG9nKG1zZzogc3RyaW5nLCBleHRyYT86IHVua25vd24pOiB2b2lkIHtcclxuICBpcGNSZW5kZXJlci5zZW5kKFxyXG4gICAgXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsXHJcbiAgICBcImluZm9cIixcclxuICAgIGBbc2V0dGluZ3MtaW5qZWN0b3JdICR7bXNnfSR7ZXh0cmEgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBcIiBcIiArIHNhZmVTdHJpbmdpZnkoZXh0cmEpfWAsXHJcbiAgKTtcclxufVxyXG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcge1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogSlNPTi5zdHJpbmdpZnkodik7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICByZXR1cm4gU3RyaW5nKHYpO1xyXG4gIH1cclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHB1YmxpYyBBUEkgXHUyNTAwXHUyNTAwXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRTZXR0aW5nc0luamVjdG9yKCk6IHZvaWQge1xuICBpZiAoc3RhdGUub2JzZXJ2ZXIpIHJldHVybjtcclxuXHJcbiAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xyXG4gICAgdHJ5SW5qZWN0KCk7XHJcbiAgICBtYXliZUR1bXBEb20oKTtcclxuICB9KTtcclxuICBvYnMub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xyXG4gIHN0YXRlLm9ic2VydmVyID0gb2JzO1xyXG5cclxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInBvcHN0YXRlXCIsIG9uTmF2KTtcclxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImhhc2hjaGFuZ2VcIiwgb25OYXYpO1xyXG4gIGZvciAoY29uc3QgbSBvZiBbXCJwdXNoU3RhdGVcIiwgXCJyZXBsYWNlU3RhdGVcIl0gYXMgY29uc3QpIHtcclxuICAgIGNvbnN0IG9yaWcgPSBoaXN0b3J5W21dO1xyXG4gICAgaGlzdG9yeVttXSA9IGZ1bmN0aW9uICh0aGlzOiBIaXN0b3J5LCAuLi5hcmdzOiBQYXJhbWV0ZXJzPHR5cGVvZiBvcmlnPikge1xyXG4gICAgICBjb25zdCByID0gb3JpZy5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KGBjb2RleHBwLSR7bX1gKSk7XHJcbiAgICAgIHJldHVybiByO1xyXG4gICAgfSBhcyB0eXBlb2Ygb3JpZztcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKGBjb2RleHBwLSR7bX1gLCBvbk5hdik7XHJcbiAgfVxyXG5cclxuICB0cnlJbmplY3QoKTtcclxuICBtYXliZUR1bXBEb20oKTtcclxuICBsZXQgdGlja3MgPSAwO1xyXG4gIGNvbnN0IGludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xyXG4gICAgdGlja3MrKztcclxuICAgIHRyeUluamVjdCgpO1xyXG4gICAgbWF5YmVEdW1wRG9tKCk7XHJcbiAgICBpZiAodGlja3MgPiA2MCkgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XHJcbiAgfSwgNTAwKTtcclxufVxuXG5leHBvcnQgZnVuY3Rpb24gX190cnlJbmplY3RGb3JUZXN0cygpOiB2b2lkIHtcbiAgdHJ5SW5qZWN0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBfX3Jlc2V0U2V0dGluZ3NJbmplY3RvckZvclRlc3RzKCk6IHZvaWQge1xuICBzdGF0ZS5vYnNlcnZlcj8uZGlzY29ubmVjdCgpO1xuICBzdGF0ZS5vYnNlcnZlciA9IG51bGw7XG4gIGZvciAoY29uc3QgcCBvZiBzdGF0ZS5wYWdlcy52YWx1ZXMoKSkge1xuICAgIHRyeSB7XG4gICAgICBwLnRlYXJkb3duPy4oKTtcbiAgICB9IGNhdGNoIHt9XG4gIH1cbiAgc3RhdGUuc2VjdGlvbnMuY2xlYXIoKTtcbiAgc3RhdGUucGFnZXMuY2xlYXIoKTtcbiAgc3RhdGUubGlzdGVkVHdlYWtzID0gW107XG4gIHN0YXRlLm91dGVyV3JhcHBlciA9IG51bGw7XG4gIHN0YXRlLm5hdkdyb3VwID0gbnVsbDtcbiAgc3RhdGUubmF2QnV0dG9ucyA9IG51bGw7XG4gIHN0YXRlLnBhZ2VzR3JvdXAgPSBudWxsO1xuICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gbnVsbDtcbiAgc3RhdGUucGFuZWxIb3N0ID0gbnVsbDtcbiAgc3RhdGUuZmluZ2VycHJpbnQgPSBudWxsO1xuICBzdGF0ZS5zaWRlYmFyRHVtcGVkID0gZmFsc2U7XG4gIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xuICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG51bGw7XG4gIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlciA9IG51bGw7XG4gIHN0YXRlLnR3ZWFrc1NlYXJjaCA9IFwiXCI7XG4gIHN0YXRlLnR3ZWFrc0ZpbHRlciA9IFwiYWxsXCI7XG4gIHN0YXRlLmZlZWRiYWNrLmNsZWFyKCk7XG4gIHN0YXRlLmNvbmZpcm1lZE1haW5Ud2Vha3MuY2xlYXIoKTtcbiAgc3RhdGUuY29uZmlnUmVxdWVzdFRva2VuID0gMDtcbiAgc3RhdGUuaGVhbHRoUmVxdWVzdFRva2VuID0gMDtcbiAgc3RhdGUudXBkYXRlUmVxdWVzdFRva2VuID0gMDtcbiAgc3RhdGUubGFzdFN1cHBvcnRCdW5kbGVEaXIgPSBudWxsO1xufVxuXG5mdW5jdGlvbiBvbk5hdigpOiB2b2lkIHtcbiAgc3RhdGUuZmluZ2VycHJpbnQgPSBudWxsO1xyXG4gIHRyeUluamVjdCgpO1xyXG4gIG1heWJlRHVtcERvbSgpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJTZWN0aW9uKHNlY3Rpb246IFNldHRpbmdzU2VjdGlvbik6IFNldHRpbmdzSGFuZGxlIHtcclxuICBzdGF0ZS5zZWN0aW9ucy5zZXQoc2VjdGlvbi5pZCwgc2VjdGlvbik7XHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2U/LmtpbmQgPT09IFwidHdlYWtzXCIpIHJlcmVuZGVyKCk7XHJcbiAgcmV0dXJuIHtcclxuICAgIHVucmVnaXN0ZXI6ICgpID0+IHtcclxuICAgICAgc3RhdGUuc2VjdGlvbnMuZGVsZXRlKHNlY3Rpb24uaWQpO1xyXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVyZW5kZXIoKTtcclxuICAgIH0sXHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyU2VjdGlvbnMoKTogdm9pZCB7XHJcbiAgc3RhdGUuc2VjdGlvbnMuY2xlYXIoKTtcclxuICAvLyBEcm9wIHJlZ2lzdGVyZWQgcGFnZXMgdG9vIFx1MjAxNCB0aGV5J3JlIG93bmVkIGJ5IHR3ZWFrcyB0aGF0IGp1c3QgZ290XHJcbiAgLy8gdG9ybiBkb3duIGJ5IHRoZSBob3N0LiBSdW4gYW55IHRlYXJkb3ducyBiZWZvcmUgZm9yZ2V0dGluZyB0aGVtLlxyXG4gIGZvciAoY29uc3QgcCBvZiBzdGF0ZS5wYWdlcy52YWx1ZXMoKSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgcC50ZWFyZG93bj8uKCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgIHBsb2coXCJwYWdlIHRlYXJkb3duIGZhaWxlZFwiLCB7IGlkOiBwLmlkLCBlcnI6IFN0cmluZyhlKSB9KTtcclxuICAgIH1cclxuICB9XHJcbiAgc3RhdGUucGFnZXMuY2xlYXIoKTtcclxuICBzeW5jUGFnZXNHcm91cCgpO1xyXG4gIC8vIElmIHdlIHdlcmUgb24gYSByZWdpc3RlcmVkIHBhZ2UgdGhhdCBubyBsb25nZXIgZXhpc3RzLCBmYWxsIGJhY2sgdG9cclxuICAvLyByZXN0b3JpbmcgQ29kZXgncyB2aWV3LlxyXG4gIGlmIChcclxuICAgIHN0YXRlLmFjdGl2ZVBhZ2U/LmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiICYmXHJcbiAgICAhc3RhdGUucGFnZXMuaGFzKHN0YXRlLmFjdGl2ZVBhZ2UuaWQpXHJcbiAgKSB7XHJcbiAgICByZXN0b3JlQ29kZXhWaWV3KCk7XHJcbiAgfSBlbHNlIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSB7XHJcbiAgICByZXJlbmRlcigpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlZ2lzdGVyIGEgdHdlYWstb3duZWQgc2V0dGluZ3MgcGFnZS4gVGhlIHJ1bnRpbWUgaW5qZWN0cyBhIHNpZGViYXIgZW50cnlcclxuICogdW5kZXIgYSBcIlRXRUFLU1wiIGdyb3VwIGhlYWRlciAod2hpY2ggYXBwZWFycyBvbmx5IHdoZW4gYXQgbGVhc3Qgb25lIHBhZ2VcclxuICogaXMgcmVnaXN0ZXJlZCkgYW5kIHJvdXRlcyBjbGlja3MgdG8gdGhlIHBhZ2UncyBgcmVuZGVyKHJvb3QpYC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclBhZ2UoXHJcbiAgdHdlYWtJZDogc3RyaW5nLFxyXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LFxyXG4gIHBhZ2U6IFNldHRpbmdzUGFnZSxcclxuKTogU2V0dGluZ3NIYW5kbGUge1xyXG4gIGNvbnN0IGlkID0gcGFnZS5pZDsgLy8gYWxyZWFkeSBuYW1lc3BhY2VkIGJ5IHR3ZWFrLWhvc3QgYXMgYCR7dHdlYWtJZH06JHtwYWdlLmlkfWBcclxuICBjb25zdCBlbnRyeTogUmVnaXN0ZXJlZFBhZ2UgPSB7IGlkLCB0d2Vha0lkLCBtYW5pZmVzdCwgcGFnZSB9O1xyXG4gIHN0YXRlLnBhZ2VzLnNldChpZCwgZW50cnkpO1xyXG4gIHBsb2coXCJyZWdpc3RlclBhZ2VcIiwgeyBpZCwgdGl0bGU6IHBhZ2UudGl0bGUsIHR3ZWFrSWQgfSk7XHJcbiAgc3luY1BhZ2VzR3JvdXAoKTtcclxuICAvLyBJZiB0aGUgdXNlciB3YXMgYWxyZWFkeSBvbiB0aGlzIHBhZ2UgKGhvdCByZWxvYWQpLCByZS1tb3VudCBpdHMgYm9keS5cclxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcclxuICAgIHJlcmVuZGVyKCk7XHJcbiAgfVxyXG4gIHJldHVybiB7XHJcbiAgICB1bnJlZ2lzdGVyOiAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGUgPSBzdGF0ZS5wYWdlcy5nZXQoaWQpO1xyXG4gICAgICBpZiAoIWUpIHJldHVybjtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBlLnRlYXJkb3duPy4oKTtcclxuICAgICAgfSBjYXRjaCB7fVxyXG4gICAgICBzdGF0ZS5wYWdlcy5kZWxldGUoaWQpO1xyXG4gICAgICBzeW5jUGFnZXNHcm91cCgpO1xyXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcclxuICAgICAgICByZXN0b3JlQ29kZXhWaWV3KCk7XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgfTtcclxufVxyXG5cclxuLyoqIENhbGxlZCBieSB0aGUgdHdlYWsgaG9zdCBhZnRlciBmZXRjaGluZyB0aGUgdHdlYWsgbGlzdCBmcm9tIG1haW4uICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRMaXN0ZWRUd2Vha3MobGlzdDogTGlzdGVkVHdlYWtbXSk6IHZvaWQge1xyXG4gIHN0YXRlLmxpc3RlZFR3ZWFrcyA9IGxpc3Q7XHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2U/LmtpbmQgPT09IFwidHdlYWtzXCIpIHJlcmVuZGVyKCk7XHJcbn1cclxuXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBpbmplY3Rpb24gXHUyNTAwXHUyNTAwXHJcblxyXG5mdW5jdGlvbiB0cnlJbmplY3QoKTogdm9pZCB7XHJcbiAgY29uc3QgaXRlbXNHcm91cCA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xyXG4gIGlmICghaXRlbXNHcm91cCkge1xyXG4gICAgcGxvZyhcInNpZGViYXIgbm90IGZvdW5kXCIpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICAvLyBDb2RleCdzIGl0ZW1zIGdyb3VwIGxpdmVzIGluc2lkZSBhbiBvdXRlciB3cmFwcGVyIHRoYXQncyBhbHJlYWR5IHN0eWxlZFxyXG4gIC8vIHRvIGhvbGQgbXVsdGlwbGUgZ3JvdXBzIChgZmxleCBmbGV4LWNvbCBnYXAtMSBnYXAtMGApLiBXZSBpbmplY3Qgb3VyXHJcbiAgLy8gZ3JvdXAgYXMgYSBzaWJsaW5nIHNvIHRoZSBuYXR1cmFsIGdhcC0xIGFjdHMgYXMgb3VyIHZpc3VhbCBzZXBhcmF0b3IuXHJcbiAgY29uc3Qgb3V0ZXIgPSBpdGVtc0dyb3VwLnBhcmVudEVsZW1lbnQgPz8gaXRlbXNHcm91cDtcclxuICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG91dGVyO1xyXG5cclxuICBpZiAoc3RhdGUubmF2R3JvdXAgJiYgb3V0ZXIuY29udGFpbnMoc3RhdGUubmF2R3JvdXApKSB7XHJcbiAgICBzeW5jUGFnZXNHcm91cCgpO1xyXG4gICAgLy8gQ29kZXggcmUtcmVuZGVycyBpdHMgbmF0aXZlIHNpZGViYXIgYnV0dG9ucyBvbiBpdHMgb3duIHN0YXRlIGNoYW5nZXMuXHJcbiAgICAvLyBJZiBvbmUgb2Ygb3VyIHBhZ2VzIGlzIGFjdGl2ZSwgcmUtc3RyaXAgQ29kZXgncyBhY3RpdmUgc3R5bGluZyBzb1xyXG4gICAgLy8gR2VuZXJhbCBkb2Vzbid0IHJlYXBwZWFyIGFzIHNlbGVjdGVkLlxyXG4gICAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2UgIT09IG51bGwpIHN5bmNDb2RleE5hdGl2ZU5hdkFjdGl2ZSh0cnVlKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIC8vIFNpZGViYXIgd2FzIGVpdGhlciBmcmVzaGx5IG1vdW50ZWQgKFNldHRpbmdzIGp1c3Qgb3BlbmVkKSBvciByZS1tb3VudGVkXHJcbiAgLy8gKGNsb3NlZCBhbmQgcmUtb3BlbmVkLCBvciBuYXZpZ2F0ZWQgYXdheSBhbmQgYmFjaykuIEluIGFsbCBvZiB0aG9zZVxyXG4gIC8vIGNhc2VzIENvZGV4IHJlc2V0cyB0byBpdHMgZGVmYXVsdCBwYWdlIChHZW5lcmFsKSwgYnV0IG91ciBpbi1tZW1vcnlcclxuICAvLyBgYWN0aXZlUGFnZWAgbWF5IHN0aWxsIHJlZmVyZW5jZSB0aGUgbGFzdCB0d2Vhay9wYWdlIHRoZSB1c2VyIGhhZCBvcGVuXHJcbiAgLy8gXHUyMDE0IHdoaWNoIHdvdWxkIGNhdXNlIHRoYXQgbmF2IGJ1dHRvbiB0byByZW5kZXIgd2l0aCB0aGUgYWN0aXZlIHN0eWxpbmdcclxuICAvLyBldmVuIHRob3VnaCBDb2RleCBpcyBzaG93aW5nIEdlbmVyYWwuIENsZWFyIGl0IHNvIGBzeW5jUGFnZXNHcm91cGAgL1xyXG4gIC8vIGBzZXROYXZBY3RpdmVgIHN0YXJ0IGZyb20gYSBuZXV0cmFsIHN0YXRlLiBUaGUgcGFuZWxIb3N0IHJlZmVyZW5jZSBpc1xyXG4gIC8vIGFsc28gc3RhbGUgKGl0cyBET00gd2FzIGRpc2NhcmRlZCB3aXRoIHRoZSBwcmV2aW91cyBjb250ZW50IGFyZWEpLlxyXG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlICE9PSBudWxsIHx8IHN0YXRlLnBhbmVsSG9zdCAhPT0gbnVsbCkge1xyXG4gICAgcGxvZyhcInNpZGViYXIgcmUtbW91bnQgZGV0ZWN0ZWQ7IGNsZWFyaW5nIHN0YWxlIGFjdGl2ZSBzdGF0ZVwiLCB7XHJcbiAgICAgIHByZXZBY3RpdmU6IHN0YXRlLmFjdGl2ZVBhZ2UsXHJcbiAgICB9KTtcclxuICAgIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xyXG4gICAgc3RhdGUucGFuZWxIb3N0ID0gbnVsbDtcclxuICB9XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBHcm91cCBjb250YWluZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgY29uc3QgZ3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGdyb3VwLmRhdGFzZXQuY29kZXhwcCA9IFwibmF2LWdyb3VwXCI7XHJcbiAgZ3JvdXAuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC1weFwiO1xyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgU2VjdGlvbiBoZWFkZXIgLyBzdWJ0aXRsZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICAvLyBDb2RleCBkb2Vzbid0IChjdXJyZW50bHkpIHNoaXAgYSBzaWRlYmFyIGdyb3VwIGhlYWRlciwgc28gd2UgbWlycm9yIHRoZVxyXG4gIC8vIHZpc3VhbCB3ZWlnaHQgb2YgYHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZGAgdXBwZXJjYXNlIGxhYmVsc1xyXG4gIC8vIHVzZWQgZWxzZXdoZXJlIGluIHRoZWlyIFVJLiBQYWRkaW5nIG1hdGNoZXMgdGhlIGBweC1yb3cteGAgb2YgaXRlbXMuXHJcbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoZWFkZXIuY2xhc3NOYW1lID1cclxuICAgIFwicHgtcm93LXggcHQtMiBwYi0xIHRleHQtWzExcHhdIGZvbnQtbWVkaXVtIHVwcGVyY2FzZSB0cmFja2luZy13aWRlciB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmQgc2VsZWN0LW5vbmVcIjtcclxuICBoZWFkZXIudGV4dENvbnRlbnQgPSBcIkNvZGV4IFBsdXMgUGx1c1wiO1xyXG4gIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBUd28gc2lkZWJhciBpdGVtcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICBjb25zdCBjb25maWdCdG4gPSBtYWtlU2lkZWJhckl0ZW0oXCJDb25maWdcIiwgY29uZmlnSWNvblN2ZygpKTtcclxuICBjb25zdCB0d2Vha3NCdG4gPSBtYWtlU2lkZWJhckl0ZW0oXCJUd2Vha3NcIiwgdHdlYWtzSWNvblN2ZygpKTtcclxuXHJcbiAgY29uZmlnQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwiY29uZmlnXCIgfSk7XHJcbiAgfSk7XHJcbiAgdHdlYWtzQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwidHdlYWtzXCIgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGdyb3VwLmFwcGVuZENoaWxkKGNvbmZpZ0J0bik7XHJcbiAgZ3JvdXAuYXBwZW5kQ2hpbGQodHdlYWtzQnRuKTtcclxuICBvdXRlci5hcHBlbmRDaGlsZChncm91cCk7XHJcblxyXG4gIHN0YXRlLm5hdkdyb3VwID0gZ3JvdXA7XHJcbiAgc3RhdGUubmF2QnV0dG9ucyA9IHsgY29uZmlnOiBjb25maWdCdG4sIHR3ZWFrczogdHdlYWtzQnRuIH07XHJcbiAgcGxvZyhcIm5hdiBncm91cCBpbmplY3RlZFwiLCB7IG91dGVyVGFnOiBvdXRlci50YWdOYW1lIH0pO1xyXG4gIHN5bmNQYWdlc0dyb3VwKCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgKG9yIHJlLXJlbmRlcikgdGhlIHNlY29uZCBzaWRlYmFyIGdyb3VwIG9mIHBlci10d2VhayBwYWdlcy4gVGhlXHJcbiAqIGdyb3VwIGlzIGNyZWF0ZWQgbGF6aWx5IGFuZCByZW1vdmVkIHdoZW4gdGhlIGxhc3QgcGFnZSB1bnJlZ2lzdGVycywgc29cclxuICogdXNlcnMgd2l0aCBubyBwYWdlLXJlZ2lzdGVyaW5nIHR3ZWFrcyBuZXZlciBzZWUgYW4gZW1wdHkgXCJUd2Vha3NcIiBoZWFkZXIuXHJcbiAqL1xyXG5mdW5jdGlvbiBzeW5jUGFnZXNHcm91cCgpOiB2b2lkIHtcclxuICBjb25zdCBvdXRlciA9IHN0YXRlLnNpZGViYXJSb290O1xyXG4gIGlmICghb3V0ZXIpIHJldHVybjtcclxuICBjb25zdCBwYWdlcyA9IFsuLi5zdGF0ZS5wYWdlcy52YWx1ZXMoKV07XHJcblxyXG4gIC8vIEJ1aWxkIGEgZGV0ZXJtaW5pc3RpYyBmaW5nZXJwcmludCBvZiB0aGUgZGVzaXJlZCBncm91cCBzdGF0ZS4gSWYgdGhlXHJcbiAgLy8gY3VycmVudCBET00gZ3JvdXAgYWxyZWFkeSBtYXRjaGVzLCB0aGlzIGlzIGEgbm8tb3AgXHUyMDE0IGNyaXRpY2FsLCBiZWNhdXNlXHJcbiAgLy8gc3luY1BhZ2VzR3JvdXAgaXMgY2FsbGVkIG9uIGV2ZXJ5IE11dGF0aW9uT2JzZXJ2ZXIgdGljayBhbmQgYW55IERPTVxyXG4gIC8vIHdyaXRlIHdvdWxkIHJlLXRyaWdnZXIgdGhhdCBvYnNlcnZlciAoaW5maW5pdGUgbG9vcCwgYXBwIGZyZWV6ZSkuXHJcbiAgY29uc3QgZGVzaXJlZEtleSA9IHBhZ2VzLmxlbmd0aCA9PT0gMFxyXG4gICAgPyBcIkVNUFRZXCJcclxuICAgIDogcGFnZXMubWFwKChwKSA9PiBgJHtwLmlkfXwke3AucGFnZS50aXRsZX18JHtwLnBhZ2UuaWNvblN2ZyA/PyBcIlwifWApLmpvaW4oXCJcXG5cIik7XHJcbiAgY29uc3QgZ3JvdXBBdHRhY2hlZCA9ICEhc3RhdGUucGFnZXNHcm91cCAmJiBvdXRlci5jb250YWlucyhzdGF0ZS5wYWdlc0dyb3VwKTtcclxuICBpZiAoc3RhdGUucGFnZXNHcm91cEtleSA9PT0gZGVzaXJlZEtleSAmJiAocGFnZXMubGVuZ3RoID09PSAwID8gIWdyb3VwQXR0YWNoZWQgOiBncm91cEF0dGFjaGVkKSkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgaWYgKHBhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgaWYgKHN0YXRlLnBhZ2VzR3JvdXApIHtcclxuICAgICAgc3RhdGUucGFnZXNHcm91cC5yZW1vdmUoKTtcclxuICAgICAgc3RhdGUucGFnZXNHcm91cCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHAubmF2QnV0dG9uID0gbnVsbDtcclxuICAgIHN0YXRlLnBhZ2VzR3JvdXBLZXkgPSBkZXNpcmVkS2V5O1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgbGV0IGdyb3VwID0gc3RhdGUucGFnZXNHcm91cDtcclxuICBpZiAoIWdyb3VwIHx8ICFvdXRlci5jb250YWlucyhncm91cCkpIHtcclxuICAgIGdyb3VwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGdyb3VwLmRhdGFzZXQuY29kZXhwcCA9IFwicGFnZXMtZ3JvdXBcIjtcclxuICAgIGdyb3VwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtcHhcIjtcclxuICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBoZWFkZXIuY2xhc3NOYW1lID1cclxuICAgICAgXCJweC1yb3cteCBwdC0yIHBiLTEgdGV4dC1bMTFweF0gZm9udC1tZWRpdW0gdXBwZXJjYXNlIHRyYWNraW5nLXdpZGVyIHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZCBzZWxlY3Qtbm9uZVwiO1xyXG4gICAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJUd2Vha3NcIjtcclxuICAgIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcbiAgICBvdXRlci5hcHBlbmRDaGlsZChncm91cCk7XHJcbiAgICBzdGF0ZS5wYWdlc0dyb3VwID0gZ3JvdXA7XHJcbiAgfSBlbHNlIHtcclxuICAgIC8vIFN0cmlwIHByaW9yIGJ1dHRvbnMgKGtlZXAgdGhlIGhlYWRlciBhdCBpbmRleCAwKS5cclxuICAgIHdoaWxlIChncm91cC5jaGlsZHJlbi5sZW5ndGggPiAxKSBncm91cC5yZW1vdmVDaGlsZChncm91cC5sYXN0Q2hpbGQhKTtcclxuICB9XHJcblxyXG4gIGZvciAoY29uc3QgcCBvZiBwYWdlcykge1xyXG4gICAgY29uc3QgaWNvbiA9IHAucGFnZS5pY29uU3ZnID8/IGRlZmF1bHRQYWdlSWNvblN2ZygpO1xyXG4gICAgY29uc3QgYnRuID0gbWFrZVNpZGViYXJJdGVtKHAucGFnZS50aXRsZSwgaWNvbik7XHJcbiAgICBidG4uZGF0YXNldC5jb2RleHBwID0gYG5hdi1wYWdlLSR7cC5pZH1gO1xyXG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwicmVnaXN0ZXJlZFwiLCBpZDogcC5pZCB9KTtcclxuICAgIH0pO1xyXG4gICAgcC5uYXZCdXR0b24gPSBidG47XHJcbiAgICBncm91cC5hcHBlbmRDaGlsZChidG4pO1xyXG4gIH1cclxuICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gZGVzaXJlZEtleTtcclxuICBwbG9nKFwicGFnZXMgZ3JvdXAgc3luY2VkXCIsIHtcclxuICAgIGNvdW50OiBwYWdlcy5sZW5ndGgsXHJcbiAgICBpZHM6IHBhZ2VzLm1hcCgocCkgPT4gcC5pZCksXHJcbiAgfSk7XHJcbiAgLy8gUmVmbGVjdCBjdXJyZW50IGFjdGl2ZSBzdGF0ZSBhY3Jvc3MgdGhlIHJlYnVpbHQgYnV0dG9ucy5cclxuICBzZXROYXZBY3RpdmUoc3RhdGUuYWN0aXZlUGFnZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG1ha2VTaWRlYmFySXRlbShsYWJlbDogc3RyaW5nLCBpY29uU3ZnOiBzdHJpbmcpOiBIVE1MQnV0dG9uRWxlbWVudCB7XHJcbiAgLy8gQ2xhc3Mgc3RyaW5nIGNvcGllZCB2ZXJiYXRpbSBmcm9tIENvZGV4J3Mgc2lkZWJhciBidXR0b25zIChHZW5lcmFsIGV0YykuXHJcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgYnRuLmRhdGFzZXQuY29kZXhwcCA9IGBuYXYtJHtsYWJlbC50b0xvd2VyQ2FzZSgpfWA7XHJcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbGFiZWwpO1xyXG4gIGJ0bi5jbGFzc05hbWUgPVxyXG4gICAgXCJmb2N1cy12aXNpYmxlOm91dGxpbmUtdG9rZW4tYm9yZGVyIHJlbGF0aXZlIHB4LXJvdy14IHB5LXJvdy15IGN1cnNvci1pbnRlcmFjdGlvbiBzaHJpbmstMCBpdGVtcy1jZW50ZXIgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbGcgdGV4dC1sZWZ0IHRleHQtc20gZm9jdXMtdmlzaWJsZTpvdXRsaW5lIGZvY3VzLXZpc2libGU6b3V0bGluZS0yIGZvY3VzLXZpc2libGU6b3V0bGluZS1vZmZzZXQtMiBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS01MCBnYXAtMiBmbGV4IHctZnVsbCBob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgZm9udC1ub3JtYWxcIjtcclxuXHJcbiAgY29uc3QgaW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGlubmVyLmNsYXNzTmFtZSA9XHJcbiAgICBcImZsZXggbWluLXctMCBpdGVtcy1jZW50ZXIgdGV4dC1iYXNlIGdhcC0yIGZsZXgtMSB0ZXh0LXRva2VuLWZvcmVncm91bmRcIjtcclxuICBpbm5lci5pbm5lckhUTUwgPSBgJHtpY29uU3ZnfTxzcGFuIGNsYXNzPVwidHJ1bmNhdGVcIj4ke2xhYmVsfTwvc3Bhbj5gO1xyXG4gIGJ0bi5hcHBlbmRDaGlsZChpbm5lcik7XHJcbiAgcmV0dXJuIGJ0bjtcclxufVxyXG5cclxuLyoqIEludGVybmFsIGtleSBmb3IgdGhlIGJ1aWx0LWluIG5hdiBidXR0b25zLiAqL1xyXG50eXBlIEJ1aWx0aW5QYWdlID0gXCJjb25maWdcIiB8IFwidHdlYWtzXCI7XHJcblxyXG5mdW5jdGlvbiBzZXROYXZBY3RpdmUoYWN0aXZlOiBBY3RpdmVQYWdlIHwgbnVsbCk6IHZvaWQge1xyXG4gIC8vIEJ1aWx0LWluIChDb25maWcvVHdlYWtzKSBidXR0b25zLlxyXG4gIGlmIChzdGF0ZS5uYXZCdXR0b25zKSB7XHJcbiAgICBjb25zdCBidWlsdGluOiBCdWlsdGluUGFnZSB8IG51bGwgPVxyXG4gICAgICBhY3RpdmU/LmtpbmQgPT09IFwiY29uZmlnXCIgPyBcImNvbmZpZ1wiIDpcclxuICAgICAgYWN0aXZlPy5raW5kID09PSBcInR3ZWFrc1wiID8gXCJ0d2Vha3NcIiA6IG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IFtrZXksIGJ0bl0gb2YgT2JqZWN0LmVudHJpZXMoc3RhdGUubmF2QnV0dG9ucykgYXMgW0J1aWx0aW5QYWdlLCBIVE1MQnV0dG9uRWxlbWVudF1bXSkge1xyXG4gICAgICBhcHBseU5hdkFjdGl2ZShidG4sIGtleSA9PT0gYnVpbHRpbik7XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vIFBlci1wYWdlIHJlZ2lzdGVyZWQgYnV0dG9ucy5cclxuICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHtcclxuICAgIGlmICghcC5uYXZCdXR0b24pIGNvbnRpbnVlO1xyXG4gICAgY29uc3QgaXNBY3RpdmUgPSBhY3RpdmU/LmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiICYmIGFjdGl2ZS5pZCA9PT0gcC5pZDtcclxuICAgIGFwcGx5TmF2QWN0aXZlKHAubmF2QnV0dG9uLCBpc0FjdGl2ZSk7XHJcbiAgfVxyXG4gIC8vIENvZGV4J3Mgb3duIHNpZGViYXIgYnV0dG9ucyAoR2VuZXJhbCwgQXBwZWFyYW5jZSwgZXRjKS4gV2hlbiBvbmUgb2ZcclxuICAvLyBvdXIgcGFnZXMgaXMgYWN0aXZlLCBDb2RleCBzdGlsbCBoYXMgYXJpYS1jdXJyZW50PVwicGFnZVwiIGFuZCB0aGVcclxuICAvLyBhY3RpdmUtYmcgY2xhc3Mgb24gd2hpY2hldmVyIGl0ZW0gaXQgY29uc2lkZXJlZCB0aGUgcm91dGUgXHUyMDE0IHR5cGljYWxseVxyXG4gIC8vIEdlbmVyYWwuIFRoYXQgbWFrZXMgYm90aCBidXR0b25zIGxvb2sgc2VsZWN0ZWQuIFN0cmlwIENvZGV4J3MgYWN0aXZlXHJcbiAgLy8gc3R5bGluZyB3aGlsZSBvbmUgb2Ygb3VycyBpcyBhY3RpdmU7IHJlc3RvcmUgaXQgd2hlbiBub25lIGlzLlxyXG4gIHN5bmNDb2RleE5hdGl2ZU5hdkFjdGl2ZShhY3RpdmUgIT09IG51bGwpO1xyXG59XHJcblxyXG4vKipcclxuICogTXV0ZSBDb2RleCdzIG93biBhY3RpdmUtc3RhdGUgc3R5bGluZyBvbiBpdHMgc2lkZWJhciBidXR0b25zLiBXZSBkb24ndFxyXG4gKiB0b3VjaCBDb2RleCdzIFJlYWN0IHN0YXRlIFx1MjAxNCB3aGVuIHRoZSB1c2VyIGNsaWNrcyBhIG5hdGl2ZSBpdGVtLCBDb2RleFxyXG4gKiByZS1yZW5kZXJzIHRoZSBidXR0b25zIGFuZCByZS1hcHBsaWVzIGl0cyBvd24gY29ycmVjdCBzdGF0ZSwgdGhlbiBvdXJcclxuICogc2lkZWJhci1jbGljayBsaXN0ZW5lciBmaXJlcyBgcmVzdG9yZUNvZGV4Vmlld2AgKHdoaWNoIGNhbGxzIGJhY2sgaW50b1xyXG4gKiBgc2V0TmF2QWN0aXZlKG51bGwpYCBhbmQgbGV0cyBDb2RleCdzIHN0eWxpbmcgc3RhbmQpLlxyXG4gKlxyXG4gKiBgbXV0ZT10cnVlYCAgXHUyMTkyIHN0cmlwIGFyaWEtY3VycmVudCBhbmQgc3dhcCBhY3RpdmUgYmcgXHUyMTkyIGhvdmVyIGJnXHJcbiAqIGBtdXRlPWZhbHNlYCBcdTIxOTIgbm8tb3AgKENvZGV4J3Mgb3duIHJlLXJlbmRlciBhbHJlYWR5IHJlc3RvcmVkIHRoaW5ncylcclxuICovXHJcbmZ1bmN0aW9uIHN5bmNDb2RleE5hdGl2ZU5hdkFjdGl2ZShtdXRlOiBib29sZWFuKTogdm9pZCB7XHJcbiAgaWYgKCFtdXRlKSByZXR1cm47XHJcbiAgY29uc3Qgcm9vdCA9IHN0YXRlLnNpZGViYXJSb290O1xyXG4gIGlmICghcm9vdCkgcmV0dXJuO1xyXG4gIGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5mcm9tKHJvb3QucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oXCJidXR0b25cIikpO1xyXG4gIGZvciAoY29uc3QgYnRuIG9mIGJ1dHRvbnMpIHtcclxuICAgIC8vIFNraXAgb3VyIG93biBidXR0b25zLlxyXG4gICAgaWYgKGJ0bi5kYXRhc2V0LmNvZGV4cHApIGNvbnRpbnVlO1xyXG4gICAgaWYgKGJ0bi5nZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIikgPT09IFwicGFnZVwiKSB7XHJcbiAgICAgIGJ0bi5yZW1vdmVBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIik7XHJcbiAgICB9XHJcbiAgICBpZiAoYnRuLmNsYXNzTGlzdC5jb250YWlucyhcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKSkge1xyXG4gICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZShcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKTtcclxuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoXCJob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBhcHBseU5hdkFjdGl2ZShidG46IEhUTUxCdXR0b25FbGVtZW50LCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcclxuICBjb25zdCBpbm5lciA9IGJ0bi5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgaWYgKGFjdGl2ZSkge1xyXG4gICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZShcImhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiLCBcImZvbnQtbm9ybWFsXCIpO1xyXG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKTtcclxuICAgICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtY3VycmVudFwiLCBcInBhZ2VcIik7XHJcbiAgICAgIGlmIChpbm5lcikge1xyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XHJcbiAgICAgICAgaW5uZXIuY2xhc3NMaXN0LmFkZChcInRleHQtdG9rZW4tbGlzdC1hY3RpdmUtc2VsZWN0aW9uLWZvcmVncm91bmRcIik7XHJcbiAgICAgICAgaW5uZXJcclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXHJcbiAgICAgICAgICA/LmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1pY29uLWZvcmVncm91bmRcIik7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwiaG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIsIFwiZm9udC1ub3JtYWxcIik7XHJcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiYmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICBidG4ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpO1xyXG4gICAgICBpZiAoaW5uZXIpIHtcclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKFwidGV4dC10b2tlbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlubmVyXHJcbiAgICAgICAgICAucXVlcnlTZWxlY3RvcihcInN2Z1wiKVxyXG4gICAgICAgICAgPy5jbGFzc0xpc3QucmVtb3ZlKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBhY3RpdmF0aW9uIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gYWN0aXZhdGVQYWdlKHBhZ2U6IEFjdGl2ZVBhZ2UpOiB2b2lkIHtcclxuICBjb25zdCBjb250ZW50ID0gZmluZENvbnRlbnRBcmVhKCk7XHJcbiAgaWYgKCFjb250ZW50KSB7XHJcbiAgICBwbG9nKFwiYWN0aXZhdGU6IGNvbnRlbnQgYXJlYSBub3QgZm91bmRcIik7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIHN0YXRlLmFjdGl2ZVBhZ2UgPSBwYWdlO1xyXG4gIHBsb2coXCJhY3RpdmF0ZVwiLCB7IHBhZ2UgfSk7XHJcblxyXG4gIC8vIEhpZGUgQ29kZXgncyBjb250ZW50IGNoaWxkcmVuLCBzaG93IG91cnMuXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcclxuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xyXG4gICAgaWYgKGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbiA9IGNoaWxkLnN0eWxlLmRpc3BsYXkgfHwgXCJcIjtcclxuICAgIH1cclxuICAgIGNoaWxkLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICB9XHJcbiAgbGV0IHBhbmVsID0gY29udGVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtY29kZXhwcD1cInR3ZWFrcy1wYW5lbFwiXScpO1xyXG4gIGlmICghcGFuZWwpIHtcclxuICAgIHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHBhbmVsLmRhdGFzZXQuY29kZXhwcCA9IFwidHdlYWtzLXBhbmVsXCI7XHJcbiAgICBwYW5lbC5zdHlsZS5jc3NUZXh0ID0gXCJ3aWR0aDoxMDAlO2hlaWdodDoxMDAlO292ZXJmbG93OmF1dG87XCI7XHJcbiAgICBjb250ZW50LmFwcGVuZENoaWxkKHBhbmVsKTtcclxuICB9XHJcbiAgcGFuZWwuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcclxuICBzdGF0ZS5wYW5lbEhvc3QgPSBwYW5lbDtcclxuICByZXJlbmRlcigpO1xyXG4gIHNldE5hdkFjdGl2ZShwYWdlKTtcclxuICAvLyByZXN0b3JlIENvZGV4J3Mgdmlldy4gUmUtcmVnaXN0ZXIgaWYgbmVlZGVkLlxyXG4gIGNvbnN0IHNpZGViYXIgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcclxuICBpZiAoc2lkZWJhcikge1xyXG4gICAgaWYgKHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlcikge1xyXG4gICAgICBzaWRlYmFyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgaGFuZGxlciA9IChlOiBFdmVudCkgPT4ge1xyXG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XHJcbiAgICAgIGlmIChzdGF0ZS5uYXZHcm91cD8uY29udGFpbnModGFyZ2V0KSkgcmV0dXJuOyAvLyBvdXIgYnV0dG9uc1xyXG4gICAgICBpZiAoc3RhdGUucGFnZXNHcm91cD8uY29udGFpbnModGFyZ2V0KSkgcmV0dXJuOyAvLyBvdXIgcGFnZSBidXR0b25zXHJcbiAgICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcclxuICAgIH07XHJcbiAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIgPSBoYW5kbGVyO1xyXG4gICAgc2lkZWJhci5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlciwgdHJ1ZSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZXN0b3JlQ29kZXhWaWV3KCk6IHZvaWQge1xyXG4gIHBsb2coXCJyZXN0b3JlIGNvZGV4IHZpZXdcIik7XHJcbiAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xyXG4gIGlmICghY29udGVudCkgcmV0dXJuO1xyXG4gIGlmIChzdGF0ZS5wYW5lbEhvc3QpIHN0YXRlLnBhbmVsSG9zdC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcclxuICAgIGlmIChjaGlsZCA9PT0gc3RhdGUucGFuZWxIb3N0KSBjb250aW51ZTtcclxuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuO1xyXG4gICAgICBkZWxldGUgY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuO1xyXG4gICAgfVxyXG4gIH1cclxuICBzdGF0ZS5hY3RpdmVQYWdlID0gbnVsbDtcclxuICBzZXROYXZBY3RpdmUobnVsbCk7XHJcbiAgaWYgKHN0YXRlLnNpZGViYXJSb290ICYmIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlcikge1xyXG4gICAgc3RhdGUuc2lkZWJhclJvb3QucmVtb3ZlRXZlbnRMaXN0ZW5lcihcclxuICAgICAgXCJjbGlja1wiLFxyXG4gICAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsXHJcbiAgICAgIHRydWUsXHJcbiAgICApO1xyXG4gICAgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyID0gbnVsbDtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlcmVuZGVyKCk6IHZvaWQge1xyXG4gIGlmICghc3RhdGUuYWN0aXZlUGFnZSkgcmV0dXJuO1xyXG4gIGNvbnN0IGhvc3QgPSBzdGF0ZS5wYW5lbEhvc3Q7XHJcbiAgaWYgKCFob3N0KSByZXR1cm47XHJcbiAgaG9zdC5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICBjb25zdCBhcCA9IHN0YXRlLmFjdGl2ZVBhZ2U7XHJcbiAgaWYgKGFwLmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiKSB7XHJcbiAgICBjb25zdCBlbnRyeSA9IHN0YXRlLnBhZ2VzLmdldChhcC5pZCk7XHJcbiAgICBpZiAoIWVudHJ5KSB7XHJcbiAgICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgc3VidGl0bGUgPSBlbnRyeS5wYWdlLmRlc2NyaXB0aW9uXG4gICAgICA/IGAke2VudHJ5Lm1hbmlmZXN0Lm5hbWV9OiAke2VudHJ5LnBhZ2UuZGVzY3JpcHRpb259YFxuICAgICAgOiBlbnRyeS5tYW5pZmVzdC5uYW1lO1xuICAgIGNvbnN0IHJvb3QgPSBwYW5lbFNoZWxsKGVudHJ5LnBhZ2UudGl0bGUsIHN1YnRpdGxlKTtcbiAgICBob3N0LmFwcGVuZENoaWxkKHJvb3Qub3V0ZXIpO1xuICAgIGlmIChlbnRyeS5tYW5pZmVzdC5zY29wZSA9PT0gXCJtYWluXCIgfHwgZW50cnkubWFuaWZlc3Quc2NvcGUgPT09IFwiYm90aFwiKSB7XG4gICAgICByb290LnNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChub3RpY2VSb3coXG4gICAgICAgIFwiTWFpbiBQcm9jZXNzIEFjY2Vzc1wiLFxuICAgICAgICBcIlRoaXMgdHdlYWsgY2FuIHJ1biBjb2RlIGluIENvZGV4J3MgbWFpbiBwcm9jZXNzLiBVc2Ugc2V0dGluZ3MgZnJvbSBzb3VyY2VzIHlvdSB0cnVzdC5cIixcbiAgICAgICAgXCJ3YXJuXCIsXG4gICAgICApKTtcbiAgICB9XG4gICAgdHJ5IHtcclxuICAgICAgLy8gVGVhciBkb3duIGFueSBwcmlvciByZW5kZXIgYmVmb3JlIHJlLXJlbmRlcmluZyAoaG90IHJlbG9hZCkuXHJcbiAgICAgIHRyeSB7IGVudHJ5LnRlYXJkb3duPy4oKTsgfSBjYXRjaCB7fVxyXG4gICAgICBlbnRyeS50ZWFyZG93biA9IG51bGw7XHJcbiAgICAgIGNvbnN0IHJldCA9IGVudHJ5LnBhZ2UucmVuZGVyKHJvb3Quc2VjdGlvbnNXcmFwKTtcclxuICAgICAgaWYgKHR5cGVvZiByZXQgPT09IFwiZnVuY3Rpb25cIikgZW50cnkudGVhcmRvd24gPSByZXQ7XHJcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByb290LnNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChlcnJvclJvdyhcIkVycm9yIHJlbmRlcmluZyBwYWdlXCIsIChlIGFzIEVycm9yKS5tZXNzYWdlKSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXHJcbiAgY29uc3QgdGl0bGUgPSBhcC5raW5kID09PSBcInR3ZWFrc1wiID8gXCJUd2Vha3NcIiA6IFwiQ29uZmlnXCI7XHJcbiAgY29uc3Qgc3VidGl0bGUgPSBhcC5raW5kID09PSBcInR3ZWFrc1wiXHJcbiAgICA/IFwiTWFuYWdlIHlvdXIgaW5zdGFsbGVkIENvZGV4KysgdHdlYWtzLlwiXHJcbiAgICA6IFwiQ29uZmlndXJlIENvZGV4KysgaXRzZWxmLlwiO1xyXG4gIGNvbnN0IHJvb3QgPSBwYW5lbFNoZWxsKHRpdGxlLCBzdWJ0aXRsZSk7XHJcbiAgaG9zdC5hcHBlbmRDaGlsZChyb290Lm91dGVyKTtcclxuICBpZiAoYXAua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVuZGVyVHdlYWtzUGFnZShyb290LnNlY3Rpb25zV3JhcCk7XHJcbiAgZWxzZSByZW5kZXJDb25maWdQYWdlKHJvb3Quc2VjdGlvbnNXcmFwKTtcclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHBhZ2VzIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gcmVuZGVyQ29uZmlnUGFnZShzZWN0aW9uc1dyYXA6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGNvbnN0IGNvbmZpZ1Rva2VuID0gKytzdGF0ZS5jb25maWdSZXF1ZXN0VG9rZW47XG4gIGNvbnN0IHNlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgc2VjdGlvbi5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJDb2RleCsrIFVwZGF0ZXNcIikpO1xuICBjb25zdCBjYXJkID0gcm91bmRlZENhcmQoKTtcclxuICBjb25zdCBsb2FkaW5nID0gcm93U2ltcGxlKFwiTG9hZGluZyB1cGRhdGUgc2V0dGluZ3NcIiwgXCJDaGVja2luZyBjdXJyZW50IENvZGV4KysgY29uZmlndXJhdGlvbi5cIik7XHJcbiAgY2FyZC5hcHBlbmRDaGlsZChsb2FkaW5nKTtcclxuICBzZWN0aW9uLmFwcGVuZENoaWxkKGNhcmQpO1xyXG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcclxuXHJcbiAgdm9pZCBpcGNSZW5kZXJlclxuICAgIC5pbnZva2UoXCJjb2RleHBwOmdldC1jb25maWdcIilcbiAgICAudGhlbigoY29uZmlnKSA9PiB7XG4gICAgICBpZiAoY29uZmlnVG9rZW4gIT09IHN0YXRlLmNvbmZpZ1JlcXVlc3RUb2tlbiB8fCAhY2FyZC5pc0Nvbm5lY3RlZCkgcmV0dXJuO1xuICAgICAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQsIGNvbmZpZyBhcyBDb2RleFBsdXNQbHVzQ29uZmlnKTtcbiAgICB9KVxuICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgaWYgKGNvbmZpZ1Rva2VuICE9PSBzdGF0ZS5jb25maWdSZXF1ZXN0VG9rZW4gfHwgIWNhcmQuaXNDb25uZWN0ZWQpIHJldHVybjtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChlcnJvclJvdyhcIkNvdWxkIG5vdCBsb2FkIHVwZGF0ZSBzZXR0aW5nc1wiLCBTdHJpbmcoZSkpKTtcbiAgICB9KTtcblxuICByZW5kZXJJbnN0YWxsSGVhbHRoKHNlY3Rpb25zV3JhcCk7XG5cbiAgY29uc3QgbWFpbnRlbmFuY2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgbWFpbnRlbmFuY2UuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIG1haW50ZW5hbmNlLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShcIlN1cHBvcnQgJiBNYWludGVuYW5jZVwiKSk7XG4gIGNvbnN0IG1haW50ZW5hbmNlQ2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZChtYWludGVuYW5jZUFjdGlvblJvdyhcbiAgICBcIk9wZW4gdHdlYWtzIGZvbGRlclwiLFxuICAgIFwiT3BlbiB0aGUgZm9sZGVyIHdoZXJlIGxvY2FsIHR3ZWFrIHBhY2thZ2VzIGxpdmUuXCIsXG4gICAgXCJPcGVuXCIsXG4gICAgKCkgPT4gaW52b2tlQWN0aW9uKFwibWFpbnRlbmFuY2U6b3Blbi10d2Vha3NcIiwgXCJPcGVuaW5nIHR3ZWFrcyBmb2xkZXJcIiwgXCJPcGVuZWQgdHdlYWtzIGZvbGRlci5cIiwgKCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIHR3ZWFrc1BhdGgoKSksXG4gICAgKSxcbiAgICBcIm1haW50ZW5hbmNlOm9wZW4tdHdlYWtzXCIsXG4gICkpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQobWFpbnRlbmFuY2VBY3Rpb25Sb3coXG4gICAgXCJPcGVuIGxvZ3NcIixcbiAgICBcIk9wZW4gQ29kZXgrKyBydW50aW1lIGxvZ3MgZm9yIGxvY2FsIGRlYnVnZ2luZy5cIixcbiAgICBcIk9wZW5cIixcbiAgICAoKSA9PiBpbnZva2VBY3Rpb24oXCJtYWludGVuYW5jZTpvcGVuLWxvZ3NcIiwgXCJPcGVuaW5nIGxvZ3NcIiwgXCJPcGVuZWQgbG9ncy5cIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcGF0aHMgPSBhd2FpdCBsb2FkVXNlclBhdGhzKCk7XG4gICAgICBpZiAoIXBhdGhzPy5sb2dEaXIpIHRocm93IG5ldyBFcnJvcihcIkxvZyBkaXJlY3RvcnkgaXMgdW5hdmFpbGFibGUuXCIpO1xuICAgICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZXZlYWxcIiwgcGF0aHMubG9nRGlyKTtcbiAgICB9KSxcbiAgICBcIm1haW50ZW5hbmNlOm9wZW4tbG9nc1wiLFxuICApKTtcbiAgbWFpbnRlbmFuY2VDYXJkLmFwcGVuZENoaWxkKG1haW50ZW5hbmNlQWN0aW9uUm93KFxuICAgIFwiQ3JlYXRlIHN1cHBvcnQgYnVuZGxlXCIsXG4gICAgXCJDcmVhdGUgYSByZWRhY3RlZCBkaWFnbm9zdGljcyBmb2xkZXIgYW5kIGNvcHkgaXRzIHBhdGguXCIsXG4gICAgXCJDcmVhdGVcIixcbiAgICAoKSA9PiBpbnZva2VBY3Rpb24oXCJtYWludGVuYW5jZTpjcmVhdGUtc3VwcG9ydFwiLCBcIkNyZWF0aW5nIHN1cHBvcnQgYnVuZGxlXCIsIFwiU3VwcG9ydCBidW5kbGUgY3JlYXRlZCBhbmQgcGF0aCBjb3BpZWQuXCIsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Y3JlYXRlLXN1cHBvcnQtYnVuZGxlXCIpIGFzIFN1cHBvcnRCdW5kbGVSZXN1bHQ7XG4gICAgICBzdGF0ZS5sYXN0U3VwcG9ydEJ1bmRsZURpciA9IHJlc3VsdC5kaXI7XG4gICAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOmNvcHktdGV4dFwiLCByZXN1bHQuZGlyKTtcbiAgICB9KSxcbiAgICBcIm1haW50ZW5hbmNlOmNyZWF0ZS1zdXBwb3J0XCIsXG4gICkpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQobWFpbnRlbmFuY2VBY3Rpb25Sb3coXG4gICAgXCJSZXZlYWwgc3VwcG9ydCBidW5kbGVcIixcbiAgICBcIk9wZW4gdGhlIG1vc3QgcmVjZW50IGluLWFwcCBzdXBwb3J0IGJ1bmRsZS5cIixcbiAgICBcIlJldmVhbFwiLFxuICAgICgpID0+IGludm9rZUFjdGlvbihcIm1haW50ZW5hbmNlOnJldmVhbC1zdXBwb3J0XCIsIFwiT3BlbmluZyBzdXBwb3J0IGJ1bmRsZVwiLCBcIk9wZW5lZCBzdXBwb3J0IGJ1bmRsZS5cIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKCFzdGF0ZS5sYXN0U3VwcG9ydEJ1bmRsZURpcikgdGhyb3cgbmV3IEVycm9yKFwiQ3JlYXRlIGEgc3VwcG9ydCBidW5kbGUgZmlyc3QuXCIpO1xuICAgICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZXZlYWxcIiwgc3RhdGUubGFzdFN1cHBvcnRCdW5kbGVEaXIpO1xuICAgIH0pLFxuICAgIFwibWFpbnRlbmFuY2U6cmV2ZWFsLXN1cHBvcnRcIixcbiAgKSk7XG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZChtYWludGVuYW5jZUFjdGlvblJvdyhcbiAgICBcIkNvcHkgZGlhZ25vc3RpY3MgSlNPTlwiLFxuICAgIFwiQ29weSByZWRhY3RlZCBydW50aW1lIGRpYWdub3N0aWNzIGZvciBzdXBwb3J0LlwiLFxuICAgIFwiQ29weVwiLFxuICAgICgpID0+IGludm9rZUFjdGlvbihcIm1haW50ZW5hbmNlOmNvcHktZGlhZ25vc3RpY3NcIiwgXCJDb3B5aW5nIGRpYWdub3N0aWNzXCIsIFwiRGlhZ25vc3RpY3MgY29waWVkLlwiLCAoKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb3B5LWRpYWdub3N0aWNzLWpzb25cIiksXG4gICAgKSxcbiAgICBcIm1haW50ZW5hbmNlOmNvcHktZGlhZ25vc3RpY3NcIixcbiAgKSk7XG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZChjb3B5Q29tbWFuZFJvdyhcIkNvcHkgc3RhdHVzIGNvbW1hbmRcIiwgXCJNYWNoaW5lLXJlYWRhYmxlIGluc3RhbGwgc3RhdHVzLlwiLCBcImNvZGV4LXBsdXNwbHVzIHN0YXR1cyAtLWpzb25cIikpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQoY29weUNvbW1hbmRSb3coXCJDb3B5IHN1cHBvcnQgYnVuZGxlIGNvbW1hbmRcIiwgXCJSZWRhY3RlZCBzdXBwb3J0IGRpYWdub3N0aWNzLlwiLCBcImNvZGV4LXBsdXNwbHVzIHN1cHBvcnQgYnVuZGxlXCIpKTtcbiAgbWFpbnRlbmFuY2VDYXJkLmFwcGVuZENoaWxkKGNvcHlDb21tYW5kUm93KFwiQ29weSB1bmluc3RhbGwgY29tbWFuZFwiLCBcIlJ1biBhZnRlciBxdWl0dGluZyBDb2RleCB0byByZXN0b3JlIHRoZSBhcHAgYmFja3VwLlwiLCBcImNvZGV4LXBsdXNwbHVzIHVuaW5zdGFsbFwiKSk7XG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZChyZXBvcnRCdWdSb3coKSk7XG4gIG1haW50ZW5hbmNlLmFwcGVuZENoaWxkKG1haW50ZW5hbmNlQ2FyZCk7XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChtYWludGVuYW5jZSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckluc3RhbGxIZWFsdGgoc2VjdGlvbnNXcmFwOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBoZWFsdGhUb2tlbiA9ICsrc3RhdGUuaGVhbHRoUmVxdWVzdFRva2VuO1xuICBjb25zdCBzZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XG4gIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiSW5zdGFsbCBIZWFsdGhcIikpO1xuICBjb25zdCBjYXJkID0gcm91bmRlZENhcmQoKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChsb2FkaW5nUm93KFwiTG9hZGluZyBydW50aW1lIGhlYWx0aFwiLCBcIkNoZWNraW5nIHJ1bnRpbWUgcGF0aHMgYW5kIHJlbG9hZCBzdGF0dXMuXCIpKTtcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChjYXJkKTtcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuXG4gIHZvaWQgbG9hZFJ1bnRpbWVIZWFsdGgoKVxuICAgIC50aGVuKChoZWFsdGgpID0+IHtcbiAgICAgIGlmIChoZWFsdGhUb2tlbiAhPT0gc3RhdGUuaGVhbHRoUmVxdWVzdFRva2VuIHx8ICFjYXJkLmlzQ29ubmVjdGVkKSByZXR1cm47XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIGlmICghaGVhbHRoKSB7XG4gICAgICAgIGNhcmQuYXBwZW5kQ2hpbGQoZXJyb3JSb3coXCJSdW50aW1lIGhlYWx0aCB1bmF2YWlsYWJsZVwiLCBcIkNvZGV4KysgY291bGQgbm90IHJlYWQgcnVudGltZSBkaWFnbm9zdGljcyBmcm9tIHRoZSBtYWluIHByb2Nlc3MuXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgcmVsb2FkID0gaGVhbHRoLmxhc3RSZWxvYWRcbiAgICAgICAgPyBgJHtoZWFsdGgubGFzdFJlbG9hZC5vayA/IFwiTGFzdCByZWxvYWQgc3VjY2VlZGVkXCIgOiBcIkxhc3QgcmVsb2FkIGZhaWxlZFwifSAke2Zvcm1hdERhdGUoaGVhbHRoLmxhc3RSZWxvYWQuYXQpfWBcbiAgICAgICAgOiBcIk5vIHJlbG9hZCBoYXMgcnVuIHRoaXMgc2Vzc2lvbi5cIjtcbiAgICAgIGNvbnN0IHVuaGVhbHRoeSA9IGhlYWx0aC5yZWNlbnRFcnJvcnMubGVuZ3RoID4gMCB8fCBoZWFsdGgubGFzdFJlbG9hZD8ub2sgPT09IGZhbHNlO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChub3RpY2VSb3coXG4gICAgICAgIHVuaGVhbHRoeSA/IFwiTmVlZHMgQXR0ZW50aW9uXCIgOiBcIkhlYWx0aHlcIixcbiAgICAgICAgdW5oZWFsdGh5XG4gICAgICAgICAgPyBcIlJlY2VudCBydW50aW1lIGVycm9ycyB3ZXJlIHJlY29yZGVkLiBPcGVuIGxvZ3Mgb3IgY3JlYXRlIGEgc3VwcG9ydCBidW5kbGUgaWYgYmVoYXZpb3IgbG9va3Mgd3JvbmcuXCJcbiAgICAgICAgICA6IFwiUnVudGltZSBkaWFnbm9zdGljcyBsb29rIGhlYWx0aHkuXCIsXG4gICAgICAgIHVuaGVhbHRoeSA/IFwid2FyblwiIDogXCJzdWNjZXNzXCIsXG4gICAgICApKTtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiUnVudGltZVwiLCBgdiR7aGVhbHRoLnZlcnNpb259OyAke3JlbG9hZH1gKSk7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKHJvd1NpbXBsZShcIlR3ZWFrcyBkaXJlY3RvcnlcIiwgaGVhbHRoLnBhdGhzLnR3ZWFrc0RpcikpO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJMb2cgZGlyZWN0b3J5XCIsIGhlYWx0aC5wYXRocy5sb2dEaXIpKTtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFxuICAgICAgICBcIkxvYWRlZCB0d2Vha3NcIixcbiAgICAgICAgYERpc2NvdmVyZWQgJHtoZWFsdGgudHdlYWtzLmRpc2NvdmVyZWR9OyBtYWluIGxvYWRlZCAke2hlYWx0aC50d2Vha3MubG9hZGVkTWFpbn07IHJlbmRlcmVyIGxvYWRlZCAke2hlYWx0aC50d2Vha3MubG9hZGVkUmVuZGVyZXIgPz8gXCJ1bmtub3duXCJ9LmAsXG4gICAgICApKTtcbiAgICAgIGlmIChoZWFsdGgucmVjZW50RXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgbGF0ZXN0ID0gaGVhbHRoLnJlY2VudEVycm9yc1toZWFsdGgucmVjZW50RXJyb3JzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjYXJkLmFwcGVuZENoaWxkKGVycm9yUm93KFwiTW9zdCByZWNlbnQgcnVudGltZSBpc3N1ZVwiLCBgJHtmb3JtYXREYXRlKGxhdGVzdC5hdCl9OiAke2xhdGVzdC5tZXNzYWdlfWApKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgaWYgKGhlYWx0aFRva2VuICE9PSBzdGF0ZS5oZWFsdGhSZXF1ZXN0VG9rZW4gfHwgIWNhcmQuaXNDb25uZWN0ZWQpIHJldHVybjtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChlcnJvclJvdyhcIkNvdWxkIG5vdCBsb2FkIHJ1bnRpbWUgaGVhbHRoXCIsIFN0cmluZyhlKSkpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQ6IEhUTUxFbGVtZW50LCBjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiB2b2lkIHtcbiAgY2FyZC5hcHBlbmRDaGlsZChhdXRvVXBkYXRlUm93KGNvbmZpZykpO1xuICBjYXJkLmFwcGVuZENoaWxkKGNoZWNrRm9yVXBkYXRlc1Jvdyhjb25maWcudXBkYXRlQ2hlY2spKTtcbiAgY29uc3QgdXBkYXRlRmVlZGJhY2sgPSBzdGF0ZS5mZWVkYmFjay5nZXQoXCJjb25maWc6dXBkYXRlLWNoZWNrXCIpO1xuICBpZiAodXBkYXRlRmVlZGJhY2spIHtcbiAgICBjb25zdCByb3cgPSBub3RpY2VSb3coXCJVcGRhdGUgY2hlY2tcIiwgdXBkYXRlRmVlZGJhY2subWVzc2FnZSwgdXBkYXRlRmVlZGJhY2sua2luZCk7XG4gICAgcm93LmRhdGFzZXQuY29kZXhwcFVwZGF0ZUZlZWRiYWNrID0gXCJ0cnVlXCI7XG4gICAgY2FyZC5hcHBlbmRDaGlsZChyb3cpO1xuICB9XG4gIGlmIChjb25maWcudXBkYXRlQ2hlY2spIGNhcmQuYXBwZW5kQ2hpbGQocmVsZWFzZU5vdGVzUm93KGNvbmZpZy51cGRhdGVDaGVjaykpO1xufVxuXHJcbmZ1bmN0aW9uIGF1dG9VcGRhdGVSb3coY29uZmlnOiBDb2RleFBsdXNQbHVzQ29uZmlnKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IFwiQXV0b21hdGljYWxseSByZWZyZXNoIENvZGV4KytcIjtcclxuICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcclxuICBkZXNjLnRleHRDb250ZW50ID0gYEluc3RhbGxlZCB2ZXJzaW9uIHYke2NvbmZpZy52ZXJzaW9ufS4gVGhlIHdhdGNoZXIgY2FuIHJlZnJlc2ggdGhlIENvZGV4KysgcnVudGltZSBhZnRlciB5b3UgcmVydW4gdGhlIEdpdEh1YiBpbnN0YWxsZXIuYDtcclxuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcclxuICBsZWZ0LmFwcGVuZENoaWxkKGRlc2MpO1xyXG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcclxuICByb3cuYXBwZW5kQ2hpbGQoXHJcbiAgICBzd2l0Y2hDb250cm9sKGNvbmZpZy5hdXRvVXBkYXRlLCBhc3luYyAobmV4dCkgPT4ge1xyXG4gICAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnNldC1hdXRvLXVwZGF0ZVwiLCBuZXh0KTtcclxuICAgIH0pLFxyXG4gICk7XHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tGb3JVcGRhdGVzUm93KGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IGNoZWNrPy51cGRhdGVBdmFpbGFibGUgPyBcIkNvZGV4KysgdXBkYXRlIGF2YWlsYWJsZVwiIDogXCJDb2RleCsrIGlzIHVwIHRvIGRhdGVcIjtcclxuICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcclxuICBkZXNjLnRleHRDb250ZW50ID0gdXBkYXRlU3VtbWFyeShjaGVjayk7XHJcbiAgbGVmdC5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcclxuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XHJcblxyXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xyXG4gIGlmIChjaGVjaz8ucmVsZWFzZVVybCkge1xuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoXG4gICAgICBjb21wYWN0QnV0dG9uKFwiUmVsZWFzZSBOb3Rlc1wiLCAoKSA9PiB7XG4gICAgICAgIHZvaWQgb3BlbkV4dGVybmFsKGNoZWNrLnJlbGVhc2VVcmwhKTtcbiAgICAgIH0pLFxuICAgICk7XG4gIH1cbiAgYWN0aW9ucy5hcHBlbmRDaGlsZChcbiAgICBhY3Rpb25CdXR0b24oXCJDaGVjayBOb3dcIiwgXCJDaGVjayBmb3IgQ29kZXgrKyB1cGRhdGVzXCIsIGFzeW5jIChidG4pID0+IHtcbiAgICAgIGNvbnN0IHVwZGF0ZVRva2VuID0gKytzdGF0ZS51cGRhdGVSZXF1ZXN0VG9rZW47XG4gICAgICBzZXRCdXR0b25QZW5kaW5nKGJ0biwgdHJ1ZSwgXCJDaGVja2luZ1wiKTtcbiAgICAgIHN0YXRlLmZlZWRiYWNrLnNldChcImNvbmZpZzp1cGRhdGUtY2hlY2tcIiwgeyBraW5kOiBcImluZm9cIiwgbWVzc2FnZTogXCJDaGVja2luZyBmb3IgQ29kZXgrKyB1cGRhdGVzLi4uXCIgfSk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBuZXh0ID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjaGVjay1jb2RleHBwLXVwZGF0ZVwiLCB0cnVlKTtcbiAgICAgICAgaWYgKHVwZGF0ZVRva2VuICE9PSBzdGF0ZS51cGRhdGVSZXF1ZXN0VG9rZW4gfHwgIXJvdy5pc0Nvbm5lY3RlZCkgcmV0dXJuO1xuICAgICAgICBjb25zdCBjYXJkID0gcm93LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgIGlmICghY2FyZCkgcmV0dXJuO1xuICAgICAgICBzdGF0ZS5mZWVkYmFjay5kZWxldGUoXCJjb25maWc6dXBkYXRlLWNoZWNrXCIpO1xuICAgICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgICAgY29uc3QgY29uZmlnID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpnZXQtY29uZmlnXCIpO1xuICAgICAgICBpZiAodXBkYXRlVG9rZW4gIT09IHN0YXRlLnVwZGF0ZVJlcXVlc3RUb2tlbiB8fCAhY2FyZC5pc0Nvbm5lY3RlZCkgcmV0dXJuO1xuICAgICAgICByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQsIHtcbiAgICAgICAgICAuLi4oY29uZmlnIGFzIENvZGV4UGx1c1BsdXNDb25maWcpLFxuICAgICAgICAgIHVwZGF0ZUNoZWNrOiBuZXh0IGFzIENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayxcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICh1cGRhdGVUb2tlbiAhPT0gc3RhdGUudXBkYXRlUmVxdWVzdFRva2VuIHx8ICFyb3cuaXNDb25uZWN0ZWQpIHJldHVybjtcbiAgICAgICAgcGxvZyhcIkNvZGV4KysgdXBkYXRlIGNoZWNrIGZhaWxlZFwiLCBTdHJpbmcoZSkpO1xuICAgICAgICBzdGF0ZS5mZWVkYmFjay5zZXQoXCJjb25maWc6dXBkYXRlLWNoZWNrXCIsIHsga2luZDogXCJlcnJvclwiLCBtZXNzYWdlOiBgVXBkYXRlIGNoZWNrIGZhaWxlZDogJHtTdHJpbmcoZSl9YCB9KTtcbiAgICAgICAgY29uc3QgY2FyZCA9IHJvdy5wYXJlbnRFbGVtZW50O1xuICAgICAgICBpZiAoY2FyZCkge1xuICAgICAgICAgIGNhcmQucXVlcnlTZWxlY3RvcignW2RhdGEtY29kZXhwcC11cGRhdGUtZmVlZGJhY2s9XCJ0cnVlXCJdJyk/LnJlbW92ZSgpO1xuICAgICAgICAgIGNvbnN0IGZlZWRiYWNrID0gbm90aWNlUm93KFwiVXBkYXRlIGNoZWNrXCIsIGBVcGRhdGUgY2hlY2sgZmFpbGVkOiAke1N0cmluZyhlKX1gLCBcImVycm9yXCIpO1xuICAgICAgICAgIGZlZWRiYWNrLmRhdGFzZXQuY29kZXhwcFVwZGF0ZUZlZWRiYWNrID0gXCJ0cnVlXCI7XG4gICAgICAgICAgcm93Lmluc2VydEFkamFjZW50RWxlbWVudChcImFmdGVyZW5kXCIsIGZlZWRiYWNrKTtcbiAgICAgICAgfVxuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgc2V0QnV0dG9uUGVuZGluZyhidG4sIGZhbHNlKTtcbiAgICAgIH1cbiAgICB9KSxcbiAgKTtcbiAgcm93LmFwcGVuZENoaWxkKGFjdGlvbnMpO1xyXG4gIHJldHVybiByb3c7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbGVhc2VOb3Rlc1JvdyhjaGVjazogQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMiBwLTNcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJ0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgdGl0bGUudGV4dENvbnRlbnQgPSBcIkxhdGVzdCByZWxlYXNlIG5vdGVzXCI7XHJcbiAgcm93LmFwcGVuZENoaWxkKHRpdGxlKTtcclxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInByZVwiKTtcclxuICBib2R5LmNsYXNzTmFtZSA9XHJcbiAgICBcIm1heC1oLTQ4IG92ZXJmbG93LWF1dG8gd2hpdGVzcGFjZS1wcmUtd3JhcCByb3VuZGVkLW1kIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLWZvcmVncm91bmQvNSBwLTMgdGV4dC14cyB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5XCI7XHJcbiAgYm9keS50ZXh0Q29udGVudCA9IGNoZWNrLnJlbGVhc2VOb3Rlcz8udHJpbSgpIHx8IGNoZWNrLmVycm9yIHx8IFwiTm8gcmVsZWFzZSBub3RlcyBhdmFpbGFibGUuXCI7XHJcbiAgcm93LmFwcGVuZENoaWxkKGJvZHkpO1xyXG4gIHJldHVybiByb3c7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZVN1bW1hcnkoY2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB8IG51bGwpOiBzdHJpbmcge1xyXG4gIGlmICghY2hlY2spIHJldHVybiBcIk5vIHVwZGF0ZSBjaGVjayBoYXMgcnVuIHlldC5cIjtcclxuICBjb25zdCBsYXRlc3QgPSBjaGVjay5sYXRlc3RWZXJzaW9uID8gYExhdGVzdCB2JHtjaGVjay5sYXRlc3RWZXJzaW9ufS4gYCA6IFwiXCI7XHJcbiAgY29uc3QgY2hlY2tlZCA9IGBDaGVja2VkICR7bmV3IERhdGUoY2hlY2suY2hlY2tlZEF0KS50b0xvY2FsZVN0cmluZygpfS5gO1xyXG4gIGlmIChjaGVjay5lcnJvcikgcmV0dXJuIGAke2xhdGVzdH0ke2NoZWNrZWR9ICR7Y2hlY2suZXJyb3J9YDtcclxuICByZXR1cm4gYCR7bGF0ZXN0fSR7Y2hlY2tlZH1gO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZXBvcnRCdWdSb3coKTogSFRNTEVsZW1lbnQge1xuICByZXR1cm4gbWFpbnRlbmFuY2VBY3Rpb25Sb3coXG4gICAgXCJSZXBvcnQgYSBidWdcIixcbiAgICBcIk9wZW4gYSBHaXRIdWIgaXNzdWUgd2l0aCBydW50aW1lLCBpbnN0YWxsZXIsIG9yIHR3ZWFrLW1hbmFnZXIgZGV0YWlscy5cIixcbiAgICBcIk9wZW4gSXNzdWVcIixcbiAgICAoKSA9PiB7XG4gICAgICBjb25zdCB0aXRsZSA9IGVuY29kZVVSSUNvbXBvbmVudChcIltCdWddOiBcIik7XG4gICAgICBjb25zdCBib2R5ID0gZW5jb2RlVVJJQ29tcG9uZW50KFxuICAgICAgICBbXG4gICAgICAgICAgXCIjIyBXaGF0IGhhcHBlbmVkP1wiLFxuICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgXCIjIyBTdGVwcyB0byByZXByb2R1Y2VcIixcbiAgICAgICAgICBcIjEuIFwiLFxuICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgXCIjIyBFbnZpcm9ubWVudFwiLFxuICAgICAgICAgIFwiLSBDb2RleCsrIHZlcnNpb246IFwiLFxuICAgICAgICAgIFwiLSBDb2RleCBhcHAgdmVyc2lvbjogXCIsXG4gICAgICAgICAgXCItIE9TOiBcIixcbiAgICAgICAgICBcIlwiLFxuICAgICAgICAgIFwiIyMgRGlhZ25vc3RpY3NcIixcbiAgICAgICAgICBcIlJ1biBgY29kZXgtcGx1c3BsdXMgc3VwcG9ydCBidW5kbGVgIGFuZCBhdHRhY2ggcmVsZXZhbnQgcmVkYWN0ZWQgb3V0cHV0LlwiLFxuICAgICAgICBdLmpvaW4oXCJcXG5cIiksXG4gICAgICApO1xuICAgICAgdm9pZCBvcGVuRXh0ZXJuYWwoYGh0dHBzOi8vZ2l0aHViLmNvbS9BcHBsZUxhbXBzL2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXc/dGl0bGU9JHt0aXRsZX0mYm9keT0ke2JvZHl9YCk7XG4gICAgfSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gbWFpbnRlbmFuY2VBY3Rpb25Sb3coXG4gIHRpdGxlVGV4dDogc3RyaW5nLFxuICBkZXNjcmlwdGlvbjogc3RyaW5nLFxuICBhY3Rpb25MYWJlbDogc3RyaW5nLFxuICBvbkFjdGlvbjogKCkgPT4gdm9pZCxcbiAgZmVlZGJhY2tLZXk/OiBzdHJpbmcsXG4pOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xyXG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xyXG4gIHRpdGxlLnRleHRDb250ZW50ID0gdGl0bGVUZXh0O1xyXG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xyXG4gIGRlc2MudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcbiAgbGVmdC5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIGxlZnQuYXBwZW5kQ2hpbGQoZGVzYyk7XG4gIGNvbnN0IGZlZWRiYWNrID0gZmVlZGJhY2tLZXkgPyBzdGF0ZS5mZWVkYmFjay5nZXQoZmVlZGJhY2tLZXkpIDogbnVsbDtcbiAgaWYgKGZlZWRiYWNrKSBsZWZ0LmFwcGVuZENoaWxkKGlubGluZUZlZWRiYWNrKGZlZWRiYWNrLmtpbmQsIGZlZWRiYWNrLm1lc3NhZ2UpKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5kYXRhc2V0LmNvZGV4cHBSb3dBY3Rpb25zID0gXCJ0cnVlXCI7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBhY3Rpb25zLmFwcGVuZENoaWxkKGNvbXBhY3RCdXR0b24oYWN0aW9uTGFiZWwsIG9uQWN0aW9uKSk7XG4gIHJvdy5hcHBlbmRDaGlsZChhY3Rpb25zKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gY29weUNvbW1hbmRSb3codGl0bGU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgY29tbWFuZDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBrZXkgPSBgY29weToke2NvbW1hbmR9YDtcbiAgcmV0dXJuIG1haW50ZW5hbmNlQWN0aW9uUm93KHRpdGxlLCBgJHtkZXNjcmlwdGlvbn0gJHtjb21tYW5kfWAsIFwiQ29weVwiLCAoKSA9PiB7XG4gICAgdm9pZCBpbnZva2VBY3Rpb24oa2V5LCBcIkNvcHlpbmcgY29tbWFuZFwiLCBcIkNvbW1hbmQgY29waWVkLlwiLCAoKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb3B5LXRleHRcIiwgY29tbWFuZCksXG4gICAgKTtcbiAgfSwga2V5KTtcbn1cblxyXG5mdW5jdGlvbiByZW5kZXJUd2Vha3NQYWdlKHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgLy8gR3JvdXAgcmVnaXN0ZXJlZCBTZXR0aW5nc1NlY3Rpb25zIGJ5IHR3ZWFrIGlkIChwcmVmaXggc3BsaXQgYXQgXCI6XCIpLlxuICBjb25zdCBzZWN0aW9uc0J5VHdlYWsgPSBuZXcgTWFwPHN0cmluZywgU2V0dGluZ3NTZWN0aW9uW10+KCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdGF0ZS5zZWN0aW9ucy52YWx1ZXMoKSkge1xuICAgIGNvbnN0IHR3ZWFrSWQgPSBzLmlkLnNwbGl0KFwiOlwiKVswXTtcbiAgICBpZiAoIXNlY3Rpb25zQnlUd2Vhay5oYXModHdlYWtJZCkpIHNlY3Rpb25zQnlUd2Vhay5zZXQodHdlYWtJZCwgW10pO1xyXG4gICAgc2VjdGlvbnNCeVR3ZWFrLmdldCh0d2Vha0lkKSEucHVzaChzKTtcbiAgfVxuXG4gIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgd3JhcC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTNcIjtcbiAgd3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJJbnN0YWxsZWQgVHdlYWtzXCIpKTtcbiAgd3JhcC5hcHBlbmRDaGlsZCh0d2Vha3NUb29sYmFyKCkpO1xuXG4gIGNvbnN0IGdsb2JhbEZlZWRiYWNrID0gc3RhdGUuZmVlZGJhY2suZ2V0KFwidHdlYWtzOmdsb2JhbFwiKTtcbiAgaWYgKGdsb2JhbEZlZWRiYWNrKSB3cmFwLmFwcGVuZENoaWxkKG5vdGljZVJvdyhcIlR3ZWFrc1wiLCBnbG9iYWxGZWVkYmFjay5tZXNzYWdlLCBnbG9iYWxGZWVkYmFjay5raW5kKSk7XG5cbiAgaWYgKHN0YXRlLmxpc3RlZFR3ZWFrcy5sZW5ndGggPT09IDApIHtcbiAgICB3cmFwLmFwcGVuZENoaWxkKGVtcHR5U3RhdGUoXG4gICAgICBcIk5vIHR3ZWFrcyBpbnN0YWxsZWRcIixcbiAgICAgIGBEcm9wIGEgdHdlYWsgZm9sZGVyIGludG8gJHt0d2Vha3NQYXRoKCl9IGFuZCByZWxvYWQuYCxcbiAgICApKTtcbiAgICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQod3JhcCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgdmlzaWJsZSA9IGZpbHRlcmVkVHdlYWtzKHN0YXRlLmxpc3RlZFR3ZWFrcyk7XG4gIGlmICh2aXNpYmxlLmxlbmd0aCA9PT0gMCkge1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQoZW1wdHlTdGF0ZShcIk5vIHR3ZWFrcyBtYXRjaFwiLCBcIlRyeSBhIGRpZmZlcmVudCBzZWFyY2ggb3IgZmlsdGVyLlwiKSk7XG4gICAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHdyYXApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGZvciAoY29uc3QgZ3JvdXAgb2YgdHdlYWtHcm91cHModmlzaWJsZSkpIHtcbiAgICBpZiAoZ3JvdXAuaXRlbXMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcbiAgICBjb25zdCBzZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XG4gICAgc2VjdGlvbi5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgICBzZWN0aW9uLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShgJHtncm91cC50aXRsZX0gKCR7Z3JvdXAuaXRlbXMubGVuZ3RofSlgKSk7XG4gICAgY29uc3QgY2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gICAgZm9yIChjb25zdCB0IG9mIGdyb3VwLml0ZW1zKSB7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKHR3ZWFrUm93KHQsIHNlY3Rpb25zQnlUd2Vhay5nZXQodC5tYW5pZmVzdC5pZCkgPz8gW10pKTtcbiAgICB9XG4gICAgc2VjdGlvbi5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICB3cmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuICB9XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZCh3cmFwKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtzVG9vbGJhcigpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHRvb2xiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0b29sYmFyLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LXdyYXAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIHRvb2xiYXIuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInRvb2xiYXJcIik7XG4gIHRvb2xiYXIuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIlR3ZWFrIG1hbmFnZXIgY29udHJvbHNcIik7XG5cbiAgY29uc3Qgc2VhcmNoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICBzZWFyY2gudHlwZSA9IFwic2VhcmNoXCI7XG4gIHNlYXJjaC5kYXRhc2V0LmNvZGV4cHBTZWFyY2ggPSBcInR3ZWFrc1wiO1xuICBzZWFyY2gudmFsdWUgPSBzdGF0ZS50d2Vha3NTZWFyY2g7XG4gIHNlYXJjaC5wbGFjZWhvbGRlciA9IFwiU2VhcmNoIHR3ZWFrc1wiO1xuICBzZWFyY2guc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIlNlYXJjaCB0d2Vha3NcIik7XG4gIHNlYXJjaC5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciBoLTggbWluLXctNDggZmxleC0xIHJvdW5kZWQtbGcgYm9yZGVyIGJnLXRyYW5zcGFyZW50IHB4LTIgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeSBvdXRsaW5lLW5vbmUgZm9jdXMtdmlzaWJsZTpyaW5nLTIgZm9jdXMtdmlzaWJsZTpyaW5nLXRva2VuLWZvY3VzLWJvcmRlclwiO1xuICBzZWFyY2guYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgICBjb25zdCBzZWxlY3Rpb25TdGFydCA9IHNlYXJjaC5zZWxlY3Rpb25TdGFydCA/PyBzZWFyY2gudmFsdWUubGVuZ3RoO1xuICAgIGNvbnN0IHNlbGVjdGlvbkVuZCA9IHNlYXJjaC5zZWxlY3Rpb25FbmQgPz8gc2VsZWN0aW9uU3RhcnQ7XG4gICAgc3RhdGUudHdlYWtzU2VhcmNoID0gc2VhcmNoLnZhbHVlO1xuICAgIHJlcmVuZGVyKCk7XG4gICAgcmVzdG9yZVNlYXJjaEZvY3VzKHNlbGVjdGlvblN0YXJ0LCBzZWxlY3Rpb25FbmQpO1xuICB9KTtcbiAgdG9vbGJhci5hcHBlbmRDaGlsZChzZWFyY2gpO1xuXG4gIHRvb2xiYXIuYXBwZW5kQ2hpbGQoZmlsdGVyU2VnbWVudGVkQ29udHJvbCgpKTtcbiAgdG9vbGJhci5hcHBlbmRDaGlsZChpY29uQnV0dG9uKFwiUmVsb2FkIHR3ZWFrc1wiLCByZWZyZXNoSWNvblN2ZygpLCBhc3luYyAoYnRuKSA9PiB7XG4gICAgc2V0QnV0dG9uUGVuZGluZyhidG4sIHRydWUsIFwiUmVsb2FkaW5nXCIpO1xuICAgIHN0YXRlLmZlZWRiYWNrLnNldChcInR3ZWFrczpnbG9iYWxcIiwgeyBraW5kOiBcImluZm9cIiwgbWVzc2FnZTogXCJSZWxvYWRpbmcgdHdlYWtzLi4uXCIgfSk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmVsb2FkLXR3ZWFrc1wiKTtcbiAgICAgIHN0YXRlLmZlZWRiYWNrLnNldChcInR3ZWFrczpnbG9iYWxcIiwgeyBraW5kOiBcInN1Y2Nlc3NcIiwgbWVzc2FnZTogXCJUd2Vha3MgcmVsb2FkZWQuIFJlbG9hZGluZyB3aW5kb3cuLi5cIiB9KTtcbiAgICAgIHJlcmVuZGVyKCk7XG4gICAgICBsb2NhdGlvbi5yZWxvYWQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBzdGF0ZS5mZWVkYmFjay5zZXQoXCJ0d2Vha3M6Z2xvYmFsXCIsIHsga2luZDogXCJlcnJvclwiLCBtZXNzYWdlOiBgUmVsb2FkIGZhaWxlZDogJHtTdHJpbmcoZSl9YCB9KTtcbiAgICAgIHJlcmVuZGVyKCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldEJ1dHRvblBlbmRpbmcoYnRuLCBmYWxzZSk7XG4gICAgfVxuICB9KSk7XG4gIHRvb2xiYXIuYXBwZW5kQ2hpbGQoaWNvbkJ1dHRvbihcIk9wZW4gdHdlYWtzIGZvbGRlclwiLCBmb2xkZXJJY29uU3ZnKCksIGFzeW5jIChidG4pID0+IHtcbiAgICBzZXRCdXR0b25QZW5kaW5nKGJ0biwgdHJ1ZSwgXCJPcGVuaW5nXCIpO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnJldmVhbFwiLCB0d2Vha3NQYXRoKCkpO1xuICAgICAgc3RhdGUuZmVlZGJhY2suc2V0KFwidHdlYWtzOmdsb2JhbFwiLCB7IGtpbmQ6IFwic3VjY2Vzc1wiLCBtZXNzYWdlOiBcIk9wZW5lZCB0d2Vha3MgZm9sZGVyLlwiIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHN0YXRlLmZlZWRiYWNrLnNldChcInR3ZWFrczpnbG9iYWxcIiwgeyBraW5kOiBcImVycm9yXCIsIG1lc3NhZ2U6IGBDb3VsZCBub3Qgb3BlbiB0d2Vha3MgZm9sZGVyOiAke1N0cmluZyhlKX1gIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBzZXRCdXR0b25QZW5kaW5nKGJ0biwgZmFsc2UpO1xuICAgICAgcmVyZW5kZXIoKTtcbiAgICB9XG4gIH0pKTtcbiAgcmV0dXJuIHRvb2xiYXI7XG59XG5cbmZ1bmN0aW9uIGZpbHRlclNlZ21lbnRlZENvbnRyb2woKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCB3cmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgd3JhcC5jbGFzc05hbWUgPSBcImJvcmRlci10b2tlbi1ib3JkZXIgaW5saW5lLWZsZXggaC04IG92ZXJmbG93LWhpZGRlbiByb3VuZGVkLWxnIGJvcmRlclwiO1xuICB3cmFwLnNldEF0dHJpYnV0ZShcInJvbGVcIiwgXCJncm91cFwiKTtcbiAgd3JhcC5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwiRmlsdGVyIHR3ZWFrcyBieSBzdGF0dXNcIik7XG4gIGNvbnN0IG9wdGlvbnM6IEFycmF5PFtUd2Vha1N0YXR1c0ZpbHRlciwgc3RyaW5nXT4gPSBbXG4gICAgW1wiYWxsXCIsIFwiQWxsXCJdLFxuICAgIFtcImF0dGVudGlvblwiLCBcIkF0dGVudGlvblwiXSxcbiAgICBbXCJ1cGRhdGVzXCIsIFwiVXBkYXRlc1wiXSxcbiAgICBbXCJlbmFibGVkXCIsIFwiRW5hYmxlZFwiXSxcbiAgICBbXCJkaXNhYmxlZFwiLCBcIkRpc2FibGVkXCJdLFxuICBdO1xuICBmb3IgKGNvbnN0IFt2YWx1ZSwgbGFiZWxdIG9mIG9wdGlvbnMpIHtcbiAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgICBidG4uZGF0YXNldC5jb2RleHBwRmlsdGVyID0gdmFsdWU7XG4gICAgYnRuLmNsYXNzTmFtZSA9XG4gICAgICBcImgtOCBweC0yIHRleHQteHMgdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgYXJpYS1wcmVzc2VkOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBhcmlhLXByZXNzZWQ6dGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1wcmVzc2VkXCIsIFN0cmluZyhzdGF0ZS50d2Vha3NGaWx0ZXIgPT09IHZhbHVlKSk7XG4gICAgYnRuLnRleHRDb250ZW50ID0gbGFiZWw7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgc3RhdGUudHdlYWtzRmlsdGVyID0gdmFsdWU7XG4gICAgICByZXJlbmRlcigpO1xuICAgIH0pO1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgfVxuICByZXR1cm4gd3JhcDtcbn1cblxyXG5mdW5jdGlvbiB0d2Vha1Jvdyh0OiBMaXN0ZWRUd2Vhaywgc2VjdGlvbnM6IFNldHRpbmdzU2VjdGlvbltdKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBtID0gdC5tYW5pZmVzdDtcbiAgY29uc3QgbmVlZHNNYWluV2FybmluZyA9IGhhc01haW5Qcm9jZXNzQWNjZXNzKHQpO1xuXHJcbiAgLy8gT3V0ZXIgY2VsbCB3cmFwcyB0aGUgaGVhZGVyIHJvdyArIChvcHRpb25hbCkgbmVzdGVkIHNlY3Rpb25zIHNvIHRoZVxyXG4gIC8vIHBhcmVudCBjYXJkJ3MgZGl2aWRlciBzdGF5cyBiZXR3ZWVuICp0d2Vha3MqLCBub3QgYmV0d2VlbiBoZWFkZXIgYW5kXHJcbiAgLy8gYm9keSBvZiB0aGUgc2FtZSB0d2Vhay5cclxuICBjb25zdCBjZWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgY2VsbC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2xcIjtcbiAgaWYgKCF0LmVuYWJsZWQgfHwgIXQubG9hZGFibGUpIGNlbGwuc3R5bGUub3BhY2l0eSA9IFwiMC43XCI7XG5cbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgaGVhZGVyLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtMyBwLTMgc206ZmxleC1yb3cgc206aXRlbXMtc3RhcnQgc206anVzdGlmeS1iZXR3ZWVuXCI7XG5cbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC0xIGl0ZW1zLXN0YXJ0IGdhcC0zXCI7XG5cclxuICAvLyBcdTI1MDBcdTI1MDAgQXZhdGFyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gIGNvbnN0IGF2YXRhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYXZhdGFyLmNsYXNzTmFtZSA9XHJcbiAgICBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgb3ZlcmZsb3ctaGlkZGVuIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICBhdmF0YXIuc3R5bGUud2lkdGggPSBcIjU2cHhcIjtcclxuICBhdmF0YXIuc3R5bGUuaGVpZ2h0ID0gXCI1NnB4XCI7XHJcbiAgYXZhdGFyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tY29sb3ItdG9rZW4tYmctZm9nLCB0cmFuc3BhcmVudClcIjtcclxuICBpZiAobS5pY29uVXJsKSB7XHJcbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xyXG4gICAgaW1nLmFsdCA9IFwiXCI7XHJcbiAgICBpbWcuY2xhc3NOYW1lID0gXCJzaXplLWZ1bGwgb2JqZWN0LWNvbnRhaW5cIjtcclxuICAgIC8vIEluaXRpYWw6IHNob3cgZmFsbGJhY2sgaW5pdGlhbCBpbiBjYXNlIHRoZSBpY29uIGZhaWxzIHRvIGxvYWQuXHJcbiAgICBjb25zdCBpbml0aWFsID0gKG0ubmFtZT8uWzBdID8/IFwiP1wiKS50b1VwcGVyQ2FzZSgpO1xyXG4gICAgY29uc3QgZmFsbGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgIGZhbGxiYWNrLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xyXG4gICAgZmFsbGJhY2sudGV4dENvbnRlbnQgPSBpbml0aWFsO1xyXG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGZhbGxiYWNrKTtcclxuICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgKCkgPT4ge1xyXG4gICAgICBmYWxsYmFjay5yZW1vdmUoKTtcclxuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xyXG4gICAgfSk7XHJcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcclxuICAgICAgaW1nLnJlbW92ZSgpO1xyXG4gICAgfSk7XHJcbiAgICB2b2lkIHJlc29sdmVJY29uVXJsKG0uaWNvblVybCwgdC5kaXIpLnRoZW4oKHVybCkgPT4ge1xyXG4gICAgICBpZiAodXJsKSBpbWcuc3JjID0gdXJsO1xyXG4gICAgICBlbHNlIGltZy5yZW1vdmUoKTtcclxuICAgIH0pO1xyXG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGltZyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IGluaXRpYWwgPSAobS5uYW1lPy5bMF0gPz8gXCI/XCIpLnRvVXBwZXJDYXNlKCk7XHJcbiAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICBzcGFuLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xyXG4gICAgc3Bhbi50ZXh0Q29udGVudCA9IGluaXRpYWw7XHJcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoc3Bhbik7XHJcbiAgfVxyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoYXZhdGFyKTtcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFRleHQgc3RhY2sgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHN0YWNrLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0wLjVcIjtcclxuXHJcbiAgY29uc3QgdGl0bGVSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0aXRsZVJvdy5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LXdyYXAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIGNvbnN0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBuYW1lLmNsYXNzTmFtZSA9IFwibWluLXctMCBicmVhay13b3JkcyB0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XG4gIG5hbWUudGV4dENvbnRlbnQgPSBtLm5hbWU7XHJcbiAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQobmFtZSk7XHJcbiAgaWYgKG0udmVyc2lvbikge1xyXG4gICAgY29uc3QgdmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICB2ZXIuY2xhc3NOYW1lID1cclxuICAgICAgXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IHRleHQteHMgZm9udC1ub3JtYWwgdGFidWxhci1udW1zXCI7XHJcbiAgICB2ZXIudGV4dENvbnRlbnQgPSBgdiR7bS52ZXJzaW9ufWA7XHJcbiAgICB0aXRsZVJvdy5hcHBlbmRDaGlsZCh2ZXIpO1xyXG4gIH1cclxuICBpZiAodC51cGRhdGU/LnVwZGF0ZUF2YWlsYWJsZSkge1xuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKHN0YXR1c0JhZGdlKFwiVXBkYXRlIEF2YWlsYWJsZVwiLCBcImluZm9cIikpO1xuICB9XG4gIGlmICghdC5sb2FkYWJsZSkge1xuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKHN0YXR1c0JhZGdlKFwiTm90IExvYWRlZFwiLCBcIndhcm5cIikpO1xuICB9XG4gIGlmIChuZWVkc01haW5XYXJuaW5nKSB7XG4gICAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQoc3RhdHVzQmFkZ2UoXCJNYWluIFByb2Nlc3MgQWNjZXNzXCIsIFwiZGFuZ2VyXCIpKTtcbiAgfVxuICBzdGFjay5hcHBlbmRDaGlsZCh0aXRsZVJvdyk7XG5cbiAgY29uc3QgbG9hZFJlYXNvbiA9IHQubG9hZEVycm9yIHx8ICghdC5lbnRyeUV4aXN0cyA/IFwiRW50cnkgZmlsZSBpcyBtaXNzaW5nLlwiIDogXCJcIik7XG4gIGNvbnN0IGxvYWRSZWFzb25JZCA9IGxvYWRSZWFzb24gPyBgY29kZXhwcC1sb2FkLXJlYXNvbi0ke3NhZmVEb21JZChtLmlkKX1gIDogdW5kZWZpbmVkO1xuICBpZiAobG9hZFJlYXNvbikge1xuICAgIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGlmIChsb2FkUmVhc29uSWQpIGRlc2MuaWQgPSBsb2FkUmVhc29uSWQ7XG4gICAgZGVzYy5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgbWluLXctMCB0ZXh0LXNtXCI7XG4gICAgZGVzYy50ZXh0Q29udGVudCA9IGxvYWRSZWFzb247XG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoZGVzYyk7XG4gIH0gZWxzZSBpZiAobS5kZXNjcmlwdGlvbikge1xuICAgIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xuICAgIGRlc2MudGV4dENvbnRlbnQgPSBtLmRlc2NyaXB0aW9uO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKGRlc2MpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbWV0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIG1ldGEuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC13cmFwIGl0ZW1zLWNlbnRlciBnYXAtMiB0ZXh0LXhzIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgY29uc3QgYXV0aG9yRWwgPSByZW5kZXJBdXRob3IobS5hdXRob3IpO1xyXG4gIGlmIChhdXRob3JFbCkgbWV0YS5hcHBlbmRDaGlsZChhdXRob3JFbCk7XHJcbiAgaWYgKG0uZ2l0aHViUmVwbykge1xyXG4gICAgaWYgKG1ldGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkgbWV0YS5hcHBlbmRDaGlsZChkb3QoKSk7XHJcbiAgICBjb25zdCByZXBvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIHJlcG8udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgcmVwby5jbGFzc05hbWUgPSBcImlubGluZS1mbGV4IG1pbi13LTAgYnJlYWstYWxsIHRleHQtdG9rZW4tdGV4dC1saW5rLWZvcmVncm91bmQgaG92ZXI6dW5kZXJsaW5lXCI7XG4gICAgcmVwby50ZXh0Q29udGVudCA9IG0uZ2l0aHViUmVwbztcbiAgICByZXBvLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIHZvaWQgb3BlbkV4dGVybmFsKGBodHRwczovL2dpdGh1Yi5jb20vJHttLmdpdGh1YlJlcG99YCk7XG4gICAgfSk7XG4gICAgbWV0YS5hcHBlbmRDaGlsZChyZXBvKTtcclxuICB9XHJcbiAgaWYgKG0uaG9tZXBhZ2UpIHtcclxuICAgIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIG1ldGEuYXBwZW5kQ2hpbGQoZG90KCkpO1xyXG4gICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgbGluay50eXBlID0gXCJidXR0b25cIjtcbiAgICBsaW5rLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggbWluLXctMCBicmVhay1hbGwgdGV4dC10b2tlbi10ZXh0LWxpbmstZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmVcIjtcbiAgICBsaW5rLnRleHRDb250ZW50ID0gXCJIb21lcGFnZVwiO1xuICAgIGxpbmsuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgdm9pZCBvcGVuRXh0ZXJuYWwobS5ob21lcGFnZSEpO1xuICAgIH0pO1xuICAgIG1ldGEuYXBwZW5kQ2hpbGQobGluayk7XG4gIH1cbiAgaWYgKG1ldGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkgc3RhY2suYXBwZW5kQ2hpbGQobWV0YSk7XHJcblxyXG4gIC8vIFRhZ3Mgcm93IChpZiBhbnkpIFx1MjAxNCBzbWFsbCBwaWxsIGNoaXBzIGJlbG93IHRoZSBtZXRhIGxpbmUuXHJcbiAgaWYgKG0udGFncyAmJiBtLnRhZ3MubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHRhZ3NSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgdGFnc1Jvdy5jbGFzc05hbWUgPSBcImZsZXggZmxleC13cmFwIGl0ZW1zLWNlbnRlciBnYXAtMSBwdC0wLjVcIjtcclxuICAgIGZvciAoY29uc3QgdGFnIG9mIG0udGFncykge1xyXG4gICAgICBjb25zdCBwaWxsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICAgIHBpbGwuY2xhc3NOYW1lID1cclxuICAgICAgICBcInJvdW5kZWQtZnVsbCBib3JkZXIgYm9yZGVyLXRva2VuLWJvcmRlciBiZy10b2tlbi1mb3JlZ3JvdW5kLzUgcHgtMiBweS0wLjUgdGV4dC1bMTFweF0gdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xyXG4gICAgICBwaWxsLnRleHRDb250ZW50ID0gdGFnO1xyXG4gICAgICB0YWdzUm93LmFwcGVuZENoaWxkKHBpbGwpO1xyXG4gICAgfVxyXG4gICAgc3RhY2suYXBwZW5kQ2hpbGQodGFnc1Jvdyk7XG4gIH1cblxuICBpZiAobmVlZHNNYWluV2FybmluZykge1xuICAgIGNvbnN0IHdhcm4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHdhcm4uY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC14c1wiO1xuICAgIHdhcm4udGV4dENvbnRlbnQgPSBcIkNhbiBydW4gaW4gQ29kZXgncyBtYWluIHByb2Nlc3MuIEVuYWJsZSBvbmx5IHR3ZWFrcyBmcm9tIHNvdXJjZXMgeW91IHRydXN0LlwiO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKHdhcm4pO1xuICB9XG5cbiAgY29uc3QgZnJpZW5kbHlDYXBhYmlsaXRpZXMgPSBmcmllbmRseUNhcGFiaWxpdHlMYWJlbHModC5jYXBhYmlsaXRpZXMgPz8gW10pO1xuICBpZiAoZnJpZW5kbHlDYXBhYmlsaXRpZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhcFJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgY2FwUm93LmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LXdyYXAgaXRlbXMtY2VudGVyIGdhcC0xIHB0LTAuNVwiO1xuICAgIGZvciAoY29uc3QgY2FwIG9mIGZyaWVuZGx5Q2FwYWJpbGl0aWVzKSBjYXBSb3cuYXBwZW5kQ2hpbGQoc3RhdHVzQmFkZ2UoY2FwLCBcIm11dGVkXCIpKTtcbiAgICBzdGFjay5hcHBlbmRDaGlsZChjYXBSb3cpO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKHRydXN0RGV0YWlscyhmcmllbmRseUNhcGFiaWxpdGllcykpO1xuICB9XG5cbiAgY29uc3QgZmVlZGJhY2sgPSBzdGF0ZS5mZWVkYmFjay5nZXQoYHR3ZWFrOiR7bS5pZH1gKTtcbiAgaWYgKGZlZWRiYWNrKSBzdGFjay5hcHBlbmRDaGlsZChpbmxpbmVGZWVkYmFjayhmZWVkYmFjay5raW5kLCBmZWVkYmFjay5tZXNzYWdlKSk7XG5cclxuICBsZWZ0LmFwcGVuZENoaWxkKHN0YWNrKTtcclxuICBoZWFkZXIuYXBwZW5kQ2hpbGQobGVmdCk7XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBUb2dnbGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgY29uc3QgcmlnaHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICByaWdodC5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgZmxleC13cmFwIGl0ZW1zLWNlbnRlciBnYXAtMiBwdC0wLjUgc206anVzdGlmeS1lbmRcIjtcbiAgaWYgKHQudXBkYXRlPy51cGRhdGVBdmFpbGFibGUgJiYgdC51cGRhdGUucmVsZWFzZVVybCkge1xuICAgIHJpZ2h0LmFwcGVuZENoaWxkKFxuICAgICAgY29tcGFjdEJ1dHRvbihcIlZpZXcgUmVsZWFzZVwiLCAoKSA9PiB7XG4gICAgICAgIHZvaWQgb3BlbkV4dGVybmFsKHQudXBkYXRlIS5yZWxlYXNlVXJsISk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIGNvbnN0IHRvZ2dsZSA9IHN3aXRjaENvbnRyb2wodC5lbmFibGVkLCBhc3luYyAobmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQgJiYgbmVlZHNNYWluV2FybmluZyAmJiAhc3RhdGUuY29uZmlybWVkTWFpblR3ZWFrcy5oYXMobS5pZCkpIHtcbiAgICAgICAgY29uc3Qgb2sgPSB3aW5kb3cuY29uZmlybShcbiAgICAgICAgICBgJHttLm5hbWV9IGNhbiBydW4gaW4gQ29kZXgncyBtYWluIHByb2Nlc3MuXFxuXFxuT25seSBlbmFibGUgbWFpbi1wcm9jZXNzIHR3ZWFrcyBmcm9tIHNvdXJjZXMgeW91IHRydXN0LmAsXG4gICAgICAgICk7XG4gICAgICAgIGlmICghb2spIHJldHVybiBmYWxzZTtcbiAgICAgICAgc3RhdGUuY29uZmlybWVkTWFpblR3ZWFrcy5hZGQobS5pZCk7XG4gICAgICB9XG4gICAgICBzdGF0ZS5mZWVkYmFjay5zZXQoYHR3ZWFrOiR7bS5pZH1gLCB7XG4gICAgICAgIGtpbmQ6IFwiaW5mb1wiLFxuICAgICAgICBtZXNzYWdlOiBuZXh0ID8gXCJFbmFibGluZy4uLlwiIDogXCJEaXNhYmxpbmcuLi5cIixcbiAgICAgIH0pO1xuICAgICAgcmVyZW5kZXIoKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6c2V0LXR3ZWFrLWVuYWJsZWRcIiwgbS5pZCwgbmV4dCk7XG4gICAgICAgIHN0YXRlLmxpc3RlZFR3ZWFrcyA9IHN0YXRlLmxpc3RlZFR3ZWFrcy5tYXAoKGl0ZW0pID0+XG4gICAgICAgICAgaXRlbS5tYW5pZmVzdC5pZCA9PT0gbS5pZCA/IHsgLi4uaXRlbSwgZW5hYmxlZDogbmV4dCB9IDogaXRlbSxcbiAgICAgICAgKTtcbiAgICAgICAgc3RhdGUuZmVlZGJhY2suc2V0KGB0d2Vhazoke20uaWR9YCwge1xuICAgICAgICAgIGtpbmQ6IFwic3VjY2Vzc1wiLFxuICAgICAgICAgIG1lc3NhZ2U6IG5leHQgPyBcIkVuYWJsZWQuIFJlbG9hZGluZyB0d2Vha3MuLi5cIiA6IFwiRGlzYWJsZWQuIFJlbG9hZGluZyB0d2Vha3MuLi5cIixcbiAgICAgICAgfSk7XG4gICAgICAgIHJlcmVuZGVyKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBzdGF0ZS5mZWVkYmFjay5zZXQoYHR3ZWFrOiR7bS5pZH1gLCB7XG4gICAgICAgICAga2luZDogXCJlcnJvclwiLFxuICAgICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3QgJHtuZXh0ID8gXCJlbmFibGVcIiA6IFwiZGlzYWJsZVwifTogJHtTdHJpbmcoZSl9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlcmVuZGVyKCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9LCB7XG4gICAgICBkaXNhYmxlZDogIXQubG9hZGFibGUgfHwgIXQuZW50cnlFeGlzdHMsXG4gICAgICBhcmlhTGFiZWw6IGAke3QuZW5hYmxlZCA/IFwiRGlzYWJsZVwiIDogXCJFbmFibGVcIn0gJHttLm5hbWV9YCxcbiAgICAgIGRlc2NyaWJlZEJ5OiBsb2FkUmVhc29uSWQsXG4gICAgfSk7XG4gIHJpZ2h0LmFwcGVuZENoaWxkKHRvZ2dsZSk7XG4gIGhlYWRlci5hcHBlbmRDaGlsZChyaWdodCk7XG5cclxuICBjZWxsLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcblxyXG4gIC8vIElmIHRoZSB0d2VhayBpcyBlbmFibGVkIGFuZCByZWdpc3RlcmVkIHNldHRpbmdzIHNlY3Rpb25zLCByZW5kZXIgdGhvc2VcclxuICAvLyBib2RpZXMgYXMgbmVzdGVkIHJvd3MgYmVuZWF0aCB0aGUgaGVhZGVyIGluc2lkZSB0aGUgc2FtZSBjZWxsLlxyXG4gIGlmICh0LmVuYWJsZWQgJiYgdC5sb2FkYWJsZSAmJiBzZWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgbmVzdGVkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIG5lc3RlZC5jbGFzc05hbWUgPVxyXG4gICAgICBcImZsZXggZmxleC1jb2wgZGl2aWRlLXktWzAuNXB4XSBkaXZpZGUtdG9rZW4tYm9yZGVyIGJvcmRlci10LVswLjVweF0gYm9yZGVyLXRva2VuLWJvcmRlclwiO1xyXG4gICAgZm9yIChjb25zdCBzIG9mIHNlY3Rpb25zKSB7XHJcbiAgICAgIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBib2R5LmNsYXNzTmFtZSA9IFwicC0zXCI7XHJcbiAgICAgIHRyeSB7XG4gICAgICAgIHMucmVuZGVyKGJvZHkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBib2R5LmFwcGVuZENoaWxkKGVycm9yUm93KFwiRXJyb3IgcmVuZGVyaW5nIHR3ZWFrIHNlY3Rpb25cIiwgKGUgYXMgRXJyb3IpLm1lc3NhZ2UpKTtcbiAgICAgIH1cbiAgICAgIG5lc3RlZC5hcHBlbmRDaGlsZChib2R5KTtcclxuICAgIH1cclxuICAgIGNlbGwuYXBwZW5kQ2hpbGQobmVzdGVkKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBjZWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJBdXRob3IoYXV0aG9yOiBUd2Vha01hbmlmZXN0W1wiYXV0aG9yXCJdKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgaWYgKCFhdXRob3IpIHJldHVybiBudWxsO1xyXG4gIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICB3cmFwLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIGdhcC0xXCI7XHJcbiAgaWYgKHR5cGVvZiBhdXRob3IgPT09IFwic3RyaW5nXCIpIHtcclxuICAgIHdyYXAudGV4dENvbnRlbnQgPSBgYnkgJHthdXRob3J9YDtcclxuICAgIHJldHVybiB3cmFwO1xyXG4gIH1cclxuICB3cmFwLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiYnkgXCIpKTtcclxuICBpZiAoYXV0aG9yLnVybCkge1xyXG4gICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xyXG4gICAgYS5ocmVmID0gYXV0aG9yLnVybDtcclxuICAgIGEudGFyZ2V0ID0gXCJfYmxhbmtcIjtcclxuICAgIGEucmVsID0gXCJub3JlZmVycmVyXCI7XHJcbiAgICBhLmNsYXNzTmFtZSA9IFwiaW5saW5lLWZsZXggdGV4dC10b2tlbi10ZXh0LWxpbmstZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmVcIjtcclxuICAgIGEudGV4dENvbnRlbnQgPSBhdXRob3IubmFtZTtcclxuICAgIHdyYXAuYXBwZW5kQ2hpbGQoYSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IHNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgIHNwYW4udGV4dENvbnRlbnQgPSBhdXRob3IubmFtZTtcclxuICAgIHdyYXAuYXBwZW5kQ2hpbGQoc3Bhbik7XHJcbiAgfVxyXG4gIHJldHVybiB3cmFwO1xufVxuXG5mdW5jdGlvbiBmaWx0ZXJlZFR3ZWFrcyh0d2Vha3M6IExpc3RlZFR3ZWFrW10pOiBMaXN0ZWRUd2Vha1tdIHtcbiAgY29uc3QgcSA9IHN0YXRlLnR3ZWFrc1NlYXJjaC50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgcmV0dXJuIHR3ZWFrcy5maWx0ZXIoKHQpID0+IHtcbiAgICBjb25zdCBoYXlzdGFjayA9IFtcbiAgICAgIHQubWFuaWZlc3QubmFtZSxcbiAgICAgIHQubWFuaWZlc3QuaWQsXG4gICAgICB0Lm1hbmlmZXN0LmRlc2NyaXB0aW9uLFxuICAgICAgdC5tYW5pZmVzdC5naXRodWJSZXBvLFxuICAgICAgLi4uKHQubWFuaWZlc3QudGFncyA/PyBbXSksXG4gICAgICAuLi5mcmllbmRseUNhcGFiaWxpdHlMYWJlbHModC5jYXBhYmlsaXRpZXMgPz8gW10pLFxuICAgICAgdC5sb2FkRXJyb3IsXG4gICAgXS5maWx0ZXIoQm9vbGVhbikuam9pbihcIiBcIikudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAocSAmJiAhaGF5c3RhY2suaW5jbHVkZXMocSkpIHJldHVybiBmYWxzZTtcbiAgICBzd2l0Y2ggKHN0YXRlLnR3ZWFrc0ZpbHRlcikge1xuICAgICAgY2FzZSBcImF0dGVudGlvblwiOiByZXR1cm4gaXNBdHRlbnRpb25Ud2Vhayh0KTtcbiAgICAgIGNhc2UgXCJ1cGRhdGVzXCI6IHJldHVybiAhIXQudXBkYXRlPy51cGRhdGVBdmFpbGFibGU7XG4gICAgICBjYXNlIFwiZW5hYmxlZFwiOiByZXR1cm4gdC5lbmFibGVkICYmIHQubG9hZGFibGU7XG4gICAgICBjYXNlIFwiZGlzYWJsZWRcIjogcmV0dXJuICF0LmVuYWJsZWQ7XG4gICAgICBkZWZhdWx0OiByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiB0d2Vha0dyb3Vwcyh0d2Vha3M6IExpc3RlZFR3ZWFrW10pOiBBcnJheTx7IHRpdGxlOiBzdHJpbmc7IGl0ZW1zOiBMaXN0ZWRUd2Vha1tdIH0+IHtcbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCB0YWtlID0gKHByZWRpY2F0ZTogKHQ6IExpc3RlZFR3ZWFrKSA9PiBib29sZWFuKTogTGlzdGVkVHdlYWtbXSA9PiB7XG4gICAgY29uc3Qgb3V0OiBMaXN0ZWRUd2Vha1tdID0gW107XG4gICAgZm9yIChjb25zdCB0d2VhayBvZiB0d2Vha3MpIHtcbiAgICAgIGlmIChzZWVuLmhhcyh0d2Vhay5tYW5pZmVzdC5pZCkpIGNvbnRpbnVlO1xuICAgICAgaWYgKCFwcmVkaWNhdGUodHdlYWspKSBjb250aW51ZTtcbiAgICAgIHNlZW4uYWRkKHR3ZWFrLm1hbmlmZXN0LmlkKTtcbiAgICAgIG91dC5wdXNoKHR3ZWFrKTtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbiAgfTtcbiAgcmV0dXJuIFtcbiAgICB7IHRpdGxlOiBcIk5lZWRzIEF0dGVudGlvblwiLCBpdGVtczogdGFrZShpc0F0dGVudGlvblR3ZWFrKSB9LFxuICAgIHsgdGl0bGU6IFwiVXBkYXRlcyBBdmFpbGFibGVcIiwgaXRlbXM6IHRha2UoKHQpID0+ICEhdC51cGRhdGU/LnVwZGF0ZUF2YWlsYWJsZSkgfSxcbiAgICB7IHRpdGxlOiBcIkVuYWJsZWRcIiwgaXRlbXM6IHRha2UoKHQpID0+IHQuZW5hYmxlZCkgfSxcbiAgICB7IHRpdGxlOiBcIkRpc2FibGVkXCIsIGl0ZW1zOiB0YWtlKCh0KSA9PiAhdC5lbmFibGVkKSB9LFxuICBdO1xufVxuXG5mdW5jdGlvbiBpc0F0dGVudGlvblR3ZWFrKHQ6IExpc3RlZFR3ZWFrKTogYm9vbGVhbiB7XG4gIHJldHVybiAhdC5sb2FkYWJsZSB8fCAhdC5lbnRyeUV4aXN0cyB8fCAhIXQubG9hZEVycm9yO1xufVxuXG5mdW5jdGlvbiBoYXNNYWluUHJvY2Vzc0FjY2Vzcyh0OiBMaXN0ZWRUd2Vhayk6IGJvb2xlYW4ge1xuICByZXR1cm4gKHQuY2FwYWJpbGl0aWVzID8/IFtdKS5zb21lKChjKSA9PiB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGMudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gbm9ybWFsaXplZCA9PT0gXCJtYWluIHByb2Nlc3NcIiB8fCBub3JtYWxpemVkID09PSBcIm1haW4gcHJvY2VzcyBhY2Nlc3NcIjtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGZyaWVuZGx5Q2FwYWJpbGl0eUxhYmVscyhjYXBhYmlsaXRpZXM6IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuICBjb25zdCBtYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgXCJyZW5kZXJlciB1aVwiOiBcIlJlbmRlcmVyIFVJXCIsXG4gICAgXCJtYWluIHByb2Nlc3NcIjogXCJNYWluIFByb2Nlc3MgQWNjZXNzXCIsXG4gICAgXCJpc29sYXRlZCBzdG9yYWdlXCI6IFwiTG9jYWwgRGF0YSBTdG9yYWdlXCIsXG4gICAgXCJzY29wZWQgaXBjXCI6IFwiU2NvcGVkIElQQ1wiLFxuICAgIFwiY3VzdG9tIGVudHJ5XCI6IFwiQ3VzdG9tIEVudHJ5XCIsXG4gICAgXCJydW50aW1lIGdhdGVcIjogXCJSdW50aW1lIFJlcXVpcmVtZW50XCIsXG4gIH07XG4gIGNvbnN0IGxhYmVscyA9IGNhcGFiaWxpdGllcy5tYXAoKGMpID0+IG1hcFtjLnRvTG93ZXJDYXNlKCldID8/IGMpO1xuICByZXR1cm4gWy4uLm5ldyBTZXQobGFiZWxzKV07XG59XG5cbmZ1bmN0aW9uIHRydXN0RGV0YWlscyhjYXBhYmlsaXRpZXM6IHN0cmluZ1tdKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBkZXRhaWxzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRldGFpbHNcIik7XG4gIGRldGFpbHMuY2xhc3NOYW1lID0gXCJwdC0xIHRleHQteHMgdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xuICBjb25zdCBzdW1tYXJ5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInN1bW1hcnlcIik7XG4gIHN1bW1hcnkuY2xhc3NOYW1lID0gXCJjdXJzb3ItcG9pbnRlciB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICBzdW1tYXJ5LnRleHRDb250ZW50ID0gXCJUcnVzdCBkZXRhaWxzXCI7XG4gIGRldGFpbHMuYXBwZW5kQ2hpbGQoc3VtbWFyeSk7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidWxcIik7XG4gIGxpc3QuY2xhc3NOYW1lID0gXCJtdC0xIGZsZXggZmxleC1jb2wgZ2FwLTFcIjtcbiAgZm9yIChjb25zdCBjYXAgb2YgY2FwYWJpbGl0aWVzKSB7XG4gICAgY29uc3QgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsaVwiKTtcbiAgICBpdGVtLnRleHRDb250ZW50ID0gYCR7Y2FwfTogJHtjYXBhYmlsaXR5RGVzY3JpcHRpb24oY2FwKX1gO1xuICAgIGxpc3QuYXBwZW5kQ2hpbGQoaXRlbSk7XG4gIH1cbiAgZGV0YWlscy5hcHBlbmRDaGlsZChsaXN0KTtcbiAgcmV0dXJuIGRldGFpbHM7XG59XG5cbmZ1bmN0aW9uIGNhcGFiaWxpdHlEZXNjcmlwdGlvbihsYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgZGVzY3JpcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIFwiUmVuZGVyZXIgVUlcIjogXCJjYW4gYWRkIHJlbmRlcmVyLXNpZGUgVUkgYW5kIHNldHRpbmdzLlwiLFxuICAgIFwiTWFpbiBQcm9jZXNzIEFjY2Vzc1wiOiBcImNhbiBydW4gY29kZSBpbiBDb2RleCdzIG1haW4gcHJvY2Vzcy5cIixcbiAgICBcIkxvY2FsIERhdGEgU3RvcmFnZVwiOiBcImNhbiByZWFkIGFuZCB3cml0ZSBpdHMgb3duIENvZGV4KysgZGF0YS5cIixcbiAgICBcIlNjb3BlZCBJUENcIjogXCJjYW4gY29tbXVuaWNhdGUgdGhyb3VnaCBDb2RleCsrIHNjb3BlZCBJUEMgaGVscGVycy5cIixcbiAgICBcIkN1c3RvbSBFbnRyeVwiOiBcInVzZXMgYSBjdXN0b20gbWFuaWZlc3QgZW50cnkgZmlsZS5cIixcbiAgICBcIlJ1bnRpbWUgUmVxdWlyZW1lbnRcIjogXCJkZWNsYXJlcyBhIG1pbmltdW0gQ29kZXgrKyBydW50aW1lIHZlcnNpb24uXCIsXG4gIH07XG4gIHJldHVybiBkZXNjcmlwdGlvbnNbbGFiZWxdID8/IFwicmVwb3J0ZWQgYnkgdGhlIHR3ZWFrIG1hbmlmZXN0LlwiO1xufVxuXG5mdW5jdGlvbiBzYWZlRG9tSWQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXmEtekEtWjAtOV8tXS9nLCBcIi1cIik7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdERhdGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gIHJldHVybiBOdW1iZXIuaXNOYU4oZGF0ZS5nZXRUaW1lKCkpID8gdmFsdWUgOiBkYXRlLnRvTG9jYWxlU3RyaW5nKCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRSdW50aW1lSGVhbHRoKCk6IFByb21pc2U8UnVudGltZUhlYWx0aCB8IG51bGw+IHtcbiAgcmV0dXJuIChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnJ1bnRpbWUtaGVhbHRoXCIpLmNhdGNoKCgpID0+IG51bGwpKSBhcyBSdW50aW1lSGVhbHRoIHwgbnVsbDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZFVzZXJQYXRocygpOiBQcm9taXNlPFVzZXJQYXRocyB8IG51bGw+IHtcbiAgY29uc3QgcGF0aHMgPSBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnVzZXItcGF0aHNcIikuY2F0Y2goKCkgPT4gbnVsbCk7XG4gIHJldHVybiBwYXRocyBhcyBVc2VyUGF0aHMgfCBudWxsO1xufVxuXG5hc3luYyBmdW5jdGlvbiBvcGVuRXh0ZXJuYWwodXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICBpZiAocGFyc2VkLnByb3RvY29sICE9PSBcImh0dHBzOlwiKSB0aHJvdyBuZXcgRXJyb3IoXCJPbmx5IGh0dHBzIGxpbmtzIGNhbiBiZSBvcGVuZWQuXCIpO1xuICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgcGFyc2VkLnRvU3RyaW5nKCkpO1xufVxuXG5mdW5jdGlvbiByZXN0b3JlU2VhcmNoRm9jdXMoc2VsZWN0aW9uU3RhcnQ6IG51bWJlciwgc2VsZWN0aW9uRW5kOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgbmV4dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oJ2lucHV0W2RhdGEtY29kZXhwcC1zZWFyY2g9XCJ0d2Vha3NcIl0nKTtcbiAgaWYgKCFuZXh0KSByZXR1cm47XG4gIG5leHQuZm9jdXMoKTtcbiAgdHJ5IHtcbiAgICBuZXh0LnNldFNlbGVjdGlvblJhbmdlKHNlbGVjdGlvblN0YXJ0LCBzZWxlY3Rpb25FbmQpO1xuICB9IGNhdGNoIHt9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGludm9rZUFjdGlvbihcbiAga2V5OiBzdHJpbmcsXG4gIHBlbmRpbmc6IHN0cmluZyxcbiAgc3VjY2Vzczogc3RyaW5nLFxuICBhY3Rpb246ICgpID0+IFByb21pc2U8dW5rbm93bj4sXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgc3RhdGUuZmVlZGJhY2suc2V0KGtleSwgeyBraW5kOiBcImluZm9cIiwgbWVzc2FnZTogcGVuZGluZyB9KTtcbiAgcmVyZW5kZXIoKTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBhY3Rpb24oKTtcbiAgICBzdGF0ZS5mZWVkYmFjay5zZXQoa2V5LCB7IGtpbmQ6IFwic3VjY2Vzc1wiLCBtZXNzYWdlOiBzdWNjZXNzIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgc3RhdGUuZmVlZGJhY2suc2V0KGtleSwgeyBraW5kOiBcImVycm9yXCIsIG1lc3NhZ2U6IFN0cmluZyhlKSB9KTtcbiAgfVxuICByZXJlbmRlcigpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgY29tcG9uZW50cyBcdTI1MDBcdTI1MDBcblxyXG4vKiogVGhlIGZ1bGwgcGFuZWwgc2hlbGwgKHRvb2xiYXIgKyBzY3JvbGwgKyBoZWFkaW5nICsgc2VjdGlvbnMgd3JhcCkuICovXHJcbmZ1bmN0aW9uIHBhbmVsU2hlbGwoXHJcbiAgdGl0bGU6IHN0cmluZyxcclxuICBzdWJ0aXRsZT86IHN0cmluZyxcclxuKTogeyBvdXRlcjogSFRNTEVsZW1lbnQ7IHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQgfSB7XHJcbiAgY29uc3Qgb3V0ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIG91dGVyLmNsYXNzTmFtZSA9IFwibWFpbi1zdXJmYWNlIGZsZXggaC1mdWxsIG1pbi1oLTAgZmxleC1jb2xcIjtcclxuXHJcbiAgY29uc3QgdG9vbGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdG9vbGJhci5jbGFzc05hbWUgPVxyXG4gICAgXCJkcmFnZ2FibGUgZmxleCBpdGVtcy1jZW50ZXIgcHgtcGFuZWwgZWxlY3Ryb246aC10b29sYmFyIGV4dGVuc2lvbjpoLXRvb2xiYXItc21cIjtcclxuICBvdXRlci5hcHBlbmRDaGlsZCh0b29sYmFyKTtcclxuXHJcbiAgY29uc3Qgc2Nyb2xsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzY3JvbGwuY2xhc3NOYW1lID0gXCJmbGV4LTEgb3ZlcmZsb3cteS1hdXRvIHAtcGFuZWxcIjtcclxuICBvdXRlci5hcHBlbmRDaGlsZChzY3JvbGwpO1xyXG5cclxuICBjb25zdCBpbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaW5uZXIuY2xhc3NOYW1lID1cclxuICAgIFwibXgtYXV0byBmbGV4IHctZnVsbCBmbGV4LWNvbCBtYXgtdy0yeGwgZWxlY3Ryb246bWluLXctW2NhbGMoMzIwcHgqdmFyKC0tY29kZXgtd2luZG93LXpvb20pKV1cIjtcclxuICBzY3JvbGwuYXBwZW5kQ2hpbGQoaW5uZXIpO1xyXG5cclxuICBjb25zdCBoZWFkZXJXcmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoZWFkZXJXcmFwLmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC0zIHBiLXBhbmVsXCI7XHJcbiAgY29uc3QgaGVhZGVySW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGhlYWRlcklubmVyLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBmbGV4LWNvbCBnYXAtMS41IHBiLXBhbmVsXCI7XHJcbiAgY29uc3QgaGVhZGluZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGluZy5jbGFzc05hbWUgPSBcImVsZWN0cm9uOmhlYWRpbmctbGcgaGVhZGluZy1iYXNlIHRydW5jYXRlXCI7XHJcbiAgaGVhZGluZy50ZXh0Q29udGVudCA9IHRpdGxlO1xyXG4gIGhlYWRlcklubmVyLmFwcGVuZENoaWxkKGhlYWRpbmcpO1xyXG4gIGlmIChzdWJ0aXRsZSkge1xyXG4gICAgY29uc3Qgc3ViID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHN1Yi5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgdGV4dC1zbVwiO1xyXG4gICAgc3ViLnRleHRDb250ZW50ID0gc3VidGl0bGU7XHJcbiAgICBoZWFkZXJJbm5lci5hcHBlbmRDaGlsZChzdWIpO1xyXG4gIH1cclxuICBoZWFkZXJXcmFwLmFwcGVuZENoaWxkKGhlYWRlcklubmVyKTtcclxuICBpbm5lci5hcHBlbmRDaGlsZChoZWFkZXJXcmFwKTtcclxuXHJcbiAgY29uc3Qgc2VjdGlvbnNXcmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzZWN0aW9uc1dyYXAuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC1bdmFyKC0tcGFkZGluZy1wYW5lbCldXCI7XHJcbiAgaW5uZXIuYXBwZW5kQ2hpbGQoc2VjdGlvbnNXcmFwKTtcclxuXHJcbiAgcmV0dXJuIHsgb3V0ZXIsIHNlY3Rpb25zV3JhcCB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZWN0aW9uVGl0bGUodGV4dDogc3RyaW5nLCB0cmFpbGluZz86IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuICBjb25zdCB0aXRsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGVSb3cuY2xhc3NOYW1lID1cclxuICAgIFwiZmxleCBoLXRvb2xiYXIgaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtMiBweC0wIHB5LTBcIjtcclxuICBjb25zdCB0aXRsZUlubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZUlubmVyLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBmbGV4LWNvbCBnYXAtMVwiO1xyXG4gIGNvbnN0IHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHQuY2xhc3NOYW1lID0gXCJ0ZXh0LWJhc2UgZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0LnRleHRDb250ZW50ID0gdGV4dDtcclxuICB0aXRsZUlubmVyLmFwcGVuZENoaWxkKHQpO1xyXG4gIHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlSW5uZXIpO1xyXG4gIGlmICh0cmFpbGluZykge1xyXG4gICAgY29uc3QgcmlnaHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgcmlnaHQuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xyXG4gICAgcmlnaHQuYXBwZW5kQ2hpbGQodHJhaWxpbmcpO1xyXG4gICAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQocmlnaHQpO1xyXG4gIH1cclxuICByZXR1cm4gdGl0bGVSb3c7XG59XG5cbmZ1bmN0aW9uIHN0YXR1c0JhZGdlKGxhYmVsOiBzdHJpbmcsIGtpbmQ6IFwiaW5mb1wiIHwgXCJzdWNjZXNzXCIgfCBcIndhcm5cIiB8IFwiZGFuZ2VyXCIgfCBcIm11dGVkXCIgPSBcIm11dGVkXCIpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGJhZGdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XG4gIGNvbnN0IHRvbmUgPVxuICAgIGtpbmQgPT09IFwiZGFuZ2VyXCIgPyBcInRleHQtdG9rZW4tY2hhcnRzLXJlZFwiXG4gICAgOiBraW5kID09PSBcIndhcm5cIiA/IFwidGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIlxuICAgIDoga2luZCA9PT0gXCJzdWNjZXNzXCIgPyBcInRleHQtdG9rZW4tY2hhcnRzLWdyZWVuXCJcbiAgICA6IGtpbmQgPT09IFwiaW5mb1wiID8gXCJ0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiXG4gICAgOiBcInRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZFwiO1xuICBiYWRnZS5jbGFzc05hbWUgPVxuICAgIGByb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHB4LTIgcHktMC41IHRleHQtWzExcHhdIGZvbnQtbWVkaXVtICR7dG9uZX1gO1xuICBiYWRnZS50ZXh0Q29udGVudCA9IGxhYmVsO1xuICByZXR1cm4gYmFkZ2U7XG59XG5cbmZ1bmN0aW9uIG5vdGljZVJvdyhcbiAgdGl0bGVUZXh0OiBzdHJpbmcsXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmcsXG4gIGtpbmQ6IEZlZWRiYWNrS2luZCB8IFwid2FyblwiID0gXCJpbmZvXCIsXG4pOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTEgcC0zXCI7XG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGUuY2xhc3NOYW1lID1cbiAgICBraW5kID09PSBcImVycm9yXCIgPyBcInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi1jaGFydHMtcmVkXCJcbiAgICA6IGtpbmQgPT09IFwic3VjY2Vzc1wiID8gXCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tY2hhcnRzLWdyZWVuXCJcbiAgICA6IFwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICB0aXRsZS50ZXh0Q29udGVudCA9IHRpdGxlVGV4dDtcbiAgY29uc3QgZGVzYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IHRleHQtc21cIjtcbiAgZGVzYy50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuICByb3cuYXBwZW5kKHRpdGxlLCBkZXNjKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gbG9hZGluZ1Jvdyh0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICByZXR1cm4gcm93U2ltcGxlKHRpdGxlLCBkZXNjcmlwdGlvbik7XG59XG5cbmZ1bmN0aW9uIGVycm9yUm93KHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG4gIHJldHVybiBub3RpY2VSb3codGl0bGUsIGRlc2NyaXB0aW9uLCBcImVycm9yXCIpO1xufVxuXG5mdW5jdGlvbiBlbXB0eVN0YXRlKHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IGNhcmQgPSByb3VuZGVkQ2FyZCgpO1xuICBjYXJkLmFwcGVuZENoaWxkKHJvd1NpbXBsZSh0aXRsZSwgZGVzY3JpcHRpb24pKTtcbiAgcmV0dXJuIGNhcmQ7XG59XG5cbmZ1bmN0aW9uIGlubGluZUZlZWRiYWNrKGtpbmQ6IEZlZWRiYWNrS2luZCwgbWVzc2FnZTogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIGVsLmNsYXNzTmFtZSA9XG4gICAga2luZCA9PT0gXCJlcnJvclwiID8gXCJ0ZXh0LXhzIHRleHQtdG9rZW4tY2hhcnRzLXJlZFwiXG4gICAgOiBraW5kID09PSBcInN1Y2Nlc3NcIiA/IFwidGV4dC14cyB0ZXh0LXRva2VuLWNoYXJ0cy1ncmVlblwiXG4gICAgOiBcInRleHQteHMgdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xuICBlbC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIHJldHVybiBlbDtcbn1cblxuZnVuY3Rpb24gY29tcGFjdEJ1dHRvbihsYWJlbDogc3RyaW5nLCBvbkNsaWNrOiAoKSA9PiB2b2lkKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICByZXR1cm4gYWN0aW9uQnV0dG9uKGxhYmVsLCBsYWJlbCwgKF9idG4pID0+IHtcbiAgICBvbkNsaWNrKCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBhY3Rpb25CdXR0b24oXG4gIGxhYmVsOiBzdHJpbmcsXG4gIGFyaWFMYWJlbDogc3RyaW5nLFxuICBvbkNsaWNrOiAoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4sXG4pOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgYXJpYUxhYmVsKTtcbiAgYnRuLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIHVzZXItc2VsZWN0LW5vbmUgbm8tZHJhZyBjdXJzb3ItaW50ZXJhY3Rpb24gaW5saW5lLWZsZXggaC04IGl0ZW1zLWNlbnRlciB3aGl0ZXNwYWNlLW5vd3JhcCByb3VuZGVkLWxnIGJvcmRlciBweC0yIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnkgZW5hYmxlZDpob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgZGlzYWJsZWQ6Y3Vyc29yLW5vdC1hbGxvd2VkIGRpc2FibGVkOm9wYWNpdHktNDBcIjtcbiAgYnRuLnRleHRDb250ZW50ID0gbGFiZWw7XG4gIGJ0bi5kYXRhc2V0LmNvZGV4cHBMYWJlbCA9IGxhYmVsO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgYXdhaXQgb25DbGljayhidG4pO1xuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gaWNvbkJ1dHRvbihcbiAgbGFiZWw6IHN0cmluZyxcbiAgaWNvblN2Zzogc3RyaW5nLFxuICBvbkNsaWNrOiAoYnRuOiBIVE1MQnV0dG9uRWxlbWVudCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4sXG4pOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGFjdGlvbkJ1dHRvbihcIlwiLCBsYWJlbCwgb25DbGljayk7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciB1c2VyLXNlbGVjdC1ub25lIG5vLWRyYWcgY3Vyc29yLWludGVyYWN0aW9uIGlubGluZS1mbGV4IGgtOCB3LTggaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHJvdW5kZWQtbGcgYm9yZGVyIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwXCI7XG4gIGJ0bi5pbm5lckhUTUwgPSBpY29uU3ZnO1xuICBidG4uZGF0YXNldC5jb2RleHBwTGFiZWwgPSBcIlwiO1xuICBidG4uZGF0YXNldC5jb2RleHBwSWNvbiA9IGljb25Tdmc7XG4gIGJ0bi5kYXRhc2V0LmNvZGV4cHBQZW5kaW5nTGFiZWwgPSBsYWJlbDtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gc2V0QnV0dG9uUGVuZGluZyhidG46IEhUTUxCdXR0b25FbGVtZW50LCBwZW5kaW5nOiBib29sZWFuLCBsYWJlbCA9IFwiV29ya2luZ1wiKTogdm9pZCB7XG4gIGJ0bi5kaXNhYmxlZCA9IHBlbmRpbmc7XG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWJ1c3lcIiwgU3RyaW5nKHBlbmRpbmcpKTtcbiAgaWYgKGJ0bi5kYXRhc2V0LmNvZGV4cHBMYWJlbCkge1xuICAgIGJ0bi50ZXh0Q29udGVudCA9IHBlbmRpbmcgPyBsYWJlbCA6IGJ0bi5kYXRhc2V0LmNvZGV4cHBMYWJlbDtcbiAgfSBlbHNlIGlmIChidG4uZGF0YXNldC5jb2RleHBwSWNvbikge1xuICAgIGJ0bi5pbm5lckhUTUwgPSBwZW5kaW5nID8gc3Bpbm5lckljb25TdmcoKSA6IGJ0bi5kYXRhc2V0LmNvZGV4cHBJY29uO1xuICAgIGJ0bi50aXRsZSA9IHBlbmRpbmcgPyBsYWJlbCA6IChidG4uZGF0YXNldC5jb2RleHBwUGVuZGluZ0xhYmVsID8/IFwiXCIpO1xuICB9XG59XG5cclxuZnVuY3Rpb24gcm91bmRlZENhcmQoKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IGNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGNhcmQuY2xhc3NOYW1lID1cclxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciBmbGV4IGZsZXgtY29sIGRpdmlkZS15LVswLjVweF0gZGl2aWRlLXRva2VuLWJvcmRlciByb3VuZGVkLWxnIGJvcmRlclwiO1xyXG4gIGNhcmQuc2V0QXR0cmlidXRlKFxyXG4gICAgXCJzdHlsZVwiLFxyXG4gICAgXCJiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS1jb2xvci1iYWNrZ3JvdW5kLXBhbmVsLCB2YXIoLS1jb2xvci10b2tlbi1iZy1mb2cpKTtcIixcclxuICApO1xyXG4gIHJldHVybiBjYXJkO1xyXG59XHJcblxyXG5mdW5jdGlvbiByb3dTaW1wbGUodGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGVzY3JpcHRpb24/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTQgcC0zXCI7XHJcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBpdGVtcy1jZW50ZXIgZ2FwLTNcIjtcclxuICBjb25zdCBzdGFjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgc3RhY2suY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBpZiAodGl0bGUpIHtcclxuICAgIGNvbnN0IHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgdC5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xyXG4gICAgdC50ZXh0Q29udGVudCA9IHRpdGxlO1xyXG4gICAgc3RhY2suYXBwZW5kQ2hpbGQodCk7XHJcbiAgfVxyXG4gIGlmIChkZXNjcmlwdGlvbikge1xyXG4gICAgY29uc3QgZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBkLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcclxuICAgIGQudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcclxuICAgIHN0YWNrLmFwcGVuZENoaWxkKGQpO1xyXG4gIH1cclxuICBsZWZ0LmFwcGVuZENoaWxkKHN0YWNrKTtcclxuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuLyoqXHJcbiAqIENvZGV4LXN0eWxlZCB0b2dnbGUgc3dpdGNoLiBNYXJrdXAgbWlycm9ycyB0aGUgR2VuZXJhbCA+IFBlcm1pc3Npb25zIHJvd1xyXG4gKiBzd2l0Y2ggd2UgY2FwdHVyZWQ6IG91dGVyIGJ1dHRvbiAocm9sZT1zd2l0Y2gpLCBpbm5lciBwaWxsLCBzbGlkaW5nIGtub2IuXHJcbiAqL1xyXG5mdW5jdGlvbiBzd2l0Y2hDb250cm9sKFxuICBpbml0aWFsOiBib29sZWFuLFxuICBvbkNoYW5nZTogKG5leHQ6IGJvb2xlYW4pID0+IGJvb2xlYW4gfCB2b2lkIHwgUHJvbWlzZTxib29sZWFuIHwgdm9pZD4sXG4gIG9wdHM6IHsgZGlzYWJsZWQ/OiBib29sZWFuOyBhcmlhTGFiZWw/OiBzdHJpbmc7IGRlc2NyaWJlZEJ5Pzogc3RyaW5nIH0gPSB7fSxcbik6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcbiAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICBidG4uc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInN3aXRjaFwiKTtcbiAgaWYgKG9wdHMuYXJpYUxhYmVsKSBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBvcHRzLmFyaWFMYWJlbCk7XG4gIGlmIChvcHRzLmRlc2NyaWJlZEJ5KSBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1kZXNjcmliZWRieVwiLCBvcHRzLmRlc2NyaWJlZEJ5KTtcblxyXG4gIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICBjb25zdCBrbm9iID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAga25vYi5jbGFzc05hbWUgPVxyXG4gICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci1bY29sb3I6dmFyKC0tZ3JheS0wKV0gYmctW2NvbG9yOnZhcigtLWdyYXktMCldIHNoYWRvdy1zbSB0cmFuc2l0aW9uLXRyYW5zZm9ybSBkdXJhdGlvbi0yMDAgZWFzZS1vdXQgaC00IHctNFwiO1xyXG4gIHBpbGwuYXBwZW5kQ2hpbGQoa25vYik7XHJcblxyXG4gIGNvbnN0IGFwcGx5ID0gKG9uOiBib29sZWFuKTogdm9pZCA9PiB7XHJcbiAgICBidG4uc2V0QXR0cmlidXRlKFwiYXJpYS1jaGVja2VkXCIsIFN0cmluZyhvbikpO1xuICAgIGJ0bi5kYXRhc2V0LnN0YXRlID0gb24gPyBcImNoZWNrZWRcIiA6IFwidW5jaGVja2VkXCI7XG4gICAgYnRuLmNsYXNzTmFtZSA9XG4gICAgICBcImlubGluZS1mbGV4IGl0ZW1zLWNlbnRlciB0ZXh0LXNtIGZvY3VzLXZpc2libGU6b3V0bGluZS1ub25lIGZvY3VzLXZpc2libGU6cmluZy0yIGZvY3VzLXZpc2libGU6cmluZy10b2tlbi1mb2N1cy1ib3JkZXIgZm9jdXMtdmlzaWJsZTpyb3VuZGVkLWZ1bGwgY3Vyc29yLWludGVyYWN0aW9uIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTUwXCI7XG4gICAgcGlsbC5jbGFzc05hbWUgPSBgcmVsYXRpdmUgaW5saW5lLWZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIHJvdW5kZWQtZnVsbCB0cmFuc2l0aW9uLWNvbG9ycyBkdXJhdGlvbi0yMDAgZWFzZS1vdXQgaC01IHctOCAke1xuICAgICAgb3B0cy5kaXNhYmxlZCA/IFwiYmctdG9rZW4tZm9yZWdyb3VuZC8xMFwiIDogb24gPyBcImJnLXRva2VuLWNoYXJ0cy1ibHVlXCIgOiBcImJnLXRva2VuLWZvcmVncm91bmQvMjBcIlxuICAgIH1gO1xuICAgIHBpbGwuZGF0YXNldC5zdGF0ZSA9IG9uID8gXCJjaGVja2VkXCIgOiBcInVuY2hlY2tlZFwiO1xyXG4gICAga25vYi5kYXRhc2V0LnN0YXRlID0gb24gPyBcImNoZWNrZWRcIiA6IFwidW5jaGVja2VkXCI7XHJcbiAgICBrbm9iLnN0eWxlLnRyYW5zZm9ybSA9IG9uID8gXCJ0cmFuc2xhdGVYKDE0cHgpXCIgOiBcInRyYW5zbGF0ZVgoMnB4KVwiO1xyXG4gIH07XHJcbiAgYXBwbHkoaW5pdGlhbCk7XG4gIGJ0bi5kaXNhYmxlZCA9IG9wdHMuZGlzYWJsZWQgPT09IHRydWU7XG5cbiAgYnRuLmFwcGVuZENoaWxkKHBpbGwpO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgaWYgKGJ0bi5kaXNhYmxlZCkgcmV0dXJuO1xuICAgIGNvbnN0IG5leHQgPSBidG4uZ2V0QXR0cmlidXRlKFwiYXJpYS1jaGVja2VkXCIpICE9PSBcInRydWVcIjtcbiAgICBhcHBseShuZXh0KTtcbiAgICBidG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvbkNoYW5nZShuZXh0KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKSBhcHBseSghbmV4dCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBhcHBseSghbmV4dCk7XG4gICAgICBjb25zb2xlLndhcm4oXCJbY29kZXgtcGx1c3BsdXNdIHN3aXRjaCBhY3Rpb24gZmFpbGVkXCIsIGVycik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGJ0bi5kaXNhYmxlZCA9IG9wdHMuZGlzYWJsZWQgPT09IHRydWU7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIGJ0bjtcbn1cblxyXG5mdW5jdGlvbiBkb3QoKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICBzLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kXCI7XHJcbiAgcy50ZXh0Q29udGVudCA9IFwiXHUwMEI3XCI7XHJcbiAgcmV0dXJuIHM7XHJcbn1cclxuXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBpY29ucyBcdTI1MDBcdTI1MDBcclxuXHJcbmZ1bmN0aW9uIGNvbmZpZ0ljb25TdmcoKTogc3RyaW5nIHtcclxuICAvLyBTbGlkZXJzIC8gc2V0dGluZ3MgZ2x5cGguIDIweDIwIGN1cnJlbnRDb2xvci5cclxuICByZXR1cm4gKFxyXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi1zbSBpbmxpbmUtYmxvY2sgYWxpZ24tbWlkZGxlXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXHJcbiAgICBgPHBhdGggZD1cIk0zIDVoOU0xNSA1aDJNMyAxMGgyTTggMTBoOU0zIDE1aDExTTE3IDE1aDBcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDxjaXJjbGUgY3g9XCIxM1wiIGN5PVwiNVwiIHI9XCIxLjZcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xyXG4gICAgYDxjaXJjbGUgY3g9XCI2XCIgY3k9XCIxMFwiIHI9XCIxLjZcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xyXG4gICAgYDxjaXJjbGUgY3g9XCIxNVwiIGN5PVwiMTVcIiByPVwiMS42XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcclxuICAgIGA8L3N2Zz5gXHJcbiAgKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdHdlYWtzSWNvblN2ZygpOiBzdHJpbmcge1xyXG4gIC8vIFNwYXJrbGVzIC8gXCIrK1wiIGdseXBoIGZvciB0d2Vha3MuXHJcbiAgcmV0dXJuIChcclxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNMTAgMi41IEwxMS40IDguNiBMMTcuNSAxMCBMMTEuNCAxMS40IEwxMCAxNy41IEw4LjYgMTEuNCBMMi41IDEwIEw4LjYgOC42IFpcIiBmaWxsPVwiY3VycmVudENvbG9yXCIvPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNMTUuNSAzIEwxNiA1IEwxOCA1LjUgTDE2IDYgTDE1LjUgOCBMMTUgNiBMMTMgNS41IEwxNSA1IFpcIiBmaWxsPVwiY3VycmVudENvbG9yXCIgb3BhY2l0eT1cIjAuN1wiLz5gICtcclxuICAgIGA8L3N2Zz5gXHJcbiAgKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGVmYXVsdFBhZ2VJY29uU3ZnKCk6IHN0cmluZyB7XG4gIC8vIERvY3VtZW50L3BhZ2UgZ2x5cGggZm9yIHR3ZWFrLXJlZ2lzdGVyZWQgcGFnZXMgd2l0aG91dCB0aGVpciBvd24gaWNvbi5cclxuICByZXR1cm4gKFxyXG4gICAgYDxzdmcgd2lkdGg9XCIyMFwiIGhlaWdodD1cIjIwXCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGNsYXNzPVwiaWNvbi1zbSBpbmxpbmUtYmxvY2sgYWxpZ24tbWlkZGxlXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXHJcbiAgICBgPHBhdGggZD1cIk01IDNoN2wzIDN2MTFhMSAxIDAgMCAxLTEgMUg1YTEgMSAwIDAgMS0xLTFWNGExIDEgMCAwIDEgMS0xWlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNMTIgM3YzYTEgMSAwIDAgMCAxIDFoMlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNNyAxMWg2TTcgMTRoNFwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIi8+YCArXHJcbiAgICBgPC9zdmc+YFxyXG4gICk7XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hJY29uU3ZnKCk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgYDxzdmcgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgdmlld0JveD1cIjAgMCAyMCAyMFwiIGZpbGw9XCJub25lXCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xuICAgIGA8cGF0aCBkPVwiTTQgMTBhNiA2IDAgMCAxIDEwLjI0LTQuMjRMMTYgNy41TTE2IDR2My41aC0zLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTYgMTBhNiA2IDAgMCAxLTEwLjI0IDQuMjRMNCAxMi41TTQgMTZ2LTMuNWgzLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmBcbiAgKTtcbn1cblxuZnVuY3Rpb24gZm9sZGVySWNvblN2ZygpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgIGA8c3ZnIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk0zIDYuNUEyLjUgMi41IDAgMCAxIDUuNSA0SDhsMS41IDEuOEgxNC41QTIuNSAyLjUgMCAwIDEgMTcgOC4zdjUuMkEyLjUgMi41IDAgMCAxIDE0LjUgMTZoLTlBMi41IDIuNSAwIDAgMSAzIDEzLjV2LTdaXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIi8+YCArXG4gICAgYDwvc3ZnPmBcbiAgKTtcbn1cblxuZnVuY3Rpb24gc3Bpbm5lckljb25TdmcoKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICBgPHN2ZyB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNMTAgM2E3IDcgMCAxIDEtNi4wNiAzLjVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgb3BhY2l0eT1cIjAuOFwiLz5gICtcbiAgICBgPC9zdmc+YFxuICApO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlSWNvblVybChcbiAgdXJsOiBzdHJpbmcsXHJcbiAgdHdlYWtEaXI6IHN0cmluZyxcclxuKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XHJcbiAgaWYgKC9eKGh0dHBzPzp8ZGF0YTopLy50ZXN0KHVybCkpIHJldHVybiB1cmw7XHJcbiAgLy8gUmVsYXRpdmUgcGF0aCBcdTIxOTIgYXNrIG1haW4gdG8gcmVhZCB0aGUgZmlsZSBhbmQgcmV0dXJuIGEgZGF0YTogVVJMLlxyXG4gIC8vIFJlbmRlcmVyIGlzIHNhbmRib3hlZCBzbyBmaWxlOi8vIHdvbid0IGxvYWQgZGlyZWN0bHkuXHJcbiAgY29uc3QgcmVsID0gdXJsLnN0YXJ0c1dpdGgoXCIuL1wiKSA/IHVybC5zbGljZSgyKSA6IHVybDtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXHJcbiAgICAgIFwiY29kZXhwcDpyZWFkLXR3ZWFrLWFzc2V0XCIsXHJcbiAgICAgIHR3ZWFrRGlyLFxyXG4gICAgICByZWwsXHJcbiAgICApKSBhcyBzdHJpbmc7XHJcbiAgfSBjYXRjaCAoZSkge1xyXG4gICAgcGxvZyhcImljb24gbG9hZCBmYWlsZWRcIiwgeyB1cmwsIHR3ZWFrRGlyLCBlcnI6IFN0cmluZyhlKSB9KTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIERPTSBoZXVyaXN0aWNzIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gZmluZFNpZGViYXJJdGVtc0dyb3VwKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XHJcbiAgLy8gQW5jaG9yIHN0cmF0ZWd5IGZpcnN0ICh3b3VsZCBiZSBpZGVhbCBpZiBDb2RleCBzd2l0Y2hlcyB0byA8YT4pLlxyXG4gIGNvbnN0IGxpbmtzID0gQXJyYXkuZnJvbShcclxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEFuY2hvckVsZW1lbnQ+KFwiYVtocmVmKj0nL3NldHRpbmdzLyddXCIpLFxyXG4gICk7XHJcbiAgaWYgKGxpbmtzLmxlbmd0aCA+PSAyKSB7XHJcbiAgICBsZXQgbm9kZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbGlua3NbMF0ucGFyZW50RWxlbWVudDtcclxuICAgIHdoaWxlIChub2RlKSB7XHJcbiAgICAgIGNvbnN0IGluc2lkZSA9IG5vZGUucXVlcnlTZWxlY3RvckFsbChcImFbaHJlZio9Jy9zZXR0aW5ncy8nXVwiKTtcclxuICAgICAgaWYgKGluc2lkZS5sZW5ndGggPj0gTWF0aC5tYXgoMiwgbGlua3MubGVuZ3RoIC0gMSkpIHJldHVybiBub2RlO1xyXG4gICAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gVGV4dC1jb250ZW50IG1hdGNoIGFnYWluc3QgQ29kZXgncyBrbm93biBzaWRlYmFyIGxhYmVscy5cclxuICBjb25zdCBLTk9XTiA9IFtcclxuICAgIFwiR2VuZXJhbFwiLFxyXG4gICAgXCJBcHBlYXJhbmNlXCIsXHJcbiAgICBcIkNvbmZpZ3VyYXRpb25cIixcclxuICAgIFwiUGVyc29uYWxpemF0aW9uXCIsXHJcbiAgICBcIk1DUCBzZXJ2ZXJzXCIsXHJcbiAgICBcIk1DUCBTZXJ2ZXJzXCIsXHJcbiAgICBcIkdpdFwiLFxyXG4gICAgXCJFbnZpcm9ubWVudHNcIixcclxuICBdO1xyXG4gIGNvbnN0IG1hdGNoZXM6IEhUTUxFbGVtZW50W10gPSBbXTtcclxuICBjb25zdCBhbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcclxuICAgIFwiYnV0dG9uLCBhLCBbcm9sZT0nYnV0dG9uJ10sIGxpLCBkaXZcIixcclxuICApO1xyXG4gIGZvciAoY29uc3QgZWwgb2YgQXJyYXkuZnJvbShhbGwpKSB7XHJcbiAgICBjb25zdCB0ID0gKGVsLnRleHRDb250ZW50ID8/IFwiXCIpLnRyaW0oKTtcclxuICAgIGlmICh0Lmxlbmd0aCA+IDMwKSBjb250aW51ZTtcclxuICAgIGlmIChLTk9XTi5zb21lKChrKSA9PiB0ID09PSBrKSkgbWF0Y2hlcy5wdXNoKGVsKTtcclxuICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDUwKSBicmVhaztcclxuICB9XHJcbiAgaWYgKG1hdGNoZXMubGVuZ3RoID49IDIpIHtcclxuICAgIGxldCBub2RlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBtYXRjaGVzWzBdLnBhcmVudEVsZW1lbnQ7XHJcbiAgICB3aGlsZSAobm9kZSkge1xyXG4gICAgICBsZXQgY291bnQgPSAwO1xyXG4gICAgICBmb3IgKGNvbnN0IG0gb2YgbWF0Y2hlcykgaWYgKG5vZGUuY29udGFpbnMobSkpIGNvdW50Kys7XHJcbiAgICAgIGlmIChjb3VudCA+PSBNYXRoLm1pbigzLCBtYXRjaGVzLmxlbmd0aCkpIHJldHVybiBub2RlO1xyXG4gICAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gZmluZENvbnRlbnRBcmVhKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XHJcbiAgY29uc3Qgc2lkZWJhciA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xyXG4gIGlmICghc2lkZWJhcikgcmV0dXJuIG51bGw7XHJcbiAgbGV0IHBhcmVudCA9IHNpZGViYXIucGFyZW50RWxlbWVudDtcclxuICB3aGlsZSAocGFyZW50KSB7XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20ocGFyZW50LmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdKSB7XHJcbiAgICAgIGlmIChjaGlsZCA9PT0gc2lkZWJhciB8fCBjaGlsZC5jb250YWlucyhzaWRlYmFyKSkgY29udGludWU7XHJcbiAgICAgIGNvbnN0IHIgPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgaWYgKHIud2lkdGggPiAzMDAgJiYgci5oZWlnaHQgPiAyMDApIHJldHVybiBjaGlsZDtcclxuICAgIH1cclxuICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xyXG4gIH1cclxuICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gbWF5YmVEdW1wRG9tKCk6IHZvaWQge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBzaWRlYmFyID0gZmluZFNpZGViYXJJdGVtc0dyb3VwKCk7XHJcbiAgICBpZiAoc2lkZWJhciAmJiAhc3RhdGUuc2lkZWJhckR1bXBlZCkge1xyXG4gICAgICBzdGF0ZS5zaWRlYmFyRHVtcGVkID0gdHJ1ZTtcclxuICAgICAgY29uc3Qgc2JSb290ID0gc2lkZWJhci5wYXJlbnRFbGVtZW50ID8/IHNpZGViYXI7XHJcbiAgICAgIHBsb2coYGNvZGV4IHNpZGViYXIgSFRNTGAsIHNiUm9vdC5vdXRlckhUTUwuc2xpY2UoMCwgMzIwMDApKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbnRlbnQgPSBmaW5kQ29udGVudEFyZWEoKTtcclxuICAgIGlmICghY29udGVudCkge1xyXG4gICAgICBpZiAoc3RhdGUuZmluZ2VycHJpbnQgIT09IGxvY2F0aW9uLmhyZWYpIHtcclxuICAgICAgICBzdGF0ZS5maW5nZXJwcmludCA9IGxvY2F0aW9uLmhyZWY7XHJcbiAgICAgICAgcGxvZyhcImRvbSBwcm9iZSAobm8gY29udGVudClcIiwge1xyXG4gICAgICAgICAgdXJsOiBsb2NhdGlvbi5ocmVmLFxyXG4gICAgICAgICAgc2lkZWJhcjogc2lkZWJhciA/IGRlc2NyaWJlKHNpZGViYXIpIDogbnVsbCxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBsZXQgcGFuZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIEFycmF5LmZyb20oY29udGVudC5jaGlsZHJlbikgYXMgSFRNTEVsZW1lbnRbXSkge1xyXG4gICAgICBpZiAoY2hpbGQuZGF0YXNldC5jb2RleHBwID09PSBcInR3ZWFrcy1wYW5lbFwiKSBjb250aW51ZTtcclxuICAgICAgaWYgKGNoaWxkLnN0eWxlLmRpc3BsYXkgPT09IFwibm9uZVwiKSBjb250aW51ZTtcclxuICAgICAgcGFuZWwgPSBjaGlsZDtcclxuICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgICBjb25zdCBhY3RpdmVOYXYgPSBzaWRlYmFyXHJcbiAgICAgID8gQXJyYXkuZnJvbShzaWRlYmFyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiYnV0dG9uLCBhXCIpKS5maW5kKFxyXG4gICAgICAgICAgKGIpID0+XHJcbiAgICAgICAgICAgIGIuZ2V0QXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpID09PSBcInBhZ2VcIiB8fFxyXG4gICAgICAgICAgICBiLmdldEF0dHJpYnV0ZShcImRhdGEtYWN0aXZlXCIpID09PSBcInRydWVcIiB8fFxyXG4gICAgICAgICAgICBiLmdldEF0dHJpYnV0ZShcImFyaWEtc2VsZWN0ZWRcIikgPT09IFwidHJ1ZVwiIHx8XHJcbiAgICAgICAgICAgIGIuY2xhc3NMaXN0LmNvbnRhaW5zKFwiYWN0aXZlXCIpLFxyXG4gICAgICAgIClcclxuICAgICAgOiBudWxsO1xyXG4gICAgY29uc3QgaGVhZGluZyA9IHBhbmVsPy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcclxuICAgICAgXCJoMSwgaDIsIGgzLCBbY2xhc3MqPSdoZWFkaW5nJ11cIixcclxuICAgICk7XHJcbiAgICBjb25zdCBmaW5nZXJwcmludCA9IGAke2FjdGl2ZU5hdj8udGV4dENvbnRlbnQgPz8gXCJcIn18JHtoZWFkaW5nPy50ZXh0Q29udGVudCA/PyBcIlwifXwke3BhbmVsPy5jaGlsZHJlbi5sZW5ndGggPz8gMH1gO1xyXG4gICAgaWYgKHN0YXRlLmZpbmdlcnByaW50ID09PSBmaW5nZXJwcmludCkgcmV0dXJuO1xyXG4gICAgc3RhdGUuZmluZ2VycHJpbnQgPSBmaW5nZXJwcmludDtcclxuICAgIHBsb2coXCJkb20gcHJvYmVcIiwge1xyXG4gICAgICB1cmw6IGxvY2F0aW9uLmhyZWYsXHJcbiAgICAgIGFjdGl2ZU5hdjogYWN0aXZlTmF2Py50ZXh0Q29udGVudD8udHJpbSgpID8/IG51bGwsXHJcbiAgICAgIGhlYWRpbmc6IGhlYWRpbmc/LnRleHRDb250ZW50Py50cmltKCkgPz8gbnVsbCxcclxuICAgICAgY29udGVudDogZGVzY3JpYmUoY29udGVudCksXHJcbiAgICB9KTtcclxuICAgIGlmIChwYW5lbCkge1xyXG4gICAgICBjb25zdCBodG1sID0gcGFuZWwub3V0ZXJIVE1MO1xyXG4gICAgICBwbG9nKFxyXG4gICAgICAgIGBjb2RleCBwYW5lbCBIVE1MICgke2FjdGl2ZU5hdj8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBcIj9cIn0pYCxcclxuICAgICAgICBodG1sLnNsaWNlKDAsIDMyMDAwKSxcclxuICAgICAgKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlKSB7XHJcbiAgICBwbG9nKFwiZG9tIHByb2JlIGZhaWxlZFwiLCBTdHJpbmcoZSkpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZGVzY3JpYmUoZWw6IEhUTUxFbGVtZW50KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xyXG4gIHJldHVybiB7XHJcbiAgICB0YWc6IGVsLnRhZ05hbWUsXHJcbiAgICBjbHM6IGVsLmNsYXNzTmFtZS5zbGljZSgwLCAxMjApLFxyXG4gICAgaWQ6IGVsLmlkIHx8IHVuZGVmaW5lZCxcclxuICAgIGNoaWxkcmVuOiBlbC5jaGlsZHJlbi5sZW5ndGgsXHJcbiAgICByZWN0OiAoKCkgPT4ge1xyXG4gICAgICBjb25zdCByID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIHJldHVybiB7IHc6IE1hdGgucm91bmQoci53aWR0aCksIGg6IE1hdGgucm91bmQoci5oZWlnaHQpIH07XHJcbiAgICB9KSgpLFxyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHR3ZWFrc1BhdGgoKTogc3RyaW5nIHtcclxuICByZXR1cm4gKFxyXG4gICAgKHdpbmRvdyBhcyB1bmtub3duIGFzIHsgX19jb2RleHBwX3R3ZWFrc19kaXJfXz86IHN0cmluZyB9KS5fX2NvZGV4cHBfdHdlYWtzX2Rpcl9fID8/XHJcbiAgICBcIjx1c2VyIGRpcj4vdHdlYWtzXCJcclxuICApO1xyXG59XHJcbiIsICIvKipcclxuICogUmVuZGVyZXItc2lkZSB0d2VhayBob3N0LiBXZTpcclxuICogICAxLiBBc2sgbWFpbiBmb3IgdGhlIHR3ZWFrIGxpc3QgKHdpdGggcmVzb2x2ZWQgZW50cnkgcGF0aCkuXHJcbiAqICAgMi4gRm9yIGVhY2ggcmVuZGVyZXItc2NvcGVkIChvciBcImJvdGhcIikgdHdlYWssIGZldGNoIGl0cyBzb3VyY2UgdmlhIElQQ1xyXG4gKiAgICAgIGFuZCBleGVjdXRlIGl0IGFzIGEgQ29tbW9uSlMtc2hhcGVkIGZ1bmN0aW9uLlxyXG4gKiAgIDMuIFByb3ZpZGUgaXQgdGhlIHJlbmRlcmVyIGhhbGYgb2YgdGhlIEFQSS5cclxuICpcclxuICogQ29kZXggcnVucyB0aGUgcmVuZGVyZXIgd2l0aCBzYW5kYm94OiB0cnVlLCBzbyBOb2RlJ3MgYHJlcXVpcmUoKWAgaXNcclxuICogcmVzdHJpY3RlZCB0byBhIHRpbnkgd2hpdGVsaXN0IChlbGVjdHJvbiArIGEgZmV3IHBvbHlmaWxscykuIFRoYXQgbWVhbnMgd2VcclxuICogY2Fubm90IGByZXF1aXJlKClgIGFyYml0cmFyeSB0d2VhayBmaWxlcyBmcm9tIGRpc2suIEluc3RlYWQgd2UgcHVsbCB0aGVcclxuICogc291cmNlIHN0cmluZyBmcm9tIG1haW4gYW5kIGV2YWx1YXRlIGl0IHdpdGggYG5ldyBGdW5jdGlvbmAgaW5zaWRlIHRoZVxyXG4gKiBwcmVsb2FkIGNvbnRleHQuIFR3ZWFrIGF1dGhvcnMgd2hvIG5lZWQgbnBtIGRlcHMgbXVzdCBidW5kbGUgdGhlbSBpbi5cclxuICovXHJcblxyXG5pbXBvcnQgeyBpcGNSZW5kZXJlciB9IGZyb20gXCJlbGVjdHJvblwiO1xyXG5pbXBvcnQgeyByZWdpc3RlclNlY3Rpb24sIHJlZ2lzdGVyUGFnZSwgY2xlYXJTZWN0aW9ucywgc2V0TGlzdGVkVHdlYWtzIH0gZnJvbSBcIi4vc2V0dGluZ3MtaW5qZWN0b3JcIjtcclxuaW1wb3J0IHsgZmliZXJGb3JOb2RlIH0gZnJvbSBcIi4vcmVhY3QtaG9va1wiO1xyXG5pbXBvcnQgdHlwZSB7XHJcbiAgVHdlYWtNYW5pZmVzdCxcclxuICBUd2Vha0FwaSxcclxuICBSZWFjdEZpYmVyTm9kZSxcclxuICBUd2VhayxcclxufSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xyXG5cclxuaW50ZXJmYWNlIExpc3RlZFR3ZWFrIHtcclxuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcclxuICBlbnRyeTogc3RyaW5nO1xyXG4gIGRpcjogc3RyaW5nO1xuICBlbnRyeUV4aXN0czogYm9vbGVhbjtcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgbG9hZGFibGU6IGJvb2xlYW47XG4gIGxvYWRFcnJvcj86IHN0cmluZztcbiAgY2FwYWJpbGl0aWVzPzogc3RyaW5nW107XG4gIHVwZGF0ZToge1xuICAgIGNoZWNrZWRBdDogc3RyaW5nO1xyXG4gICAgcmVwbzogc3RyaW5nO1xyXG4gICAgY3VycmVudFZlcnNpb246IHN0cmluZztcclxuICAgIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XHJcbiAgICBsYXRlc3RUYWc6IHN0cmluZyB8IG51bGw7XHJcbiAgICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xyXG4gICAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xyXG4gICAgZXJyb3I/OiBzdHJpbmc7XHJcbiAgfSB8IG51bGw7XHJcbn1cclxuXHJcbmludGVyZmFjZSBVc2VyUGF0aHMge1xyXG4gIHVzZXJSb290OiBzdHJpbmc7XHJcbiAgcnVudGltZURpcjogc3RyaW5nO1xyXG4gIHR3ZWFrc0Rpcjogc3RyaW5nO1xyXG4gIGxvZ0Rpcjogc3RyaW5nO1xyXG59XHJcblxyXG5jb25zdCBsb2FkZWQgPSBuZXcgTWFwPHN0cmluZywgeyBzdG9wPzogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4gfT4oKTtcbmxldCBjYWNoZWRQYXRoczogVXNlclBhdGhzIHwgbnVsbCA9IG51bGw7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RhcnRUd2Vha0hvc3QoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3QgdHdlYWtzID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6bGlzdC10d2Vha3NcIikpIGFzIExpc3RlZFR3ZWFrW107XHJcbiAgY29uc3QgcGF0aHMgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp1c2VyLXBhdGhzXCIpKSBhcyBVc2VyUGF0aHM7XHJcbiAgY2FjaGVkUGF0aHMgPSBwYXRocztcclxuICAvLyBQdXNoIHRoZSBsaXN0IHRvIHRoZSBzZXR0aW5ncyBpbmplY3RvciBzbyB0aGUgVHdlYWtzIHBhZ2UgY2FuIHJlbmRlclxyXG4gIC8vIGNhcmRzIGV2ZW4gYmVmb3JlIGFueSB0d2VhaydzIHN0YXJ0KCkgcnVucyAoYW5kIGZvciBkaXNhYmxlZCB0d2Vha3NcclxuICAvLyB0aGF0IHdlIG5ldmVyIGxvYWQpLlxyXG4gIHNldExpc3RlZFR3ZWFrcyh0d2Vha3MpO1xyXG4gIC8vIFN0YXNoIGZvciB0aGUgc2V0dGluZ3MgaW5qZWN0b3IncyBlbXB0eS1zdGF0ZSBtZXNzYWdlLlxyXG4gICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IF9fY29kZXhwcF90d2Vha3NfZGlyX18/OiBzdHJpbmcgfSkuX19jb2RleHBwX3R3ZWFrc19kaXJfXyA9XHJcbiAgICBwYXRocy50d2Vha3NEaXI7XHJcblxyXG4gIGZvciAoY29uc3QgdCBvZiB0d2Vha3MpIHtcclxuICAgIGlmICh0Lm1hbmlmZXN0LnNjb3BlID09PSBcIm1haW5cIikgY29udGludWU7XG4gICAgaWYgKCF0LmVudHJ5RXhpc3RzKSBjb250aW51ZTtcbiAgICBpZiAoIXQuZW5hYmxlZCkgY29udGludWU7XG4gICAgaWYgKCF0LmxvYWRhYmxlKSBjb250aW51ZTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgbG9hZFR3ZWFrKHQsIHBhdGhzKTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gdHdlYWsgbG9hZCBmYWlsZWQ6XCIsIHQubWFuaWZlc3QuaWQsIGUpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc29sZS5pbmZvKFxyXG4gICAgYFtjb2RleC1wbHVzcGx1c10gcmVuZGVyZXIgaG9zdCBsb2FkZWQgJHtsb2FkZWQuc2l6ZX0gdHdlYWsocyk6YCxcclxuICAgIFsuLi5sb2FkZWQua2V5cygpXS5qb2luKFwiLCBcIikgfHwgXCIobm9uZSlcIixcclxuICApO1xyXG4gIGlwY1JlbmRlcmVyLnNlbmQoXHJcbiAgICBcImNvZGV4cHA6cHJlbG9hZC1sb2dcIixcclxuICAgIFwiaW5mb1wiLFxyXG4gICAgYHJlbmRlcmVyIGhvc3QgbG9hZGVkICR7bG9hZGVkLnNpemV9IHR3ZWFrKHMpOiAke1suLi5sb2FkZWQua2V5cygpXS5qb2luKFwiLCBcIikgfHwgXCIobm9uZSlcIn1gLFxyXG4gICk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTdG9wIGV2ZXJ5IHJlbmRlcmVyLXNjb3BlIHR3ZWFrIHNvIGEgc3Vic2VxdWVudCBgc3RhcnRUd2Vha0hvc3QoKWAgd2lsbFxyXG4gKiByZS1ldmFsdWF0ZSBmcmVzaCBzb3VyY2UuIE1vZHVsZSBjYWNoZSBpc24ndCByZWxldmFudCBzaW5jZSB3ZSBldmFsXHJcbiAqIHNvdXJjZSBzdHJpbmdzIGRpcmVjdGx5IFx1MjAxNCBlYWNoIGxvYWQgY3JlYXRlcyBhIGZyZXNoIHNjb3BlLlxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRlYXJkb3duVHdlYWtIb3N0KCk6IFByb21pc2U8dm9pZD4ge1xuICBmb3IgKGNvbnN0IFtpZCwgdF0gb2YgbG9hZGVkKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHQuc3RvcD8uKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS53YXJuKFwiW2NvZGV4LXBsdXNwbHVzXSB0d2VhayBzdG9wIGZhaWxlZDpcIiwgaWQsIGUpO1xuICAgIH1cbiAgfVxyXG4gIGxvYWRlZC5jbGVhcigpO1xyXG4gIGNsZWFyU2VjdGlvbnMoKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbG9hZFR3ZWFrKHQ6IExpc3RlZFR3ZWFrLCBwYXRoczogVXNlclBhdGhzKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgY29uc3Qgc291cmNlID0gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcclxuICAgIFwiY29kZXhwcDpyZWFkLXR3ZWFrLXNvdXJjZVwiLFxyXG4gICAgdC5lbnRyeSxcclxuICApKSBhcyBzdHJpbmc7XHJcblxyXG4gIC8vIEV2YWx1YXRlIGFzIENKUy1zaGFwZWQ6IHByb3ZpZGUgbW9kdWxlL2V4cG9ydHMvYXBpLiBUd2VhayBjb2RlIG1heSB1c2VcclxuICAvLyBgbW9kdWxlLmV4cG9ydHMgPSB7IHN0YXJ0LCBzdG9wIH1gIG9yIGBleHBvcnRzLnN0YXJ0ID0gLi4uYCBvciBwdXJlIEVTTVxyXG4gIC8vIGRlZmF1bHQgZXhwb3J0IHNoYXBlICh3ZSBhY2NlcHQgYm90aCkuXHJcbiAgY29uc3QgbW9kdWxlID0geyBleHBvcnRzOiB7fSBhcyB7IGRlZmF1bHQ/OiBUd2VhayB9ICYgVHdlYWsgfTtcclxuICBjb25zdCBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHM7XHJcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1pbXBsaWVkLWV2YWwsIG5vLW5ldy1mdW5jXHJcbiAgY29uc3QgZm4gPSBuZXcgRnVuY3Rpb24oXHJcbiAgICBcIm1vZHVsZVwiLFxyXG4gICAgXCJleHBvcnRzXCIsXHJcbiAgICBcImNvbnNvbGVcIixcclxuICAgIGAke3NvdXJjZX1cXG4vLyMgc291cmNlVVJMPWNvZGV4cHAtdHdlYWs6Ly8ke2VuY29kZVVSSUNvbXBvbmVudCh0Lm1hbmlmZXN0LmlkKX0vJHtlbmNvZGVVUklDb21wb25lbnQodC5lbnRyeSl9YCxcclxuICApO1xyXG4gIGZuKG1vZHVsZSwgZXhwb3J0cywgY29uc29sZSk7XHJcbiAgY29uc3QgbW9kID0gbW9kdWxlLmV4cG9ydHMgYXMgeyBkZWZhdWx0PzogVHdlYWsgfSAmIFR3ZWFrO1xyXG4gIGNvbnN0IHR3ZWFrOiBUd2VhayA9IChtb2QgYXMgeyBkZWZhdWx0PzogVHdlYWsgfSkuZGVmYXVsdCA/PyAobW9kIGFzIFR3ZWFrKTtcclxuICBpZiAodHlwZW9mIHR3ZWFrPy5zdGFydCAhPT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYHR3ZWFrICR7dC5tYW5pZmVzdC5pZH0gaGFzIG5vIHN0YXJ0KClgKTtcclxuICB9XHJcbiAgY29uc3QgYXBpID0gbWFrZVJlbmRlcmVyQXBpKHQubWFuaWZlc3QsIHBhdGhzKTtcclxuICBhd2FpdCB0d2Vhay5zdGFydChhcGkpO1xyXG4gIGxvYWRlZC5zZXQodC5tYW5pZmVzdC5pZCwgeyBzdG9wOiB0d2Vhay5zdG9wPy5iaW5kKHR3ZWFrKSB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gbWFrZVJlbmRlcmVyQXBpKG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LCBwYXRoczogVXNlclBhdGhzKTogVHdlYWtBcGkge1xyXG4gIGNvbnN0IGlkID0gbWFuaWZlc3QuaWQ7XHJcbiAgY29uc3QgbG9nID0gKGxldmVsOiBcImRlYnVnXCIgfCBcImluZm9cIiB8IFwid2FyblwiIHwgXCJlcnJvclwiLCAuLi5hOiB1bmtub3duW10pID0+IHtcclxuICAgIGNvbnN0IGNvbnNvbGVGbiA9XHJcbiAgICAgIGxldmVsID09PSBcImRlYnVnXCIgPyBjb25zb2xlLmRlYnVnXHJcbiAgICAgIDogbGV2ZWwgPT09IFwid2FyblwiID8gY29uc29sZS53YXJuXHJcbiAgICAgIDogbGV2ZWwgPT09IFwiZXJyb3JcIiA/IGNvbnNvbGUuZXJyb3JcclxuICAgICAgOiBjb25zb2xlLmxvZztcclxuICAgIGNvbnNvbGVGbihgW2NvZGV4LXBsdXNwbHVzXVske2lkfV1gLCAuLi5hKTtcclxuICAgIC8vIEFsc28gbWlycm9yIHRvIG1haW4ncyBsb2cgZmlsZSBzbyB3ZSBjYW4gZGlhZ25vc2UgdHdlYWsgYmVoYXZpb3JcclxuICAgIC8vIHdpdGhvdXQgYXR0YWNoaW5nIERldlRvb2xzLiBTdHJpbmdpZnkgZWFjaCBhcmcgZGVmZW5zaXZlbHkuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBwYXJ0cyA9IGEubWFwKCh2KSA9PiB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiKSByZXR1cm4gdjtcclxuICAgICAgICBpZiAodiBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gYCR7di5uYW1lfTogJHt2Lm1lc3NhZ2V9YDtcclxuICAgICAgICB0cnkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7IH0gY2F0Y2ggeyByZXR1cm4gU3RyaW5nKHYpOyB9XHJcbiAgICAgIH0pO1xyXG4gICAgICBpcGNSZW5kZXJlci5zZW5kKFxyXG4gICAgICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxyXG4gICAgICAgIGxldmVsLFxyXG4gICAgICAgIGBbdHdlYWsgJHtpZH1dICR7cGFydHMuam9pbihcIiBcIil9YCxcclxuICAgICAgKTtcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICAvKiBzd2FsbG93IFx1MjAxNCBuZXZlciBsZXQgbG9nZ2luZyBicmVhayBhIHR3ZWFrICovXHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIG1hbmlmZXN0LFxyXG4gICAgcHJvY2VzczogXCJyZW5kZXJlclwiLFxyXG4gICAgbG9nOiB7XHJcbiAgICAgIGRlYnVnOiAoLi4uYSkgPT4gbG9nKFwiZGVidWdcIiwgLi4uYSksXHJcbiAgICAgIGluZm86ICguLi5hKSA9PiBsb2coXCJpbmZvXCIsIC4uLmEpLFxyXG4gICAgICB3YXJuOiAoLi4uYSkgPT4gbG9nKFwid2FyblwiLCAuLi5hKSxcclxuICAgICAgZXJyb3I6ICguLi5hKSA9PiBsb2coXCJlcnJvclwiLCAuLi5hKSxcclxuICAgIH0sXHJcbiAgICBzdG9yYWdlOiByZW5kZXJlclN0b3JhZ2UoaWQpLFxyXG4gICAgc2V0dGluZ3M6IHtcclxuICAgICAgcmVnaXN0ZXI6IChzKSA9PiByZWdpc3RlclNlY3Rpb24oeyAuLi5zLCBpZDogYCR7aWR9OiR7cy5pZH1gIH0pLFxyXG4gICAgICByZWdpc3RlclBhZ2U6IChwKSA9PlxyXG4gICAgICAgIHJlZ2lzdGVyUGFnZShpZCwgbWFuaWZlc3QsIHsgLi4ucCwgaWQ6IGAke2lkfToke3AuaWR9YCB9KSxcclxuICAgIH0sXHJcbiAgICByZWFjdDoge1xyXG4gICAgICBnZXRGaWJlcjogKG4pID0+IGZpYmVyRm9yTm9kZShuKSBhcyBSZWFjdEZpYmVyTm9kZSB8IG51bGwsXHJcbiAgICAgIGZpbmRPd25lckJ5TmFtZTogKG4sIG5hbWUpID0+IHtcclxuICAgICAgICBsZXQgZiA9IGZpYmVyRm9yTm9kZShuKSBhcyBSZWFjdEZpYmVyTm9kZSB8IG51bGw7XHJcbiAgICAgICAgd2hpbGUgKGYpIHtcclxuICAgICAgICAgIGNvbnN0IHQgPSBmLnR5cGUgYXMgeyBkaXNwbGF5TmFtZT86IHN0cmluZzsgbmFtZT86IHN0cmluZyB9IHwgbnVsbDtcclxuICAgICAgICAgIGlmICh0ICYmICh0LmRpc3BsYXlOYW1lID09PSBuYW1lIHx8IHQubmFtZSA9PT0gbmFtZSkpIHJldHVybiBmO1xyXG4gICAgICAgICAgZiA9IGYucmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfSxcclxuICAgICAgd2FpdEZvckVsZW1lbnQ6IChzZWwsIHRpbWVvdXRNcyA9IDUwMDApID0+XHJcbiAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XHJcbiAgICAgICAgICBpZiAoZXhpc3RpbmcpIHJldHVybiByZXNvbHZlKGV4aXN0aW5nKTtcclxuICAgICAgICAgIGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIHRpbWVvdXRNcztcclxuICAgICAgICAgIGNvbnN0IG9icyA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XHJcbiAgICAgICAgICAgIGlmIChlbCkge1xyXG4gICAgICAgICAgICAgIG9icy5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZShlbCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoRGF0ZS5ub3coKSA+IGRlYWRsaW5lKSB7XHJcbiAgICAgICAgICAgICAgb2JzLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGB0aW1lb3V0IHdhaXRpbmcgZm9yICR7c2VsfWApKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBvYnMub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xyXG4gICAgICAgIH0pLFxyXG4gICAgfSxcclxuICAgIGlwYzoge1xyXG4gICAgICBvbjogKGMsIGgpID0+IHtcclxuICAgICAgICBjb25zdCB3cmFwcGVkID0gKF9lOiB1bmtub3duLCAuLi5hcmdzOiB1bmtub3duW10pID0+IGgoLi4uYXJncyk7XHJcbiAgICAgICAgaXBjUmVuZGVyZXIub24oYGNvZGV4cHA6JHtpZH06JHtjfWAsIHdyYXBwZWQpO1xyXG4gICAgICAgIHJldHVybiAoKSA9PiBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcihgY29kZXhwcDoke2lkfToke2N9YCwgd3JhcHBlZCk7XHJcbiAgICAgIH0sXHJcbiAgICAgIHNlbmQ6IChjLCAuLi5hcmdzKSA9PiBpcGNSZW5kZXJlci5zZW5kKGBjb2RleHBwOiR7aWR9OiR7Y31gLCAuLi5hcmdzKSxcclxuICAgICAgaW52b2tlOiA8VD4oYzogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+XHJcbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKGBjb2RleHBwOiR7aWR9OiR7Y31gLCAuLi5hcmdzKSBhcyBQcm9taXNlPFQ+LFxyXG4gICAgfSxcclxuICAgIGZzOiByZW5kZXJlckZzKGlkLCBwYXRocyksXHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyZXJTdG9yYWdlKGlkOiBzdHJpbmcpIHtcclxuICBjb25zdCBrZXkgPSBgY29kZXhwcDpzdG9yYWdlOiR7aWR9YDtcclxuICBjb25zdCByZWFkID0gKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSkgPz8gXCJ7fVwiKTtcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICByZXR1cm4ge307XHJcbiAgICB9XHJcbiAgfTtcclxuICBjb25zdCB3cml0ZSA9ICh2OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT5cclxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgSlNPTi5zdHJpbmdpZnkodikpO1xyXG4gIHJldHVybiB7XHJcbiAgICBnZXQ6IDxUPihrOiBzdHJpbmcsIGQ/OiBUKSA9PiAoayBpbiByZWFkKCkgPyAocmVhZCgpW2tdIGFzIFQpIDogKGQgYXMgVCkpLFxyXG4gICAgc2V0OiAoazogc3RyaW5nLCB2OiB1bmtub3duKSA9PiB7XHJcbiAgICAgIGNvbnN0IG8gPSByZWFkKCk7XHJcbiAgICAgIG9ba10gPSB2O1xyXG4gICAgICB3cml0ZShvKTtcclxuICAgIH0sXHJcbiAgICBkZWxldGU6IChrOiBzdHJpbmcpID0+IHtcclxuICAgICAgY29uc3QgbyA9IHJlYWQoKTtcclxuICAgICAgZGVsZXRlIG9ba107XHJcbiAgICAgIHdyaXRlKG8pO1xyXG4gICAgfSxcclxuICAgIGFsbDogKCkgPT4gcmVhZCgpLFxyXG4gIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlcmVyRnMoaWQ6IHN0cmluZywgX3BhdGhzOiBVc2VyUGF0aHMpIHtcclxuICAvLyBTYW5kYm94ZWQgcmVuZGVyZXIgY2FuJ3QgdXNlIE5vZGUgZnMgZGlyZWN0bHkgXHUyMDE0IHByb3h5IHRocm91Z2ggbWFpbiBJUEMuXHJcbiAgcmV0dXJuIHtcclxuICAgIGRhdGFEaXI6IGA8cmVtb3RlPi90d2Vhay1kYXRhLyR7aWR9YCxcclxuICAgIHJlYWQ6IChwOiBzdHJpbmcpID0+XHJcbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJyZWFkXCIsIGlkLCBwKSBhcyBQcm9taXNlPHN0cmluZz4sXHJcbiAgICB3cml0ZTogKHA6IHN0cmluZywgYzogc3RyaW5nKSA9PlxyXG4gICAgICBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnR3ZWFrLWZzXCIsIFwid3JpdGVcIiwgaWQsIHAsIGMpIGFzIFByb21pc2U8dm9pZD4sXHJcbiAgICBleGlzdHM6IChwOiBzdHJpbmcpID0+XHJcbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJleGlzdHNcIiwgaWQsIHApIGFzIFByb21pc2U8Ym9vbGVhbj4sXHJcbiAgfTtcclxufVxyXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFXQSxJQUFBQSxtQkFBNEI7OztBQzZCckIsU0FBUyxtQkFBeUI7QUFDdkMsTUFBSSxPQUFPLCtCQUFnQztBQUMzQyxRQUFNLFlBQVksb0JBQUksSUFBK0I7QUFDckQsTUFBSSxTQUFTO0FBQ2IsUUFBTSxZQUFZLG9CQUFJLElBQTRDO0FBRWxFLFFBQU0sT0FBMEI7QUFBQSxJQUM5QixlQUFlO0FBQUEsSUFDZjtBQUFBLElBQ0EsT0FBTyxVQUFVO0FBQ2YsWUFBTSxLQUFLO0FBQ1gsZ0JBQVUsSUFBSSxJQUFJLFFBQVE7QUFFMUIsY0FBUTtBQUFBLFFBQ047QUFBQSxRQUNBLFNBQVM7QUFBQSxRQUNULFNBQVM7QUFBQSxNQUNYO0FBQ0EsYUFBTztBQUFBLElBQ1Q7QUFBQSxJQUNBLEdBQUcsT0FBTyxJQUFJO0FBQ1osVUFBSSxJQUFJLFVBQVUsSUFBSSxLQUFLO0FBQzNCLFVBQUksQ0FBQyxFQUFHLFdBQVUsSUFBSSxPQUFRLElBQUksb0JBQUksSUFBSSxDQUFFO0FBQzVDLFFBQUUsSUFBSSxFQUFFO0FBQUEsSUFDVjtBQUFBLElBQ0EsSUFBSSxPQUFPLElBQUk7QUFDYixnQkFBVSxJQUFJLEtBQUssR0FBRyxPQUFPLEVBQUU7QUFBQSxJQUNqQztBQUFBLElBQ0EsS0FBSyxVQUFVLE1BQU07QUFDbkIsZ0JBQVUsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLE9BQU8sR0FBRyxHQUFHLElBQUks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QUFJO0FBQ0YsaUNBQVksS0FBSyx1QkFBdUIsUUFBUSxHQUFHO0FBQUEsRUFDckQsUUFBUTtBQUFBLEVBQUM7QUFDWDtBQUNBLFNBQVNBLGVBQWMsR0FBb0I7QUFDekMsTUFBSTtBQUNGLFdBQU8sT0FBTyxNQUFNLFdBQVcsSUFBSSxLQUFLLFVBQVUsQ0FBQztBQUFBLEVBQ3JELFFBQVE7QUFDTixXQUFPLE9BQU8sQ0FBQztBQUFBLEVBQ2pCO0FBQ0Y7QUFFQSxRQUFRLGlCQUFpQixFQUFFLEtBQUssU0FBUyxLQUFLLENBQUM7QUFHL0MsSUFBSTtBQUNGLG1CQUFpQjtBQUNqQixVQUFRLHNCQUFzQjtBQUNoQyxTQUFTLEdBQUc7QUFDVixVQUFRLHFCQUFxQixPQUFPLENBQUMsQ0FBQztBQUN4QztBQUVBLGVBQWUsTUFBTTtBQUNuQixNQUFJLFNBQVMsZUFBZSxXQUFXO0FBQ3JDLGFBQVMsaUJBQWlCLG9CQUFvQixNQUFNLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxFQUNwRSxPQUFPO0FBQ0wsU0FBSztBQUFBLEVBQ1A7QUFDRixDQUFDO0FBRUQsZUFBZSxPQUFPO0FBQ3BCLFVBQVEsY0FBYyxFQUFFLFlBQVksU0FBUyxXQUFXLENBQUM7QUFDekQsTUFBSTtBQUNGLDBCQUFzQjtBQUN0QixZQUFRLDJCQUEyQjtBQUNuQyxVQUFNLGVBQWU7QUFDckIsWUFBUSxvQkFBb0I7QUFDNUIsb0JBQWdCO0FBQ2hCLFlBQVEsZUFBZTtBQUFBLEVBQ3pCLFNBQVMsR0FBRztBQUNWLFlBQVEsZUFBZSxPQUFRLEdBQWEsU0FBUyxDQUFDLENBQUM7QUFDdkQsWUFBUSxNQUFNLHlDQUF5QyxDQUFDO0FBQUEsRUFDMUQ7QUFDRjtBQUlBLElBQUksWUFBa0M7QUFDdEMsU0FBUyxrQkFBd0I7QUFDL0IsK0JBQVksR0FBRywwQkFBMEIsTUFBTTtBQUM3QyxRQUFJLFVBQVc7QUFDZixpQkFBYSxZQUFZO0FBQ3ZCLFVBQUk7QUFDRixnQkFBUSxLQUFLLHVDQUF1QztBQUNwRCxjQUFNLGtCQUFrQjtBQUN4QixjQUFNLGVBQWU7QUFBQSxNQUN2QixTQUFTLEdBQUc7QUFDVixnQkFBUSxNQUFNLHVDQUF1QyxDQUFDO0FBQUEsTUFDeEQsVUFBRTtBQUNBLG9CQUFZO0FBQUEsTUFDZDtBQUFBLElBQ0YsR0FBRztBQUFBLEVBQ0wsQ0FBQztBQUNIOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfZWxlY3Ryb24iLCAic3VidGl0bGUiLCAicm9vdCIsICJpbXBvcnRfZWxlY3Ryb24iLCAibW9kdWxlIiwgImV4cG9ydHMiLCAic2FmZVN0cmluZ2lmeSJdCn0K
