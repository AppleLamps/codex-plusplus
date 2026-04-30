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
  confirmedMainTweaks: /* @__PURE__ */ new Set()
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
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Codex++ Updates"));
  const card = roundedCard();
  const loading = rowSimple("Loading update settings", "Checking current Codex++ configuration.");
  card.appendChild(loading);
  section.appendChild(card);
  sectionsWrap.appendChild(section);
  void import_electron.ipcRenderer.invoke("codexpp:get-config").then((config) => {
    card.textContent = "";
    renderCodexPlusPlusConfig(card, config);
  }).catch((e) => {
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
      const health = await loadRuntimeHealth();
      await import_electron.ipcRenderer.invoke("codexpp:reveal", health?.paths.logDir ?? "<user dir>/log");
    }),
    "maintenance:open-logs"
  ));
  maintenanceCard.appendChild(copyCommandRow("Copy status command", "Machine-readable install status.", "codex-plusplus status --json"));
  maintenanceCard.appendChild(copyCommandRow("Copy support bundle command", "Redacted support diagnostics.", "codex-plusplus support bundle"));
  maintenanceCard.appendChild(copyCommandRow("Copy uninstall command", "Run after quitting Codex to restore the app backup.", "codex-plusplus uninstall"));
  maintenanceCard.appendChild(reportBugRow());
  maintenance.appendChild(maintenanceCard);
  sectionsWrap.appendChild(maintenance);
}
function renderInstallHealth(sectionsWrap) {
  const section = document.createElement("section");
  section.className = "flex flex-col gap-2";
  section.appendChild(sectionTitle("Install Health"));
  const card = roundedCard();
  card.appendChild(loadingRow("Loading runtime health", "Checking runtime paths and reload status."));
  section.appendChild(card);
  sectionsWrap.appendChild(section);
  void loadRuntimeHealth().then((health) => {
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
    card.textContent = "";
    card.appendChild(errorRow("Could not load runtime health", String(e)));
  });
}
function renderCodexPlusPlusConfig(card, config) {
  card.appendChild(autoUpdateRow(config));
  card.appendChild(checkForUpdatesRow(config.updateCheck));
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
        void import_electron.ipcRenderer.invoke("codexpp:open-external", check.releaseUrl);
      })
    );
  }
  actions.appendChild(
    actionButton("Check Now", "Check for Codex++ updates", async (btn) => {
      setButtonPending(btn, true, "Checking");
      try {
        const next = await import_electron.ipcRenderer.invoke("codexpp:check-codexpp-update", true);
        const card = row.parentElement;
        if (!card) return;
        card.textContent = "";
        const config = await import_electron.ipcRenderer.invoke("codexpp:get-config");
        renderCodexPlusPlusConfig(card, {
          ...config,
          updateCheck: next
        });
      } catch (e) {
        plog("Codex++ update check failed", String(e));
        row.insertAdjacentElement("afterend", errorRow("Update check failed", String(e)));
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
      void import_electron.ipcRenderer.invoke(
        "codexpp:open-external",
        `https://github.com/b-nnett/codex-plusplus/issues/new?title=${title}&body=${body}`
      );
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
  search.value = state.tweaksSearch;
  search.placeholder = "Search tweaks";
  search.setAttribute("aria-label", "Search tweaks");
  search.className = "border-token-border h-8 min-w-48 flex-1 rounded-lg border bg-transparent px-2 text-sm text-token-text-primary outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border";
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
  header.className = "flex items-start justify-between gap-4 p-3";
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
  titleRow.className = "flex items-center gap-2";
  const name = document.createElement("div");
  name.className = "min-w-0 text-sm font-medium text-token-text-primary";
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
      void import_electron.ipcRenderer.invoke("codexpp:open-external", `https://github.com/${m.githubRepo}`);
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
  }
  const feedback = state.feedback.get(`tweak:${m.id}`);
  if (feedback) stack.appendChild(inlineFeedback(feedback.kind, feedback.message));
  left.appendChild(stack);
  header.appendChild(left);
  const right = document.createElement("div");
  right.className = "flex shrink-0 items-center gap-2 pt-0.5";
  if (t.update?.updateAvailable && t.update.releaseUrl) {
    right.appendChild(
      compactButton("View Release", () => {
        void import_electron.ipcRenderer.invoke("codexpp:open-external", t.update.releaseUrl);
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
    ariaLabel: `${t.enabled ? "Disable" : "Enable"} ${m.name}`
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
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
async function loadRuntimeHealth() {
  return await import_electron.ipcRenderer.invoke("codexpp:runtime-health").catch(() => null);
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
  return btn;
}
function setButtonPending(btn, pending, label = "Working") {
  btn.disabled = pending;
  if (btn.dataset.codexppLabel) {
    btn.textContent = pending ? label : btn.dataset.codexppLabel;
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
  const pill = document.createElement("span");
  const knob = document.createElement("span");
  knob.className = "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] shadow-sm transition-transform duration-200 ease-out h-4 w-4";
  pill.appendChild(knob);
  const apply = (on) => {
    btn.setAttribute("aria-checked", String(on));
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.className = "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction";
    pill.className = `relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out h-5 w-8 ${on ? "bg-token-charts-blue" : "bg-token-foreground/20"}`;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3ByZWxvYWQvaW5kZXgudHMiLCAiLi4vc3JjL3ByZWxvYWQvcmVhY3QtaG9vay50cyIsICIuLi9zcmMvcHJlbG9hZC9zZXR0aW5ncy1pbmplY3Rvci50cyIsICIuLi9zcmMvcHJlbG9hZC90d2Vhay1ob3N0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcclxuICogUmVuZGVyZXIgcHJlbG9hZCBlbnRyeS4gUnVucyBpbiBhbiBpc29sYXRlZCB3b3JsZCBiZWZvcmUgQ29kZXgncyBwYWdlIEpTLlxyXG4gKiBSZXNwb25zaWJpbGl0aWVzOlxyXG4gKiAgIDEuIEluc3RhbGwgYSBSZWFjdCBEZXZUb29scy1zaGFwZWQgZ2xvYmFsIGhvb2sgdG8gY2FwdHVyZSB0aGUgcmVuZGVyZXJcclxuICogICAgICByZWZlcmVuY2Ugd2hlbiBSZWFjdCBtb3VudHMuIFdlIHVzZSB0aGlzIGZvciBmaWJlciB3YWxraW5nLlxyXG4gKiAgIDIuIEFmdGVyIERPTUNvbnRlbnRMb2FkZWQsIGtpY2sgb2ZmIHNldHRpbmdzLWluamVjdGlvbiBsb2dpYy5cclxuICogICAzLiBEaXNjb3ZlciByZW5kZXJlci1zY29wZWQgdHdlYWtzICh2aWEgSVBDIHRvIG1haW4pIGFuZCBzdGFydCB0aGVtLlxyXG4gKiAgIDQuIExpc3RlbiBmb3IgYGNvZGV4cHA6dHdlYWtzLWNoYW5nZWRgIGZyb20gbWFpbiAoZmlsZXN5c3RlbSB3YXRjaGVyKSBhbmRcclxuICogICAgICBob3QtcmVsb2FkIHR3ZWFrcyB3aXRob3V0IGRyb3BwaW5nIHRoZSBwYWdlLlxyXG4gKi9cclxuXHJcbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XHJcbmltcG9ydCB7IGluc3RhbGxSZWFjdEhvb2sgfSBmcm9tIFwiLi9yZWFjdC1ob29rXCI7XG5pbXBvcnQgeyBzdGFydFNldHRpbmdzSW5qZWN0b3IgfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xuaW1wb3J0IHsgc3RhcnRUd2Vha0hvc3QsIHRlYXJkb3duVHdlYWtIb3N0IH0gZnJvbSBcIi4vdHdlYWstaG9zdFwiO1xuXHJcbi8vIEZpbGUtbG9nIHByZWxvYWQgcHJvZ3Jlc3Mgc28gd2UgY2FuIGRpYWdub3NlIHdpdGhvdXQgRGV2VG9vbHMuIEJlc3QtZWZmb3J0OlxyXG4vLyBmYWlsdXJlcyBoZXJlIG11c3QgbmV2ZXIgdGhyb3cgYmVjYXVzZSB3ZSdkIHRha2UgdGhlIHBhZ2UgZG93biB3aXRoIHVzLlxyXG4vL1xyXG4vLyBDb2RleCdzIHJlbmRlcmVyIGlzIHNhbmRib3hlZCAoc2FuZGJveDogdHJ1ZSksIHNvIGByZXF1aXJlKFwibm9kZTpmc1wiKWAgaXNcclxuLy8gdW5hdmFpbGFibGUuIFdlIGZvcndhcmQgbG9nIGxpbmVzIHRvIG1haW4gdmlhIElQQzsgbWFpbiB3cml0ZXMgdGhlIGZpbGUuXHJcbmZ1bmN0aW9uIGZpbGVMb2coc3RhZ2U6IHN0cmluZywgZXh0cmE/OiB1bmtub3duKTogdm9pZCB7XHJcbiAgY29uc3QgbXNnID0gYFtjb2RleC1wbHVzcGx1cyBwcmVsb2FkXSAke3N0YWdlfSR7XHJcbiAgICBleHRyYSA9PT0gdW5kZWZpbmVkID8gXCJcIiA6IFwiIFwiICsgc2FmZVN0cmluZ2lmeShleHRyYSlcclxuICB9YDtcclxuICB0cnkge1xyXG4gICAgY29uc29sZS5lcnJvcihtc2cpO1xyXG4gIH0gY2F0Y2gge31cclxuICB0cnkge1xyXG4gICAgaXBjUmVuZGVyZXIuc2VuZChcImNvZGV4cHA6cHJlbG9hZC1sb2dcIiwgXCJpbmZvXCIsIG1zZyk7XHJcbiAgfSBjYXRjaCB7fVxyXG59XHJcbmZ1bmN0aW9uIHNhZmVTdHJpbmdpZnkodjogdW5rbm93bik6IHN0cmluZyB7XHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBKU09OLnN0cmluZ2lmeSh2KTtcclxuICB9IGNhdGNoIHtcclxuICAgIHJldHVybiBTdHJpbmcodik7XHJcbiAgfVxyXG59XHJcblxyXG5maWxlTG9nKFwicHJlbG9hZCBlbnRyeVwiLCB7IHVybDogbG9jYXRpb24uaHJlZiB9KTtcclxuXHJcbi8vIFJlYWN0IGhvb2sgbXVzdCBiZSBpbnN0YWxsZWQgKmJlZm9yZSogQ29kZXgncyBidW5kbGUgcnVucy5cclxudHJ5IHtcclxuICBpbnN0YWxsUmVhY3RIb29rKCk7XHJcbiAgZmlsZUxvZyhcInJlYWN0IGhvb2sgaW5zdGFsbGVkXCIpO1xyXG59IGNhdGNoIChlKSB7XHJcbiAgZmlsZUxvZyhcInJlYWN0IGhvb2sgRkFJTEVEXCIsIFN0cmluZyhlKSk7XHJcbn1cclxuXHJcbnF1ZXVlTWljcm90YXNrKCgpID0+IHtcclxuICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSA9PT0gXCJsb2FkaW5nXCIpIHtcclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsIGJvb3QsIHsgb25jZTogdHJ1ZSB9KTtcclxuICB9IGVsc2Uge1xyXG4gICAgYm9vdCgpO1xyXG4gIH1cclxufSk7XHJcblxyXG5hc3luYyBmdW5jdGlvbiBib290KCkge1xyXG4gIGZpbGVMb2coXCJib290IHN0YXJ0XCIsIHsgcmVhZHlTdGF0ZTogZG9jdW1lbnQucmVhZHlTdGF0ZSB9KTtcclxuICB0cnkge1xyXG4gICAgc3RhcnRTZXR0aW5nc0luamVjdG9yKCk7XG4gICAgZmlsZUxvZyhcInNldHRpbmdzIGluamVjdG9yIHN0YXJ0ZWRcIik7XG4gICAgYXdhaXQgc3RhcnRUd2Vha0hvc3QoKTtcbiAgICBmaWxlTG9nKFwidHdlYWsgaG9zdCBzdGFydGVkXCIpO1xuICAgIHN1YnNjcmliZVJlbG9hZCgpO1xuICAgIGZpbGVMb2coXCJib290IGNvbXBsZXRlXCIpO1xuICB9IGNhdGNoIChlKSB7XHJcbiAgICBmaWxlTG9nKFwiYm9vdCBGQUlMRURcIiwgU3RyaW5nKChlIGFzIEVycm9yKT8uc3RhY2sgPz8gZSkpO1xyXG4gICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gcHJlbG9hZCBib290IGZhaWxlZDpcIiwgZSk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBIb3QgcmVsb2FkOiBnYXRlZCBiZWhpbmQgYSBzbWFsbCBpbi1mbGlnaHQgbG9jayBzbyBhIGZsdXJyeSBvZiBmcyBldmVudHNcclxuLy8gZG9lc24ndCByZWVudHJhbnRseSB0ZWFyIGRvd24gdGhlIGhvc3QgbWlkLWxvYWQuXHJcbmxldCByZWxvYWRpbmc6IFByb21pc2U8dm9pZD4gfCBudWxsID0gbnVsbDtcclxuZnVuY3Rpb24gc3Vic2NyaWJlUmVsb2FkKCk6IHZvaWQge1xyXG4gIGlwY1JlbmRlcmVyLm9uKFwiY29kZXhwcDp0d2Vha3MtY2hhbmdlZFwiLCAoKSA9PiB7XHJcbiAgICBpZiAocmVsb2FkaW5nKSByZXR1cm47XHJcbiAgICByZWxvYWRpbmcgPSAoYXN5bmMgKCkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnNvbGUuaW5mbyhcIltjb2RleC1wbHVzcGx1c10gaG90LXJlbG9hZGluZyB0d2Vha3NcIik7XG4gICAgICAgIGF3YWl0IHRlYXJkb3duVHdlYWtIb3N0KCk7XG4gICAgICAgIGF3YWl0IHN0YXJ0VHdlYWtIb3N0KCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdIGhvdCByZWxvYWQgZmFpbGVkOlwiLCBlKTtcclxuICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICByZWxvYWRpbmcgPSBudWxsO1xyXG4gICAgICB9XHJcbiAgICB9KSgpO1xyXG4gIH0pO1xyXG59XHJcbiIsICIvKipcclxuICogSW5zdGFsbCBhIG1pbmltYWwgX19SRUFDVF9ERVZUT09MU19HTE9CQUxfSE9PS19fLiBSZWFjdCBjYWxsc1xyXG4gKiBgaG9vay5pbmplY3QocmVuZGVyZXJJbnRlcm5hbHMpYCBkdXJpbmcgYGNyZWF0ZVJvb3RgL2BoeWRyYXRlUm9vdGAuIFRoZVxyXG4gKiBcImludGVybmFsc1wiIG9iamVjdCBleHBvc2VzIGZpbmRGaWJlckJ5SG9zdEluc3RhbmNlLCB3aGljaCBsZXRzIHVzIHR1cm4gYVxyXG4gKiBET00gbm9kZSBpbnRvIGEgUmVhY3QgZmliZXIgXHUyMDE0IG5lY2Vzc2FyeSBmb3Igb3VyIFNldHRpbmdzIGluamVjdG9yLlxyXG4gKlxyXG4gKiBXZSBkb24ndCB3YW50IHRvIGJyZWFrIHJlYWwgUmVhY3QgRGV2VG9vbHMgaWYgdGhlIHVzZXIgb3BlbnMgaXQ7IHdlIGluc3RhbGxcclxuICogb25seSBpZiBubyBob29rIGV4aXN0cyB5ZXQsIGFuZCB3ZSBmb3J3YXJkIGNhbGxzIHRvIGEgZG93bnN0cmVhbSBob29rIGlmXHJcbiAqIG9uZSBpcyBsYXRlciBhc3NpZ25lZC5cclxuICovXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICBpbnRlcmZhY2UgV2luZG93IHtcclxuICAgIF9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXz86IFJlYWN0RGV2dG9vbHNIb29rO1xyXG4gICAgX19jb2RleHBwX18/OiB7XHJcbiAgICAgIGhvb2s6IFJlYWN0RGV2dG9vbHNIb29rO1xyXG4gICAgICByZW5kZXJlcnM6IE1hcDxudW1iZXIsIFJlbmRlcmVySW50ZXJuYWxzPjtcclxuICAgIH07XHJcbiAgfVxyXG59XHJcblxyXG5pbnRlcmZhY2UgUmVuZGVyZXJJbnRlcm5hbHMge1xyXG4gIGZpbmRGaWJlckJ5SG9zdEluc3RhbmNlPzogKG46IE5vZGUpID0+IHVua25vd247XHJcbiAgdmVyc2lvbj86IHN0cmluZztcclxuICBidW5kbGVUeXBlPzogbnVtYmVyO1xyXG4gIHJlbmRlcmVyUGFja2FnZU5hbWU/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSZWFjdERldnRvb2xzSG9vayB7XHJcbiAgc3VwcG9ydHNGaWJlcjogdHJ1ZTtcclxuICByZW5kZXJlcnM6IE1hcDxudW1iZXIsIFJlbmRlcmVySW50ZXJuYWxzPjtcclxuICBvbihldmVudDogc3RyaW5nLCBmbjogKC4uLmE6IHVua25vd25bXSkgPT4gdm9pZCk6IHZvaWQ7XHJcbiAgb2ZmKGV2ZW50OiBzdHJpbmcsIGZuOiAoLi4uYTogdW5rbm93bltdKSA9PiB2b2lkKTogdm9pZDtcclxuICBlbWl0KGV2ZW50OiBzdHJpbmcsIC4uLmE6IHVua25vd25bXSk6IHZvaWQ7XHJcbiAgaW5qZWN0KHJlbmRlcmVyOiBSZW5kZXJlckludGVybmFscyk6IG51bWJlcjtcclxuICBvblNjaGVkdWxlRmliZXJSb290PygpOiB2b2lkO1xyXG4gIG9uQ29tbWl0RmliZXJSb290PygpOiB2b2lkO1xyXG4gIG9uQ29tbWl0RmliZXJVbm1vdW50PygpOiB2b2lkO1xyXG4gIGNoZWNrRENFPygpOiB2b2lkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbFJlYWN0SG9vaygpOiB2b2lkIHtcclxuICBpZiAod2luZG93Ll9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfXykgcmV0dXJuO1xyXG4gIGNvbnN0IHJlbmRlcmVycyA9IG5ldyBNYXA8bnVtYmVyLCBSZW5kZXJlckludGVybmFscz4oKTtcclxuICBsZXQgbmV4dElkID0gMTtcclxuICBjb25zdCBsaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PCguLi5hOiB1bmtub3duW10pID0+IHZvaWQ+PigpO1xyXG5cclxuICBjb25zdCBob29rOiBSZWFjdERldnRvb2xzSG9vayA9IHtcclxuICAgIHN1cHBvcnRzRmliZXI6IHRydWUsXHJcbiAgICByZW5kZXJlcnMsXHJcbiAgICBpbmplY3QocmVuZGVyZXIpIHtcclxuICAgICAgY29uc3QgaWQgPSBuZXh0SWQrKztcclxuICAgICAgcmVuZGVyZXJzLnNldChpZCwgcmVuZGVyZXIpO1xyXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgICBjb25zb2xlLmRlYnVnKFxyXG4gICAgICAgIFwiW2NvZGV4LXBsdXNwbHVzXSBSZWFjdCByZW5kZXJlciBhdHRhY2hlZDpcIixcclxuICAgICAgICByZW5kZXJlci5yZW5kZXJlclBhY2thZ2VOYW1lLFxyXG4gICAgICAgIHJlbmRlcmVyLnZlcnNpb24sXHJcbiAgICAgICk7XHJcbiAgICAgIHJldHVybiBpZDtcclxuICAgIH0sXHJcbiAgICBvbihldmVudCwgZm4pIHtcclxuICAgICAgbGV0IHMgPSBsaXN0ZW5lcnMuZ2V0KGV2ZW50KTtcclxuICAgICAgaWYgKCFzKSBsaXN0ZW5lcnMuc2V0KGV2ZW50LCAocyA9IG5ldyBTZXQoKSkpO1xyXG4gICAgICBzLmFkZChmbik7XHJcbiAgICB9LFxyXG4gICAgb2ZmKGV2ZW50LCBmbikge1xyXG4gICAgICBsaXN0ZW5lcnMuZ2V0KGV2ZW50KT8uZGVsZXRlKGZuKTtcclxuICAgIH0sXHJcbiAgICBlbWl0KGV2ZW50LCAuLi5hcmdzKSB7XHJcbiAgICAgIGxpc3RlbmVycy5nZXQoZXZlbnQpPy5mb3JFYWNoKChmbikgPT4gZm4oLi4uYXJncykpO1xyXG4gICAgfSxcclxuICAgIG9uQ29tbWl0RmliZXJSb290KCkge30sXHJcbiAgICBvbkNvbW1pdEZpYmVyVW5tb3VudCgpIHt9LFxyXG4gICAgb25TY2hlZHVsZUZpYmVyUm9vdCgpIHt9LFxyXG4gICAgY2hlY2tEQ0UoKSB7fSxcclxuICB9O1xyXG5cclxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkod2luZG93LCBcIl9fUkVBQ1RfREVWVE9PTFNfR0xPQkFMX0hPT0tfX1wiLCB7XHJcbiAgICBjb25maWd1cmFibGU6IHRydWUsXHJcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcclxuICAgIHdyaXRhYmxlOiB0cnVlLCAvLyBhbGxvdyByZWFsIERldlRvb2xzIHRvIG92ZXJ3cml0ZSBpZiB1c2VyIGluc3RhbGxzIGl0XHJcbiAgICB2YWx1ZTogaG9vayxcclxuICB9KTtcclxuXHJcbiAgd2luZG93Ll9fY29kZXhwcF9fID0geyBob29rLCByZW5kZXJlcnMgfTtcclxufVxyXG5cclxuLyoqIFJlc29sdmUgdGhlIFJlYWN0IGZpYmVyIGZvciBhIERPTSBub2RlLCBpZiBhbnkgcmVuZGVyZXIgaGFzIG9uZS4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGZpYmVyRm9yTm9kZShub2RlOiBOb2RlKTogdW5rbm93biB8IG51bGwge1xyXG4gIGNvbnN0IHJlbmRlcmVycyA9IHdpbmRvdy5fX2NvZGV4cHBfXz8ucmVuZGVyZXJzO1xyXG4gIGlmIChyZW5kZXJlcnMpIHtcclxuICAgIGZvciAoY29uc3QgciBvZiByZW5kZXJlcnMudmFsdWVzKCkpIHtcclxuICAgICAgY29uc3QgZiA9IHIuZmluZEZpYmVyQnlIb3N0SW5zdGFuY2U/Lihub2RlKTtcclxuICAgICAgaWYgKGYpIHJldHVybiBmO1xyXG4gICAgfVxyXG4gIH1cclxuICAvLyBGYWxsYmFjazogcmVhZCB0aGUgUmVhY3QgaW50ZXJuYWwgcHJvcGVydHkgZGlyZWN0bHkgZnJvbSB0aGUgRE9NIG5vZGUuXHJcbiAgLy8gUmVhY3Qgc3RvcmVzIGZpYmVycyBhcyBhIHByb3BlcnR5IHdob3NlIGtleSBzdGFydHMgd2l0aCBcIl9fcmVhY3RGaWJlclwiLlxyXG4gIGZvciAoY29uc3QgayBvZiBPYmplY3Qua2V5cyhub2RlKSkge1xyXG4gICAgaWYgKGsuc3RhcnRzV2l0aChcIl9fcmVhY3RGaWJlclwiKSkgcmV0dXJuIChub2RlIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tdO1xyXG4gIH1cclxuICByZXR1cm4gbnVsbDtcclxufVxyXG4iLCAiLyoqXHJcbiAqIFNldHRpbmdzIGluamVjdG9yIGZvciBDb2RleCdzIFNldHRpbmdzIHBhZ2UuXHJcbiAqXHJcbiAqIENvZGV4J3Mgc2V0dGluZ3MgaXMgYSByb3V0ZWQgcGFnZSAoVVJMIHN0YXlzIGF0IGAvaW5kZXguaHRtbD9ob3N0SWQ9bG9jYWxgKVxyXG4gKiBOT1QgYSBtb2RhbCBkaWFsb2cuIFRoZSBzaWRlYmFyIGxpdmVzIGluc2lkZSBhIGA8ZGl2IGNsYXNzPVwiZmxleCBmbGV4LWNvbFxyXG4gKiBnYXAtMSBnYXAtMFwiPmAgd3JhcHBlciB0aGF0IGhvbGRzIG9uZSBvciBtb3JlIGA8ZGl2IGNsYXNzPVwiZmxleCBmbGV4LWNvbFxyXG4gKiBnYXAtcHhcIj5gIGdyb3VwcyBvZiBidXR0b25zLiBUaGVyZSBhcmUgbm8gc3RhYmxlIGByb2xlYCAvIGBhcmlhLWxhYmVsYCAvXHJcbiAqIGBkYXRhLXRlc3RpZGAgaG9va3Mgb24gdGhlIHNoZWxsIHNvIHdlIGlkZW50aWZ5IHRoZSBzaWRlYmFyIGJ5IHRleHQtY29udGVudFxyXG4gKiBtYXRjaCBhZ2FpbnN0IGtub3duIGl0ZW0gbGFiZWxzIChHZW5lcmFsLCBBcHBlYXJhbmNlLCBDb25maWd1cmF0aW9uLCBcdTIwMjYpLlxyXG4gKlxyXG4gKiBMYXlvdXQgd2UgaW5qZWN0OlxyXG4gKlxyXG4gKiAgIFtDb2RleCdzIGV4aXN0aW5nIGl0ZW1zIGdyb3VwXVxyXG4gKiAgIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCAoYm9yZGVyLXQtdG9rZW4tYm9yZGVyKVxyXG4gKiAgIENPREVYIFBMVVMgUExVUyAgICAgICAgICAgICAgICh1cHBlcmNhc2Ugc3VidGl0bGUsIHRleHQtdG9rZW4tdGV4dC10ZXJ0aWFyeSlcclxuICogICBcdTI0RDggQ29uZmlnXHJcbiAqICAgXHUyNjMwIFR3ZWFrc1xyXG4gKlxyXG4gKiBDbGlja2luZyBDb25maWcgLyBUd2Vha3MgaGlkZXMgQ29kZXgncyBjb250ZW50IHBhbmVsIGNoaWxkcmVuIGFuZCByZW5kZXJzXHJcbiAqIG91ciBvd24gYG1haW4tc3VyZmFjZWAgcGFuZWwgaW4gdGhlaXIgcGxhY2UuIENsaWNraW5nIGFueSBvZiBDb2RleCdzXHJcbiAqIHNpZGViYXIgaXRlbXMgcmVzdG9yZXMgdGhlIG9yaWdpbmFsIHZpZXcuXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tIFwiZWxlY3Ryb25cIjtcclxuaW1wb3J0IHR5cGUge1xyXG4gIFNldHRpbmdzU2VjdGlvbixcclxuICBTZXR0aW5nc1BhZ2UsXHJcbiAgU2V0dGluZ3NIYW5kbGUsXHJcbiAgVHdlYWtNYW5pZmVzdCxcclxufSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xyXG5cclxuLy8gTWlycm9ycyB0aGUgcnVudGltZSdzIG1haW4tc2lkZSBMaXN0ZWRUd2VhayBzaGFwZSAoa2VwdCBpbiBzeW5jIG1hbnVhbGx5KS5cclxuaW50ZXJmYWNlIExpc3RlZFR3ZWFrIHtcclxuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcclxuICBlbnRyeTogc3RyaW5nO1xyXG4gIGRpcjogc3RyaW5nO1xuICBlbnRyeUV4aXN0czogYm9vbGVhbjtcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgbG9hZGFibGU6IGJvb2xlYW47XG4gIGxvYWRFcnJvcj86IHN0cmluZztcbiAgY2FwYWJpbGl0aWVzPzogc3RyaW5nW107XG4gIHVwZGF0ZTogVHdlYWtVcGRhdGVDaGVjayB8IG51bGw7XG59XG5cclxuaW50ZXJmYWNlIFR3ZWFrVXBkYXRlQ2hlY2sge1xyXG4gIGNoZWNrZWRBdDogc3RyaW5nO1xyXG4gIHJlcG86IHN0cmluZztcclxuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xyXG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XHJcbiAgbGF0ZXN0VGFnOiBzdHJpbmcgfCBudWxsO1xyXG4gIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XHJcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xyXG4gIGVycm9yPzogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29kZXhQbHVzUGx1c0NvbmZpZyB7XHJcbiAgdmVyc2lvbjogc3RyaW5nO1xyXG4gIGF1dG9VcGRhdGU6IGJvb2xlYW47XHJcbiAgdXBkYXRlQ2hlY2s6IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayB8IG51bGw7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sge1xuICBjaGVja2VkQXQ6IHN0cmluZztcclxuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xyXG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XHJcbiAgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDtcclxuICByZWxlYXNlTm90ZXM6IHN0cmluZyB8IG51bGw7XHJcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xyXG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUnVudGltZUhlYWx0aCB7XG4gIHZlcnNpb246IHN0cmluZztcbiAgcGF0aHM6IHtcbiAgICB1c2VyUm9vdDogc3RyaW5nO1xuICAgIHJ1bnRpbWVEaXI6IHN0cmluZztcbiAgICB0d2Vha3NEaXI6IHN0cmluZztcbiAgICBsb2dEaXI6IHN0cmluZztcbiAgfTtcbiAgdHdlYWtzOiB7XG4gICAgZGlzY292ZXJlZDogbnVtYmVyO1xuICAgIGxvYWRlZE1haW46IG51bWJlcjtcbiAgICBsb2FkZWRSZW5kZXJlcjogbnVtYmVyIHwgbnVsbDtcbiAgfTtcbiAgc3RhcnRlZEF0OiBzdHJpbmc7XG4gIGxhc3RSZWxvYWQ6IHsgYXQ6IHN0cmluZzsgcmVhc29uOiBzdHJpbmc7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9IHwgbnVsbDtcbiAgcmVjZW50RXJyb3JzOiBBcnJheTx7IGF0OiBzdHJpbmc7IGxldmVsOiBcIndhcm5cIiB8IFwiZXJyb3JcIjsgbWVzc2FnZTogc3RyaW5nIH0+O1xufVxuXG50eXBlIFR3ZWFrU3RhdHVzRmlsdGVyID0gXCJhbGxcIiB8IFwiYXR0ZW50aW9uXCIgfCBcInVwZGF0ZXNcIiB8IFwiZW5hYmxlZFwiIHwgXCJkaXNhYmxlZFwiO1xudHlwZSBGZWVkYmFja0tpbmQgPSBcImluZm9cIiB8IFwic3VjY2Vzc1wiIHwgXCJlcnJvclwiO1xuXG4vKipcbiAqIEEgdHdlYWstcmVnaXN0ZXJlZCBwYWdlLiBXZSBjYXJyeSB0aGUgb3duaW5nIHR3ZWFrJ3MgbWFuaWZlc3Qgc28gd2UgY2FuXG4gKiByZXNvbHZlIHJlbGF0aXZlIGljb25VcmxzIGFuZCBzaG93IGF1dGhvcnNoaXAgaW4gdGhlIHBhZ2UgaGVhZGVyLlxyXG4gKi9cclxuaW50ZXJmYWNlIFJlZ2lzdGVyZWRQYWdlIHtcclxuICAvKiogRnVsbHktcXVhbGlmaWVkIGlkOiBgPHR3ZWFrSWQ+OjxwYWdlSWQ+YC4gKi9cclxuICBpZDogc3RyaW5nO1xyXG4gIHR3ZWFrSWQ6IHN0cmluZztcclxuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcclxuICBwYWdlOiBTZXR0aW5nc1BhZ2U7XHJcbiAgLyoqIFBlci1wYWdlIERPTSB0ZWFyZG93biByZXR1cm5lZCBieSBgcGFnZS5yZW5kZXJgLCBpZiBhbnkuICovXHJcbiAgdGVhcmRvd24/OiAoKCkgPT4gdm9pZCkgfCBudWxsO1xyXG4gIC8qKiBUaGUgaW5qZWN0ZWQgc2lkZWJhciBidXR0b24gKHNvIHdlIGNhbiB1cGRhdGUgaXRzIGFjdGl2ZSBzdGF0ZSkuICovXHJcbiAgbmF2QnV0dG9uPzogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsO1xyXG59XHJcblxyXG4vKiogV2hhdCBwYWdlIGlzIGN1cnJlbnRseSBzZWxlY3RlZCBpbiBvdXIgaW5qZWN0ZWQgbmF2LiAqL1xyXG50eXBlIEFjdGl2ZVBhZ2UgPVxyXG4gIHwgeyBraW5kOiBcImNvbmZpZ1wiIH1cclxuICB8IHsga2luZDogXCJ0d2Vha3NcIiB9XHJcbiAgfCB7IGtpbmQ6IFwicmVnaXN0ZXJlZFwiOyBpZDogc3RyaW5nIH07XHJcblxyXG5pbnRlcmZhY2UgSW5qZWN0b3JTdGF0ZSB7XHJcbiAgc2VjdGlvbnM6IE1hcDxzdHJpbmcsIFNldHRpbmdzU2VjdGlvbj47XHJcbiAgcGFnZXM6IE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRQYWdlPjtcclxuICBsaXN0ZWRUd2Vha3M6IExpc3RlZFR3ZWFrW107XHJcbiAgLyoqIE91dGVyIHdyYXBwZXIgdGhhdCBob2xkcyBDb2RleCdzIGl0ZW1zIGdyb3VwICsgb3VyIGluamVjdGVkIGdyb3Vwcy4gKi9cclxuICBvdXRlcldyYXBwZXI6IEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICAvKiogT3VyIFwiQ29kZXggUGx1cyBQbHVzXCIgbmF2IGdyb3VwIChDb25maWcvVHdlYWtzKS4gKi9cclxuICBuYXZHcm91cDogSFRNTEVsZW1lbnQgfCBudWxsO1xyXG4gIG5hdkJ1dHRvbnM6IHsgY29uZmlnOiBIVE1MQnV0dG9uRWxlbWVudDsgdHdlYWtzOiBIVE1MQnV0dG9uRWxlbWVudCB9IHwgbnVsbDtcclxuICAvKiogT3VyIFwiVHdlYWtzXCIgbmF2IGdyb3VwIChwZXItdHdlYWsgcGFnZXMpLiBDcmVhdGVkIGxhemlseS4gKi9cclxuICBwYWdlc0dyb3VwOiBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgcGFnZXNHcm91cEtleTogc3RyaW5nIHwgbnVsbDtcclxuICBwYW5lbEhvc3Q6IEhUTUxFbGVtZW50IHwgbnVsbDtcclxuICBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciB8IG51bGw7XHJcbiAgZmluZ2VycHJpbnQ6IHN0cmluZyB8IG51bGw7XG4gIHNpZGViYXJEdW1wZWQ6IGJvb2xlYW47XG4gIGFjdGl2ZVBhZ2U6IEFjdGl2ZVBhZ2UgfCBudWxsO1xuICBzaWRlYmFyUm9vdDogSFRNTEVsZW1lbnQgfCBudWxsO1xuICBzaWRlYmFyUmVzdG9yZUhhbmRsZXI6ICgoZTogRXZlbnQpID0+IHZvaWQpIHwgbnVsbDtcbiAgdHdlYWtzU2VhcmNoOiBzdHJpbmc7XG4gIHR3ZWFrc0ZpbHRlcjogVHdlYWtTdGF0dXNGaWx0ZXI7XG4gIGZlZWRiYWNrOiBNYXA8c3RyaW5nLCB7IGtpbmQ6IEZlZWRiYWNrS2luZDsgbWVzc2FnZTogc3RyaW5nIH0+O1xuICBjb25maXJtZWRNYWluVHdlYWtzOiBTZXQ8c3RyaW5nPjtcbn1cblxyXG5jb25zdCBzdGF0ZTogSW5qZWN0b3JTdGF0ZSA9IHtcclxuICBzZWN0aW9uczogbmV3IE1hcCgpLFxyXG4gIHBhZ2VzOiBuZXcgTWFwKCksXHJcbiAgbGlzdGVkVHdlYWtzOiBbXSxcclxuICBvdXRlcldyYXBwZXI6IG51bGwsXHJcbiAgbmF2R3JvdXA6IG51bGwsXHJcbiAgbmF2QnV0dG9uczogbnVsbCxcclxuICBwYWdlc0dyb3VwOiBudWxsLFxyXG4gIHBhZ2VzR3JvdXBLZXk6IG51bGwsXHJcbiAgcGFuZWxIb3N0OiBudWxsLFxyXG4gIG9ic2VydmVyOiBudWxsLFxyXG4gIGZpbmdlcnByaW50OiBudWxsLFxyXG4gIHNpZGViYXJEdW1wZWQ6IGZhbHNlLFxyXG4gIGFjdGl2ZVBhZ2U6IG51bGwsXG4gIHNpZGViYXJSb290OiBudWxsLFxuICBzaWRlYmFyUmVzdG9yZUhhbmRsZXI6IG51bGwsXG4gIHR3ZWFrc1NlYXJjaDogXCJcIixcbiAgdHdlYWtzRmlsdGVyOiBcImFsbFwiLFxuICBmZWVkYmFjazogbmV3IE1hcCgpLFxuICBjb25maXJtZWRNYWluVHdlYWtzOiBuZXcgU2V0KCksXG59O1xuXHJcbmZ1bmN0aW9uIHBsb2cobXNnOiBzdHJpbmcsIGV4dHJhPzogdW5rbm93bik6IHZvaWQge1xyXG4gIGlwY1JlbmRlcmVyLnNlbmQoXHJcbiAgICBcImNvZGV4cHA6cHJlbG9hZC1sb2dcIixcclxuICAgIFwiaW5mb1wiLFxyXG4gICAgYFtzZXR0aW5ncy1pbmplY3Rvcl0gJHttc2d9JHtleHRyYSA9PT0gdW5kZWZpbmVkID8gXCJcIiA6IFwiIFwiICsgc2FmZVN0cmluZ2lmeShleHRyYSl9YCxcclxuICApO1xyXG59XHJcbmZ1bmN0aW9uIHNhZmVTdHJpbmdpZnkodjogdW5rbm93bik6IHN0cmluZyB7XHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBKU09OLnN0cmluZ2lmeSh2KTtcclxuICB9IGNhdGNoIHtcclxuICAgIHJldHVybiBTdHJpbmcodik7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgcHVibGljIEFQSSBcdTI1MDBcdTI1MDBcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzdGFydFNldHRpbmdzSW5qZWN0b3IoKTogdm9pZCB7XG4gIGlmIChzdGF0ZS5vYnNlcnZlcikgcmV0dXJuO1xyXG5cclxuICBjb25zdCBvYnMgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XHJcbiAgICB0cnlJbmplY3QoKTtcclxuICAgIG1heWJlRHVtcERvbSgpO1xyXG4gIH0pO1xyXG4gIG9icy5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XHJcbiAgc3RhdGUub2JzZXJ2ZXIgPSBvYnM7XHJcblxyXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicG9wc3RhdGVcIiwgb25OYXYpO1xyXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiaGFzaGNoYW5nZVwiLCBvbk5hdik7XHJcbiAgZm9yIChjb25zdCBtIG9mIFtcInB1c2hTdGF0ZVwiLCBcInJlcGxhY2VTdGF0ZVwiXSBhcyBjb25zdCkge1xyXG4gICAgY29uc3Qgb3JpZyA9IGhpc3RvcnlbbV07XHJcbiAgICBoaXN0b3J5W21dID0gZnVuY3Rpb24gKHRoaXM6IEhpc3RvcnksIC4uLmFyZ3M6IFBhcmFtZXRlcnM8dHlwZW9mIG9yaWc+KSB7XHJcbiAgICAgIGNvbnN0IHIgPSBvcmlnLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoYGNvZGV4cHAtJHttfWApKTtcclxuICAgICAgcmV0dXJuIHI7XHJcbiAgICB9IGFzIHR5cGVvZiBvcmlnO1xyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoYGNvZGV4cHAtJHttfWAsIG9uTmF2KTtcclxuICB9XHJcblxyXG4gIHRyeUluamVjdCgpO1xyXG4gIG1heWJlRHVtcERvbSgpO1xyXG4gIGxldCB0aWNrcyA9IDA7XHJcbiAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICB0aWNrcysrO1xyXG4gICAgdHJ5SW5qZWN0KCk7XHJcbiAgICBtYXliZUR1bXBEb20oKTtcclxuICAgIGlmICh0aWNrcyA+IDYwKSBjbGVhckludGVydmFsKGludGVydmFsKTtcclxuICB9LCA1MDApO1xyXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBfX3RyeUluamVjdEZvclRlc3RzKCk6IHZvaWQge1xuICB0cnlJbmplY3QoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIF9fcmVzZXRTZXR0aW5nc0luamVjdG9yRm9yVGVzdHMoKTogdm9pZCB7XG4gIHN0YXRlLm9ic2VydmVyPy5kaXNjb25uZWN0KCk7XG4gIHN0YXRlLm9ic2VydmVyID0gbnVsbDtcbiAgZm9yIChjb25zdCBwIG9mIHN0YXRlLnBhZ2VzLnZhbHVlcygpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHAudGVhcmRvd24/LigpO1xuICAgIH0gY2F0Y2gge31cbiAgfVxuICBzdGF0ZS5zZWN0aW9ucy5jbGVhcigpO1xuICBzdGF0ZS5wYWdlcy5jbGVhcigpO1xuICBzdGF0ZS5saXN0ZWRUd2Vha3MgPSBbXTtcbiAgc3RhdGUub3V0ZXJXcmFwcGVyID0gbnVsbDtcbiAgc3RhdGUubmF2R3JvdXAgPSBudWxsO1xuICBzdGF0ZS5uYXZCdXR0b25zID0gbnVsbDtcbiAgc3RhdGUucGFnZXNHcm91cCA9IG51bGw7XG4gIHN0YXRlLnBhZ2VzR3JvdXBLZXkgPSBudWxsO1xuICBzdGF0ZS5wYW5lbEhvc3QgPSBudWxsO1xuICBzdGF0ZS5maW5nZXJwcmludCA9IG51bGw7XG4gIHN0YXRlLnNpZGViYXJEdW1wZWQgPSBmYWxzZTtcbiAgc3RhdGUuYWN0aXZlUGFnZSA9IG51bGw7XG4gIHN0YXRlLnNpZGViYXJSb290ID0gbnVsbDtcbiAgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyID0gbnVsbDtcbiAgc3RhdGUudHdlYWtzU2VhcmNoID0gXCJcIjtcbiAgc3RhdGUudHdlYWtzRmlsdGVyID0gXCJhbGxcIjtcbiAgc3RhdGUuZmVlZGJhY2suY2xlYXIoKTtcbiAgc3RhdGUuY29uZmlybWVkTWFpblR3ZWFrcy5jbGVhcigpO1xufVxuXG5mdW5jdGlvbiBvbk5hdigpOiB2b2lkIHtcbiAgc3RhdGUuZmluZ2VycHJpbnQgPSBudWxsO1xyXG4gIHRyeUluamVjdCgpO1xyXG4gIG1heWJlRHVtcERvbSgpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJTZWN0aW9uKHNlY3Rpb246IFNldHRpbmdzU2VjdGlvbik6IFNldHRpbmdzSGFuZGxlIHtcclxuICBzdGF0ZS5zZWN0aW9ucy5zZXQoc2VjdGlvbi5pZCwgc2VjdGlvbik7XHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2U/LmtpbmQgPT09IFwidHdlYWtzXCIpIHJlcmVuZGVyKCk7XHJcbiAgcmV0dXJuIHtcclxuICAgIHVucmVnaXN0ZXI6ICgpID0+IHtcclxuICAgICAgc3RhdGUuc2VjdGlvbnMuZGVsZXRlKHNlY3Rpb24uaWQpO1xyXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVyZW5kZXIoKTtcclxuICAgIH0sXHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyU2VjdGlvbnMoKTogdm9pZCB7XHJcbiAgc3RhdGUuc2VjdGlvbnMuY2xlYXIoKTtcclxuICAvLyBEcm9wIHJlZ2lzdGVyZWQgcGFnZXMgdG9vIFx1MjAxNCB0aGV5J3JlIG93bmVkIGJ5IHR3ZWFrcyB0aGF0IGp1c3QgZ290XHJcbiAgLy8gdG9ybiBkb3duIGJ5IHRoZSBob3N0LiBSdW4gYW55IHRlYXJkb3ducyBiZWZvcmUgZm9yZ2V0dGluZyB0aGVtLlxyXG4gIGZvciAoY29uc3QgcCBvZiBzdGF0ZS5wYWdlcy52YWx1ZXMoKSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgcC50ZWFyZG93bj8uKCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgIHBsb2coXCJwYWdlIHRlYXJkb3duIGZhaWxlZFwiLCB7IGlkOiBwLmlkLCBlcnI6IFN0cmluZyhlKSB9KTtcclxuICAgIH1cclxuICB9XHJcbiAgc3RhdGUucGFnZXMuY2xlYXIoKTtcclxuICBzeW5jUGFnZXNHcm91cCgpO1xyXG4gIC8vIElmIHdlIHdlcmUgb24gYSByZWdpc3RlcmVkIHBhZ2UgdGhhdCBubyBsb25nZXIgZXhpc3RzLCBmYWxsIGJhY2sgdG9cclxuICAvLyByZXN0b3JpbmcgQ29kZXgncyB2aWV3LlxyXG4gIGlmIChcclxuICAgIHN0YXRlLmFjdGl2ZVBhZ2U/LmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiICYmXHJcbiAgICAhc3RhdGUucGFnZXMuaGFzKHN0YXRlLmFjdGl2ZVBhZ2UuaWQpXHJcbiAgKSB7XHJcbiAgICByZXN0b3JlQ29kZXhWaWV3KCk7XHJcbiAgfSBlbHNlIGlmIChzdGF0ZS5hY3RpdmVQYWdlPy5raW5kID09PSBcInR3ZWFrc1wiKSB7XHJcbiAgICByZXJlbmRlcigpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlZ2lzdGVyIGEgdHdlYWstb3duZWQgc2V0dGluZ3MgcGFnZS4gVGhlIHJ1bnRpbWUgaW5qZWN0cyBhIHNpZGViYXIgZW50cnlcclxuICogdW5kZXIgYSBcIlRXRUFLU1wiIGdyb3VwIGhlYWRlciAod2hpY2ggYXBwZWFycyBvbmx5IHdoZW4gYXQgbGVhc3Qgb25lIHBhZ2VcclxuICogaXMgcmVnaXN0ZXJlZCkgYW5kIHJvdXRlcyBjbGlja3MgdG8gdGhlIHBhZ2UncyBgcmVuZGVyKHJvb3QpYC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclBhZ2UoXHJcbiAgdHdlYWtJZDogc3RyaW5nLFxyXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0LFxyXG4gIHBhZ2U6IFNldHRpbmdzUGFnZSxcclxuKTogU2V0dGluZ3NIYW5kbGUge1xyXG4gIGNvbnN0IGlkID0gcGFnZS5pZDsgLy8gYWxyZWFkeSBuYW1lc3BhY2VkIGJ5IHR3ZWFrLWhvc3QgYXMgYCR7dHdlYWtJZH06JHtwYWdlLmlkfWBcclxuICBjb25zdCBlbnRyeTogUmVnaXN0ZXJlZFBhZ2UgPSB7IGlkLCB0d2Vha0lkLCBtYW5pZmVzdCwgcGFnZSB9O1xyXG4gIHN0YXRlLnBhZ2VzLnNldChpZCwgZW50cnkpO1xyXG4gIHBsb2coXCJyZWdpc3RlclBhZ2VcIiwgeyBpZCwgdGl0bGU6IHBhZ2UudGl0bGUsIHR3ZWFrSWQgfSk7XHJcbiAgc3luY1BhZ2VzR3JvdXAoKTtcclxuICAvLyBJZiB0aGUgdXNlciB3YXMgYWxyZWFkeSBvbiB0aGlzIHBhZ2UgKGhvdCByZWxvYWQpLCByZS1tb3VudCBpdHMgYm9keS5cclxuICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcclxuICAgIHJlcmVuZGVyKCk7XHJcbiAgfVxyXG4gIHJldHVybiB7XHJcbiAgICB1bnJlZ2lzdGVyOiAoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGUgPSBzdGF0ZS5wYWdlcy5nZXQoaWQpO1xyXG4gICAgICBpZiAoIWUpIHJldHVybjtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBlLnRlYXJkb3duPy4oKTtcclxuICAgICAgfSBjYXRjaCB7fVxyXG4gICAgICBzdGF0ZS5wYWdlcy5kZWxldGUoaWQpO1xyXG4gICAgICBzeW5jUGFnZXNHcm91cCgpO1xyXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUGFnZT8ua2luZCA9PT0gXCJyZWdpc3RlcmVkXCIgJiYgc3RhdGUuYWN0aXZlUGFnZS5pZCA9PT0gaWQpIHtcclxuICAgICAgICByZXN0b3JlQ29kZXhWaWV3KCk7XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgfTtcclxufVxyXG5cclxuLyoqIENhbGxlZCBieSB0aGUgdHdlYWsgaG9zdCBhZnRlciBmZXRjaGluZyB0aGUgdHdlYWsgbGlzdCBmcm9tIG1haW4uICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRMaXN0ZWRUd2Vha3MobGlzdDogTGlzdGVkVHdlYWtbXSk6IHZvaWQge1xyXG4gIHN0YXRlLmxpc3RlZFR3ZWFrcyA9IGxpc3Q7XHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2U/LmtpbmQgPT09IFwidHdlYWtzXCIpIHJlcmVuZGVyKCk7XHJcbn1cclxuXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBpbmplY3Rpb24gXHUyNTAwXHUyNTAwXHJcblxyXG5mdW5jdGlvbiB0cnlJbmplY3QoKTogdm9pZCB7XHJcbiAgY29uc3QgaXRlbXNHcm91cCA9IGZpbmRTaWRlYmFySXRlbXNHcm91cCgpO1xyXG4gIGlmICghaXRlbXNHcm91cCkge1xyXG4gICAgcGxvZyhcInNpZGViYXIgbm90IGZvdW5kXCIpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICAvLyBDb2RleCdzIGl0ZW1zIGdyb3VwIGxpdmVzIGluc2lkZSBhbiBvdXRlciB3cmFwcGVyIHRoYXQncyBhbHJlYWR5IHN0eWxlZFxyXG4gIC8vIHRvIGhvbGQgbXVsdGlwbGUgZ3JvdXBzIChgZmxleCBmbGV4LWNvbCBnYXAtMSBnYXAtMGApLiBXZSBpbmplY3Qgb3VyXHJcbiAgLy8gZ3JvdXAgYXMgYSBzaWJsaW5nIHNvIHRoZSBuYXR1cmFsIGdhcC0xIGFjdHMgYXMgb3VyIHZpc3VhbCBzZXBhcmF0b3IuXHJcbiAgY29uc3Qgb3V0ZXIgPSBpdGVtc0dyb3VwLnBhcmVudEVsZW1lbnQgPz8gaXRlbXNHcm91cDtcclxuICBzdGF0ZS5zaWRlYmFyUm9vdCA9IG91dGVyO1xyXG5cclxuICBpZiAoc3RhdGUubmF2R3JvdXAgJiYgb3V0ZXIuY29udGFpbnMoc3RhdGUubmF2R3JvdXApKSB7XHJcbiAgICBzeW5jUGFnZXNHcm91cCgpO1xyXG4gICAgLy8gQ29kZXggcmUtcmVuZGVycyBpdHMgbmF0aXZlIHNpZGViYXIgYnV0dG9ucyBvbiBpdHMgb3duIHN0YXRlIGNoYW5nZXMuXHJcbiAgICAvLyBJZiBvbmUgb2Ygb3VyIHBhZ2VzIGlzIGFjdGl2ZSwgcmUtc3RyaXAgQ29kZXgncyBhY3RpdmUgc3R5bGluZyBzb1xyXG4gICAgLy8gR2VuZXJhbCBkb2Vzbid0IHJlYXBwZWFyIGFzIHNlbGVjdGVkLlxyXG4gICAgaWYgKHN0YXRlLmFjdGl2ZVBhZ2UgIT09IG51bGwpIHN5bmNDb2RleE5hdGl2ZU5hdkFjdGl2ZSh0cnVlKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIC8vIFNpZGViYXIgd2FzIGVpdGhlciBmcmVzaGx5IG1vdW50ZWQgKFNldHRpbmdzIGp1c3Qgb3BlbmVkKSBvciByZS1tb3VudGVkXHJcbiAgLy8gKGNsb3NlZCBhbmQgcmUtb3BlbmVkLCBvciBuYXZpZ2F0ZWQgYXdheSBhbmQgYmFjaykuIEluIGFsbCBvZiB0aG9zZVxyXG4gIC8vIGNhc2VzIENvZGV4IHJlc2V0cyB0byBpdHMgZGVmYXVsdCBwYWdlIChHZW5lcmFsKSwgYnV0IG91ciBpbi1tZW1vcnlcclxuICAvLyBgYWN0aXZlUGFnZWAgbWF5IHN0aWxsIHJlZmVyZW5jZSB0aGUgbGFzdCB0d2Vhay9wYWdlIHRoZSB1c2VyIGhhZCBvcGVuXHJcbiAgLy8gXHUyMDE0IHdoaWNoIHdvdWxkIGNhdXNlIHRoYXQgbmF2IGJ1dHRvbiB0byByZW5kZXIgd2l0aCB0aGUgYWN0aXZlIHN0eWxpbmdcclxuICAvLyBldmVuIHRob3VnaCBDb2RleCBpcyBzaG93aW5nIEdlbmVyYWwuIENsZWFyIGl0IHNvIGBzeW5jUGFnZXNHcm91cGAgL1xyXG4gIC8vIGBzZXROYXZBY3RpdmVgIHN0YXJ0IGZyb20gYSBuZXV0cmFsIHN0YXRlLiBUaGUgcGFuZWxIb3N0IHJlZmVyZW5jZSBpc1xyXG4gIC8vIGFsc28gc3RhbGUgKGl0cyBET00gd2FzIGRpc2NhcmRlZCB3aXRoIHRoZSBwcmV2aW91cyBjb250ZW50IGFyZWEpLlxyXG4gIGlmIChzdGF0ZS5hY3RpdmVQYWdlICE9PSBudWxsIHx8IHN0YXRlLnBhbmVsSG9zdCAhPT0gbnVsbCkge1xyXG4gICAgcGxvZyhcInNpZGViYXIgcmUtbW91bnQgZGV0ZWN0ZWQ7IGNsZWFyaW5nIHN0YWxlIGFjdGl2ZSBzdGF0ZVwiLCB7XHJcbiAgICAgIHByZXZBY3RpdmU6IHN0YXRlLmFjdGl2ZVBhZ2UsXHJcbiAgICB9KTtcclxuICAgIHN0YXRlLmFjdGl2ZVBhZ2UgPSBudWxsO1xyXG4gICAgc3RhdGUucGFuZWxIb3N0ID0gbnVsbDtcclxuICB9XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBHcm91cCBjb250YWluZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgY29uc3QgZ3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGdyb3VwLmRhdGFzZXQuY29kZXhwcCA9IFwibmF2LWdyb3VwXCI7XHJcbiAgZ3JvdXAuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC1weFwiO1xyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgU2VjdGlvbiBoZWFkZXIgLyBzdWJ0aXRsZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICAvLyBDb2RleCBkb2Vzbid0IChjdXJyZW50bHkpIHNoaXAgYSBzaWRlYmFyIGdyb3VwIGhlYWRlciwgc28gd2UgbWlycm9yIHRoZVxyXG4gIC8vIHZpc3VhbCB3ZWlnaHQgb2YgYHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZGAgdXBwZXJjYXNlIGxhYmVsc1xyXG4gIC8vIHVzZWQgZWxzZXdoZXJlIGluIHRoZWlyIFVJLiBQYWRkaW5nIG1hdGNoZXMgdGhlIGBweC1yb3cteGAgb2YgaXRlbXMuXHJcbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoZWFkZXIuY2xhc3NOYW1lID1cclxuICAgIFwicHgtcm93LXggcHQtMiBwYi0xIHRleHQtWzExcHhdIGZvbnQtbWVkaXVtIHVwcGVyY2FzZSB0cmFja2luZy13aWRlciB0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmQgc2VsZWN0LW5vbmVcIjtcclxuICBoZWFkZXIudGV4dENvbnRlbnQgPSBcIkNvZGV4IFBsdXMgUGx1c1wiO1xyXG4gIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcblxyXG4gIC8vIFx1MjUwMFx1MjUwMCBUd28gc2lkZWJhciBpdGVtcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcclxuICBjb25zdCBjb25maWdCdG4gPSBtYWtlU2lkZWJhckl0ZW0oXCJDb25maWdcIiwgY29uZmlnSWNvblN2ZygpKTtcclxuICBjb25zdCB0d2Vha3NCdG4gPSBtYWtlU2lkZWJhckl0ZW0oXCJUd2Vha3NcIiwgdHdlYWtzSWNvblN2ZygpKTtcclxuXHJcbiAgY29uZmlnQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwiY29uZmlnXCIgfSk7XHJcbiAgfSk7XHJcbiAgdHdlYWtzQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwidHdlYWtzXCIgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGdyb3VwLmFwcGVuZENoaWxkKGNvbmZpZ0J0bik7XHJcbiAgZ3JvdXAuYXBwZW5kQ2hpbGQodHdlYWtzQnRuKTtcclxuICBvdXRlci5hcHBlbmRDaGlsZChncm91cCk7XHJcblxyXG4gIHN0YXRlLm5hdkdyb3VwID0gZ3JvdXA7XHJcbiAgc3RhdGUubmF2QnV0dG9ucyA9IHsgY29uZmlnOiBjb25maWdCdG4sIHR3ZWFrczogdHdlYWtzQnRuIH07XHJcbiAgcGxvZyhcIm5hdiBncm91cCBpbmplY3RlZFwiLCB7IG91dGVyVGFnOiBvdXRlci50YWdOYW1lIH0pO1xyXG4gIHN5bmNQYWdlc0dyb3VwKCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgKG9yIHJlLXJlbmRlcikgdGhlIHNlY29uZCBzaWRlYmFyIGdyb3VwIG9mIHBlci10d2VhayBwYWdlcy4gVGhlXHJcbiAqIGdyb3VwIGlzIGNyZWF0ZWQgbGF6aWx5IGFuZCByZW1vdmVkIHdoZW4gdGhlIGxhc3QgcGFnZSB1bnJlZ2lzdGVycywgc29cclxuICogdXNlcnMgd2l0aCBubyBwYWdlLXJlZ2lzdGVyaW5nIHR3ZWFrcyBuZXZlciBzZWUgYW4gZW1wdHkgXCJUd2Vha3NcIiBoZWFkZXIuXHJcbiAqL1xyXG5mdW5jdGlvbiBzeW5jUGFnZXNHcm91cCgpOiB2b2lkIHtcclxuICBjb25zdCBvdXRlciA9IHN0YXRlLnNpZGViYXJSb290O1xyXG4gIGlmICghb3V0ZXIpIHJldHVybjtcclxuICBjb25zdCBwYWdlcyA9IFsuLi5zdGF0ZS5wYWdlcy52YWx1ZXMoKV07XHJcblxyXG4gIC8vIEJ1aWxkIGEgZGV0ZXJtaW5pc3RpYyBmaW5nZXJwcmludCBvZiB0aGUgZGVzaXJlZCBncm91cCBzdGF0ZS4gSWYgdGhlXHJcbiAgLy8gY3VycmVudCBET00gZ3JvdXAgYWxyZWFkeSBtYXRjaGVzLCB0aGlzIGlzIGEgbm8tb3AgXHUyMDE0IGNyaXRpY2FsLCBiZWNhdXNlXHJcbiAgLy8gc3luY1BhZ2VzR3JvdXAgaXMgY2FsbGVkIG9uIGV2ZXJ5IE11dGF0aW9uT2JzZXJ2ZXIgdGljayBhbmQgYW55IERPTVxyXG4gIC8vIHdyaXRlIHdvdWxkIHJlLXRyaWdnZXIgdGhhdCBvYnNlcnZlciAoaW5maW5pdGUgbG9vcCwgYXBwIGZyZWV6ZSkuXHJcbiAgY29uc3QgZGVzaXJlZEtleSA9IHBhZ2VzLmxlbmd0aCA9PT0gMFxyXG4gICAgPyBcIkVNUFRZXCJcclxuICAgIDogcGFnZXMubWFwKChwKSA9PiBgJHtwLmlkfXwke3AucGFnZS50aXRsZX18JHtwLnBhZ2UuaWNvblN2ZyA/PyBcIlwifWApLmpvaW4oXCJcXG5cIik7XHJcbiAgY29uc3QgZ3JvdXBBdHRhY2hlZCA9ICEhc3RhdGUucGFnZXNHcm91cCAmJiBvdXRlci5jb250YWlucyhzdGF0ZS5wYWdlc0dyb3VwKTtcclxuICBpZiAoc3RhdGUucGFnZXNHcm91cEtleSA9PT0gZGVzaXJlZEtleSAmJiAocGFnZXMubGVuZ3RoID09PSAwID8gIWdyb3VwQXR0YWNoZWQgOiBncm91cEF0dGFjaGVkKSkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgaWYgKHBhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgaWYgKHN0YXRlLnBhZ2VzR3JvdXApIHtcclxuICAgICAgc3RhdGUucGFnZXNHcm91cC5yZW1vdmUoKTtcclxuICAgICAgc3RhdGUucGFnZXNHcm91cCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHAubmF2QnV0dG9uID0gbnVsbDtcclxuICAgIHN0YXRlLnBhZ2VzR3JvdXBLZXkgPSBkZXNpcmVkS2V5O1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgbGV0IGdyb3VwID0gc3RhdGUucGFnZXNHcm91cDtcclxuICBpZiAoIWdyb3VwIHx8ICFvdXRlci5jb250YWlucyhncm91cCkpIHtcclxuICAgIGdyb3VwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGdyb3VwLmRhdGFzZXQuY29kZXhwcCA9IFwicGFnZXMtZ3JvdXBcIjtcclxuICAgIGdyb3VwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtcHhcIjtcclxuICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBoZWFkZXIuY2xhc3NOYW1lID1cclxuICAgICAgXCJweC1yb3cteCBwdC0yIHBiLTEgdGV4dC1bMTFweF0gZm9udC1tZWRpdW0gdXBwZXJjYXNlIHRyYWNraW5nLXdpZGVyIHRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZCBzZWxlY3Qtbm9uZVwiO1xyXG4gICAgaGVhZGVyLnRleHRDb250ZW50ID0gXCJUd2Vha3NcIjtcclxuICAgIGdyb3VwLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcbiAgICBvdXRlci5hcHBlbmRDaGlsZChncm91cCk7XHJcbiAgICBzdGF0ZS5wYWdlc0dyb3VwID0gZ3JvdXA7XHJcbiAgfSBlbHNlIHtcclxuICAgIC8vIFN0cmlwIHByaW9yIGJ1dHRvbnMgKGtlZXAgdGhlIGhlYWRlciBhdCBpbmRleCAwKS5cclxuICAgIHdoaWxlIChncm91cC5jaGlsZHJlbi5sZW5ndGggPiAxKSBncm91cC5yZW1vdmVDaGlsZChncm91cC5sYXN0Q2hpbGQhKTtcclxuICB9XHJcblxyXG4gIGZvciAoY29uc3QgcCBvZiBwYWdlcykge1xyXG4gICAgY29uc3QgaWNvbiA9IHAucGFnZS5pY29uU3ZnID8/IGRlZmF1bHRQYWdlSWNvblN2ZygpO1xyXG4gICAgY29uc3QgYnRuID0gbWFrZVNpZGViYXJJdGVtKHAucGFnZS50aXRsZSwgaWNvbik7XHJcbiAgICBidG4uZGF0YXNldC5jb2RleHBwID0gYG5hdi1wYWdlLSR7cC5pZH1gO1xyXG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgIGFjdGl2YXRlUGFnZSh7IGtpbmQ6IFwicmVnaXN0ZXJlZFwiLCBpZDogcC5pZCB9KTtcclxuICAgIH0pO1xyXG4gICAgcC5uYXZCdXR0b24gPSBidG47XHJcbiAgICBncm91cC5hcHBlbmRDaGlsZChidG4pO1xyXG4gIH1cclxuICBzdGF0ZS5wYWdlc0dyb3VwS2V5ID0gZGVzaXJlZEtleTtcclxuICBwbG9nKFwicGFnZXMgZ3JvdXAgc3luY2VkXCIsIHtcclxuICAgIGNvdW50OiBwYWdlcy5sZW5ndGgsXHJcbiAgICBpZHM6IHBhZ2VzLm1hcCgocCkgPT4gcC5pZCksXHJcbiAgfSk7XHJcbiAgLy8gUmVmbGVjdCBjdXJyZW50IGFjdGl2ZSBzdGF0ZSBhY3Jvc3MgdGhlIHJlYnVpbHQgYnV0dG9ucy5cclxuICBzZXROYXZBY3RpdmUoc3RhdGUuYWN0aXZlUGFnZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG1ha2VTaWRlYmFySXRlbShsYWJlbDogc3RyaW5nLCBpY29uU3ZnOiBzdHJpbmcpOiBIVE1MQnV0dG9uRWxlbWVudCB7XHJcbiAgLy8gQ2xhc3Mgc3RyaW5nIGNvcGllZCB2ZXJiYXRpbSBmcm9tIENvZGV4J3Mgc2lkZWJhciBidXR0b25zIChHZW5lcmFsIGV0YykuXHJcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgYnRuLmRhdGFzZXQuY29kZXhwcCA9IGBuYXYtJHtsYWJlbC50b0xvd2VyQ2FzZSgpfWA7XHJcbiAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbGFiZWwpO1xyXG4gIGJ0bi5jbGFzc05hbWUgPVxyXG4gICAgXCJmb2N1cy12aXNpYmxlOm91dGxpbmUtdG9rZW4tYm9yZGVyIHJlbGF0aXZlIHB4LXJvdy14IHB5LXJvdy15IGN1cnNvci1pbnRlcmFjdGlvbiBzaHJpbmstMCBpdGVtcy1jZW50ZXIgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbGcgdGV4dC1sZWZ0IHRleHQtc20gZm9jdXMtdmlzaWJsZTpvdXRsaW5lIGZvY3VzLXZpc2libGU6b3V0bGluZS0yIGZvY3VzLXZpc2libGU6b3V0bGluZS1vZmZzZXQtMiBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS01MCBnYXAtMiBmbGV4IHctZnVsbCBob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmQgZm9udC1ub3JtYWxcIjtcclxuXHJcbiAgY29uc3QgaW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGlubmVyLmNsYXNzTmFtZSA9XHJcbiAgICBcImZsZXggbWluLXctMCBpdGVtcy1jZW50ZXIgdGV4dC1iYXNlIGdhcC0yIGZsZXgtMSB0ZXh0LXRva2VuLWZvcmVncm91bmRcIjtcclxuICBpbm5lci5pbm5lckhUTUwgPSBgJHtpY29uU3ZnfTxzcGFuIGNsYXNzPVwidHJ1bmNhdGVcIj4ke2xhYmVsfTwvc3Bhbj5gO1xyXG4gIGJ0bi5hcHBlbmRDaGlsZChpbm5lcik7XHJcbiAgcmV0dXJuIGJ0bjtcclxufVxyXG5cclxuLyoqIEludGVybmFsIGtleSBmb3IgdGhlIGJ1aWx0LWluIG5hdiBidXR0b25zLiAqL1xyXG50eXBlIEJ1aWx0aW5QYWdlID0gXCJjb25maWdcIiB8IFwidHdlYWtzXCI7XHJcblxyXG5mdW5jdGlvbiBzZXROYXZBY3RpdmUoYWN0aXZlOiBBY3RpdmVQYWdlIHwgbnVsbCk6IHZvaWQge1xyXG4gIC8vIEJ1aWx0LWluIChDb25maWcvVHdlYWtzKSBidXR0b25zLlxyXG4gIGlmIChzdGF0ZS5uYXZCdXR0b25zKSB7XHJcbiAgICBjb25zdCBidWlsdGluOiBCdWlsdGluUGFnZSB8IG51bGwgPVxyXG4gICAgICBhY3RpdmU/LmtpbmQgPT09IFwiY29uZmlnXCIgPyBcImNvbmZpZ1wiIDpcclxuICAgICAgYWN0aXZlPy5raW5kID09PSBcInR3ZWFrc1wiID8gXCJ0d2Vha3NcIiA6IG51bGw7XHJcbiAgICBmb3IgKGNvbnN0IFtrZXksIGJ0bl0gb2YgT2JqZWN0LmVudHJpZXMoc3RhdGUubmF2QnV0dG9ucykgYXMgW0J1aWx0aW5QYWdlLCBIVE1MQnV0dG9uRWxlbWVudF1bXSkge1xyXG4gICAgICBhcHBseU5hdkFjdGl2ZShidG4sIGtleSA9PT0gYnVpbHRpbik7XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vIFBlci1wYWdlIHJlZ2lzdGVyZWQgYnV0dG9ucy5cclxuICBmb3IgKGNvbnN0IHAgb2Ygc3RhdGUucGFnZXMudmFsdWVzKCkpIHtcclxuICAgIGlmICghcC5uYXZCdXR0b24pIGNvbnRpbnVlO1xyXG4gICAgY29uc3QgaXNBY3RpdmUgPSBhY3RpdmU/LmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiICYmIGFjdGl2ZS5pZCA9PT0gcC5pZDtcclxuICAgIGFwcGx5TmF2QWN0aXZlKHAubmF2QnV0dG9uLCBpc0FjdGl2ZSk7XHJcbiAgfVxyXG4gIC8vIENvZGV4J3Mgb3duIHNpZGViYXIgYnV0dG9ucyAoR2VuZXJhbCwgQXBwZWFyYW5jZSwgZXRjKS4gV2hlbiBvbmUgb2ZcclxuICAvLyBvdXIgcGFnZXMgaXMgYWN0aXZlLCBDb2RleCBzdGlsbCBoYXMgYXJpYS1jdXJyZW50PVwicGFnZVwiIGFuZCB0aGVcclxuICAvLyBhY3RpdmUtYmcgY2xhc3Mgb24gd2hpY2hldmVyIGl0ZW0gaXQgY29uc2lkZXJlZCB0aGUgcm91dGUgXHUyMDE0IHR5cGljYWxseVxyXG4gIC8vIEdlbmVyYWwuIFRoYXQgbWFrZXMgYm90aCBidXR0b25zIGxvb2sgc2VsZWN0ZWQuIFN0cmlwIENvZGV4J3MgYWN0aXZlXHJcbiAgLy8gc3R5bGluZyB3aGlsZSBvbmUgb2Ygb3VycyBpcyBhY3RpdmU7IHJlc3RvcmUgaXQgd2hlbiBub25lIGlzLlxyXG4gIHN5bmNDb2RleE5hdGl2ZU5hdkFjdGl2ZShhY3RpdmUgIT09IG51bGwpO1xyXG59XHJcblxyXG4vKipcclxuICogTXV0ZSBDb2RleCdzIG93biBhY3RpdmUtc3RhdGUgc3R5bGluZyBvbiBpdHMgc2lkZWJhciBidXR0b25zLiBXZSBkb24ndFxyXG4gKiB0b3VjaCBDb2RleCdzIFJlYWN0IHN0YXRlIFx1MjAxNCB3aGVuIHRoZSB1c2VyIGNsaWNrcyBhIG5hdGl2ZSBpdGVtLCBDb2RleFxyXG4gKiByZS1yZW5kZXJzIHRoZSBidXR0b25zIGFuZCByZS1hcHBsaWVzIGl0cyBvd24gY29ycmVjdCBzdGF0ZSwgdGhlbiBvdXJcclxuICogc2lkZWJhci1jbGljayBsaXN0ZW5lciBmaXJlcyBgcmVzdG9yZUNvZGV4Vmlld2AgKHdoaWNoIGNhbGxzIGJhY2sgaW50b1xyXG4gKiBgc2V0TmF2QWN0aXZlKG51bGwpYCBhbmQgbGV0cyBDb2RleCdzIHN0eWxpbmcgc3RhbmQpLlxyXG4gKlxyXG4gKiBgbXV0ZT10cnVlYCAgXHUyMTkyIHN0cmlwIGFyaWEtY3VycmVudCBhbmQgc3dhcCBhY3RpdmUgYmcgXHUyMTkyIGhvdmVyIGJnXHJcbiAqIGBtdXRlPWZhbHNlYCBcdTIxOTIgbm8tb3AgKENvZGV4J3Mgb3duIHJlLXJlbmRlciBhbHJlYWR5IHJlc3RvcmVkIHRoaW5ncylcclxuICovXHJcbmZ1bmN0aW9uIHN5bmNDb2RleE5hdGl2ZU5hdkFjdGl2ZShtdXRlOiBib29sZWFuKTogdm9pZCB7XHJcbiAgaWYgKCFtdXRlKSByZXR1cm47XHJcbiAgY29uc3Qgcm9vdCA9IHN0YXRlLnNpZGViYXJSb290O1xyXG4gIGlmICghcm9vdCkgcmV0dXJuO1xyXG4gIGNvbnN0IGJ1dHRvbnMgPSBBcnJheS5mcm9tKHJvb3QucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oXCJidXR0b25cIikpO1xyXG4gIGZvciAoY29uc3QgYnRuIG9mIGJ1dHRvbnMpIHtcclxuICAgIC8vIFNraXAgb3VyIG93biBidXR0b25zLlxyXG4gICAgaWYgKGJ0bi5kYXRhc2V0LmNvZGV4cHApIGNvbnRpbnVlO1xyXG4gICAgaWYgKGJ0bi5nZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIikgPT09IFwicGFnZVwiKSB7XHJcbiAgICAgIGJ0bi5yZW1vdmVBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIik7XHJcbiAgICB9XHJcbiAgICBpZiAoYnRuLmNsYXNzTGlzdC5jb250YWlucyhcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKSkge1xyXG4gICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZShcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKTtcclxuICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoXCJob3ZlcjpiZy10b2tlbi1saXN0LWhvdmVyLWJhY2tncm91bmRcIik7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBhcHBseU5hdkFjdGl2ZShidG46IEhUTUxCdXR0b25FbGVtZW50LCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcclxuICBjb25zdCBpbm5lciA9IGJ0bi5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgaWYgKGFjdGl2ZSkge1xyXG4gICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZShcImhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiLCBcImZvbnQtbm9ybWFsXCIpO1xyXG4gICAgICBidG4uY2xhc3NMaXN0LmFkZChcImJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZFwiKTtcclxuICAgICAgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtY3VycmVudFwiLCBcInBhZ2VcIik7XHJcbiAgICAgIGlmIChpbm5lcikge1xyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWZvcmVncm91bmRcIik7XHJcbiAgICAgICAgaW5uZXIuY2xhc3NMaXN0LmFkZChcInRleHQtdG9rZW4tbGlzdC1hY3RpdmUtc2VsZWN0aW9uLWZvcmVncm91bmRcIik7XHJcbiAgICAgICAgaW5uZXJcclxuICAgICAgICAgIC5xdWVyeVNlbGVjdG9yKFwic3ZnXCIpXHJcbiAgICAgICAgICA/LmNsYXNzTGlzdC5hZGQoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1pY29uLWZvcmVncm91bmRcIik7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwiaG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIsIFwiZm9udC1ub3JtYWxcIik7XHJcbiAgICAgIGJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiYmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICBidG4ucmVtb3ZlQXR0cmlidXRlKFwiYXJpYS1jdXJyZW50XCIpO1xyXG4gICAgICBpZiAoaW5uZXIpIHtcclxuICAgICAgICBpbm5lci5jbGFzc0xpc3QuYWRkKFwidGV4dC10b2tlbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlubmVyLmNsYXNzTGlzdC5yZW1vdmUoXCJ0ZXh0LXRva2VuLWxpc3QtYWN0aXZlLXNlbGVjdGlvbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlubmVyXHJcbiAgICAgICAgICAucXVlcnlTZWxlY3RvcihcInN2Z1wiKVxyXG4gICAgICAgICAgPy5jbGFzc0xpc3QucmVtb3ZlKFwidGV4dC10b2tlbi1saXN0LWFjdGl2ZS1zZWxlY3Rpb24taWNvbi1mb3JlZ3JvdW5kXCIpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBhY3RpdmF0aW9uIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gYWN0aXZhdGVQYWdlKHBhZ2U6IEFjdGl2ZVBhZ2UpOiB2b2lkIHtcclxuICBjb25zdCBjb250ZW50ID0gZmluZENvbnRlbnRBcmVhKCk7XHJcbiAgaWYgKCFjb250ZW50KSB7XHJcbiAgICBwbG9nKFwiYWN0aXZhdGU6IGNvbnRlbnQgYXJlYSBub3QgZm91bmRcIik7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIHN0YXRlLmFjdGl2ZVBhZ2UgPSBwYWdlO1xyXG4gIHBsb2coXCJhY3RpdmF0ZVwiLCB7IHBhZ2UgfSk7XHJcblxyXG4gIC8vIEhpZGUgQ29kZXgncyBjb250ZW50IGNoaWxkcmVuLCBzaG93IG91cnMuXHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcclxuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xyXG4gICAgaWYgKGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGNoaWxkLmRhdGFzZXQuY29kZXhwcEhpZGRlbiA9IGNoaWxkLnN0eWxlLmRpc3BsYXkgfHwgXCJcIjtcclxuICAgIH1cclxuICAgIGNoaWxkLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICB9XHJcbiAgbGV0IHBhbmVsID0gY29udGVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtY29kZXhwcD1cInR3ZWFrcy1wYW5lbFwiXScpO1xyXG4gIGlmICghcGFuZWwpIHtcclxuICAgIHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHBhbmVsLmRhdGFzZXQuY29kZXhwcCA9IFwidHdlYWtzLXBhbmVsXCI7XHJcbiAgICBwYW5lbC5zdHlsZS5jc3NUZXh0ID0gXCJ3aWR0aDoxMDAlO2hlaWdodDoxMDAlO292ZXJmbG93OmF1dG87XCI7XHJcbiAgICBjb250ZW50LmFwcGVuZENoaWxkKHBhbmVsKTtcclxuICB9XHJcbiAgcGFuZWwuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcclxuICBzdGF0ZS5wYW5lbEhvc3QgPSBwYW5lbDtcclxuICByZXJlbmRlcigpO1xyXG4gIHNldE5hdkFjdGl2ZShwYWdlKTtcclxuICAvLyByZXN0b3JlIENvZGV4J3Mgdmlldy4gUmUtcmVnaXN0ZXIgaWYgbmVlZGVkLlxyXG4gIGNvbnN0IHNpZGViYXIgPSBzdGF0ZS5zaWRlYmFyUm9vdDtcclxuICBpZiAoc2lkZWJhcikge1xyXG4gICAgaWYgKHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlcikge1xyXG4gICAgICBzaWRlYmFyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsIHRydWUpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgaGFuZGxlciA9IChlOiBFdmVudCkgPT4ge1xyXG4gICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XHJcbiAgICAgIGlmICghdGFyZ2V0KSByZXR1cm47XHJcbiAgICAgIGlmIChzdGF0ZS5uYXZHcm91cD8uY29udGFpbnModGFyZ2V0KSkgcmV0dXJuOyAvLyBvdXIgYnV0dG9uc1xyXG4gICAgICBpZiAoc3RhdGUucGFnZXNHcm91cD8uY29udGFpbnModGFyZ2V0KSkgcmV0dXJuOyAvLyBvdXIgcGFnZSBidXR0b25zXHJcbiAgICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcclxuICAgIH07XHJcbiAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIgPSBoYW5kbGVyO1xyXG4gICAgc2lkZWJhci5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlciwgdHJ1ZSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZXN0b3JlQ29kZXhWaWV3KCk6IHZvaWQge1xyXG4gIHBsb2coXCJyZXN0b3JlIGNvZGV4IHZpZXdcIik7XHJcbiAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xyXG4gIGlmICghY29udGVudCkgcmV0dXJuO1xyXG4gIGlmIChzdGF0ZS5wYW5lbEhvc3QpIHN0YXRlLnBhbmVsSG9zdC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKGNvbnRlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcclxuICAgIGlmIChjaGlsZCA9PT0gc3RhdGUucGFuZWxIb3N0KSBjb250aW51ZTtcclxuICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHBIaWRkZW4gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBjaGlsZC5zdHlsZS5kaXNwbGF5ID0gY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuO1xyXG4gICAgICBkZWxldGUgY2hpbGQuZGF0YXNldC5jb2RleHBwSGlkZGVuO1xyXG4gICAgfVxyXG4gIH1cclxuICBzdGF0ZS5hY3RpdmVQYWdlID0gbnVsbDtcclxuICBzZXROYXZBY3RpdmUobnVsbCk7XHJcbiAgaWYgKHN0YXRlLnNpZGViYXJSb290ICYmIHN0YXRlLnNpZGViYXJSZXN0b3JlSGFuZGxlcikge1xyXG4gICAgc3RhdGUuc2lkZWJhclJvb3QucmVtb3ZlRXZlbnRMaXN0ZW5lcihcclxuICAgICAgXCJjbGlja1wiLFxyXG4gICAgICBzdGF0ZS5zaWRlYmFyUmVzdG9yZUhhbmRsZXIsXHJcbiAgICAgIHRydWUsXHJcbiAgICApO1xyXG4gICAgc3RhdGUuc2lkZWJhclJlc3RvcmVIYW5kbGVyID0gbnVsbDtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlcmVuZGVyKCk6IHZvaWQge1xyXG4gIGlmICghc3RhdGUuYWN0aXZlUGFnZSkgcmV0dXJuO1xyXG4gIGNvbnN0IGhvc3QgPSBzdGF0ZS5wYW5lbEhvc3Q7XHJcbiAgaWYgKCFob3N0KSByZXR1cm47XHJcbiAgaG9zdC5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICBjb25zdCBhcCA9IHN0YXRlLmFjdGl2ZVBhZ2U7XHJcbiAgaWYgKGFwLmtpbmQgPT09IFwicmVnaXN0ZXJlZFwiKSB7XHJcbiAgICBjb25zdCBlbnRyeSA9IHN0YXRlLnBhZ2VzLmdldChhcC5pZCk7XHJcbiAgICBpZiAoIWVudHJ5KSB7XHJcbiAgICAgIHJlc3RvcmVDb2RleFZpZXcoKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgc3VidGl0bGUgPSBlbnRyeS5wYWdlLmRlc2NyaXB0aW9uXG4gICAgICA/IGAke2VudHJ5Lm1hbmlmZXN0Lm5hbWV9OiAke2VudHJ5LnBhZ2UuZGVzY3JpcHRpb259YFxuICAgICAgOiBlbnRyeS5tYW5pZmVzdC5uYW1lO1xuICAgIGNvbnN0IHJvb3QgPSBwYW5lbFNoZWxsKGVudHJ5LnBhZ2UudGl0bGUsIHN1YnRpdGxlKTtcbiAgICBob3N0LmFwcGVuZENoaWxkKHJvb3Qub3V0ZXIpO1xuICAgIGlmIChlbnRyeS5tYW5pZmVzdC5zY29wZSA9PT0gXCJtYWluXCIgfHwgZW50cnkubWFuaWZlc3Quc2NvcGUgPT09IFwiYm90aFwiKSB7XG4gICAgICByb290LnNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChub3RpY2VSb3coXG4gICAgICAgIFwiTWFpbiBQcm9jZXNzIEFjY2Vzc1wiLFxuICAgICAgICBcIlRoaXMgdHdlYWsgY2FuIHJ1biBjb2RlIGluIENvZGV4J3MgbWFpbiBwcm9jZXNzLiBVc2Ugc2V0dGluZ3MgZnJvbSBzb3VyY2VzIHlvdSB0cnVzdC5cIixcbiAgICAgICAgXCJ3YXJuXCIsXG4gICAgICApKTtcbiAgICB9XG4gICAgdHJ5IHtcclxuICAgICAgLy8gVGVhciBkb3duIGFueSBwcmlvciByZW5kZXIgYmVmb3JlIHJlLXJlbmRlcmluZyAoaG90IHJlbG9hZCkuXHJcbiAgICAgIHRyeSB7IGVudHJ5LnRlYXJkb3duPy4oKTsgfSBjYXRjaCB7fVxyXG4gICAgICBlbnRyeS50ZWFyZG93biA9IG51bGw7XHJcbiAgICAgIGNvbnN0IHJldCA9IGVudHJ5LnBhZ2UucmVuZGVyKHJvb3Quc2VjdGlvbnNXcmFwKTtcclxuICAgICAgaWYgKHR5cGVvZiByZXQgPT09IFwiZnVuY3Rpb25cIikgZW50cnkudGVhcmRvd24gPSByZXQ7XHJcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByb290LnNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChlcnJvclJvdyhcIkVycm9yIHJlbmRlcmluZyBwYWdlXCIsIChlIGFzIEVycm9yKS5tZXNzYWdlKSk7XG4gICAgfVxuICAgIHJldHVybjtcbiAgfVxuXHJcbiAgY29uc3QgdGl0bGUgPSBhcC5raW5kID09PSBcInR3ZWFrc1wiID8gXCJUd2Vha3NcIiA6IFwiQ29uZmlnXCI7XHJcbiAgY29uc3Qgc3VidGl0bGUgPSBhcC5raW5kID09PSBcInR3ZWFrc1wiXHJcbiAgICA/IFwiTWFuYWdlIHlvdXIgaW5zdGFsbGVkIENvZGV4KysgdHdlYWtzLlwiXHJcbiAgICA6IFwiQ29uZmlndXJlIENvZGV4KysgaXRzZWxmLlwiO1xyXG4gIGNvbnN0IHJvb3QgPSBwYW5lbFNoZWxsKHRpdGxlLCBzdWJ0aXRsZSk7XHJcbiAgaG9zdC5hcHBlbmRDaGlsZChyb290Lm91dGVyKTtcclxuICBpZiAoYXAua2luZCA9PT0gXCJ0d2Vha3NcIikgcmVuZGVyVHdlYWtzUGFnZShyb290LnNlY3Rpb25zV3JhcCk7XHJcbiAgZWxzZSByZW5kZXJDb25maWdQYWdlKHJvb3Quc2VjdGlvbnNXcmFwKTtcclxufVxyXG5cclxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHBhZ2VzIFx1MjUwMFx1MjUwMFxyXG5cclxuZnVuY3Rpb24gcmVuZGVyQ29uZmlnUGFnZShzZWN0aW9uc1dyYXA6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGNvbnN0IHNlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgc2VjdGlvbi5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJDb2RleCsrIFVwZGF0ZXNcIikpO1xuICBjb25zdCBjYXJkID0gcm91bmRlZENhcmQoKTtcclxuICBjb25zdCBsb2FkaW5nID0gcm93U2ltcGxlKFwiTG9hZGluZyB1cGRhdGUgc2V0dGluZ3NcIiwgXCJDaGVja2luZyBjdXJyZW50IENvZGV4KysgY29uZmlndXJhdGlvbi5cIik7XHJcbiAgY2FyZC5hcHBlbmRDaGlsZChsb2FkaW5nKTtcclxuICBzZWN0aW9uLmFwcGVuZENoaWxkKGNhcmQpO1xyXG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcclxuXHJcbiAgdm9pZCBpcGNSZW5kZXJlclxyXG4gICAgLmludm9rZShcImNvZGV4cHA6Z2V0LWNvbmZpZ1wiKVxyXG4gICAgLnRoZW4oKGNvbmZpZykgPT4ge1xyXG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcclxuICAgICAgcmVuZGVyQ29kZXhQbHVzUGx1c0NvbmZpZyhjYXJkLCBjb25maWcgYXMgQ29kZXhQbHVzUGx1c0NvbmZpZyk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKChlKSA9PiB7XHJcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xyXG4gICAgICBjYXJkLmFwcGVuZENoaWxkKHJvd1NpbXBsZShcIkNvdWxkIG5vdCBsb2FkIHVwZGF0ZSBzZXR0aW5nc1wiLCBTdHJpbmcoZSkpKTtcbiAgICB9KTtcblxuICByZW5kZXJJbnN0YWxsSGVhbHRoKHNlY3Rpb25zV3JhcCk7XG5cbiAgY29uc3QgbWFpbnRlbmFuY2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgbWFpbnRlbmFuY2UuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIG1haW50ZW5hbmNlLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShcIlN1cHBvcnQgJiBNYWludGVuYW5jZVwiKSk7XG4gIGNvbnN0IG1haW50ZW5hbmNlQ2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZChtYWludGVuYW5jZUFjdGlvblJvdyhcbiAgICBcIk9wZW4gdHdlYWtzIGZvbGRlclwiLFxuICAgIFwiT3BlbiB0aGUgZm9sZGVyIHdoZXJlIGxvY2FsIHR3ZWFrIHBhY2thZ2VzIGxpdmUuXCIsXG4gICAgXCJPcGVuXCIsXG4gICAgKCkgPT4gaW52b2tlQWN0aW9uKFwibWFpbnRlbmFuY2U6b3Blbi10d2Vha3NcIiwgXCJPcGVuaW5nIHR3ZWFrcyBmb2xkZXJcIiwgXCJPcGVuZWQgdHdlYWtzIGZvbGRlci5cIiwgKCkgPT5cbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIHR3ZWFrc1BhdGgoKSksXG4gICAgKSxcbiAgICBcIm1haW50ZW5hbmNlOm9wZW4tdHdlYWtzXCIsXG4gICkpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQobWFpbnRlbmFuY2VBY3Rpb25Sb3coXG4gICAgXCJPcGVuIGxvZ3NcIixcbiAgICBcIk9wZW4gQ29kZXgrKyBydW50aW1lIGxvZ3MgZm9yIGxvY2FsIGRlYnVnZ2luZy5cIixcbiAgICBcIk9wZW5cIixcbiAgICAoKSA9PiBpbnZva2VBY3Rpb24oXCJtYWludGVuYW5jZTpvcGVuLWxvZ3NcIiwgXCJPcGVuaW5nIGxvZ3NcIiwgXCJPcGVuZWQgbG9ncy5cIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgaGVhbHRoID0gYXdhaXQgbG9hZFJ1bnRpbWVIZWFsdGgoKTtcbiAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIGhlYWx0aD8ucGF0aHMubG9nRGlyID8/IFwiPHVzZXIgZGlyPi9sb2dcIik7XG4gICAgfSksXG4gICAgXCJtYWludGVuYW5jZTpvcGVuLWxvZ3NcIixcbiAgKSk7XG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZChjb3B5Q29tbWFuZFJvdyhcIkNvcHkgc3RhdHVzIGNvbW1hbmRcIiwgXCJNYWNoaW5lLXJlYWRhYmxlIGluc3RhbGwgc3RhdHVzLlwiLCBcImNvZGV4LXBsdXNwbHVzIHN0YXR1cyAtLWpzb25cIikpO1xuICBtYWludGVuYW5jZUNhcmQuYXBwZW5kQ2hpbGQoY29weUNvbW1hbmRSb3coXCJDb3B5IHN1cHBvcnQgYnVuZGxlIGNvbW1hbmRcIiwgXCJSZWRhY3RlZCBzdXBwb3J0IGRpYWdub3N0aWNzLlwiLCBcImNvZGV4LXBsdXNwbHVzIHN1cHBvcnQgYnVuZGxlXCIpKTtcbiAgbWFpbnRlbmFuY2VDYXJkLmFwcGVuZENoaWxkKGNvcHlDb21tYW5kUm93KFwiQ29weSB1bmluc3RhbGwgY29tbWFuZFwiLCBcIlJ1biBhZnRlciBxdWl0dGluZyBDb2RleCB0byByZXN0b3JlIHRoZSBhcHAgYmFja3VwLlwiLCBcImNvZGV4LXBsdXNwbHVzIHVuaW5zdGFsbFwiKSk7XG4gIG1haW50ZW5hbmNlQ2FyZC5hcHBlbmRDaGlsZChyZXBvcnRCdWdSb3coKSk7XG4gIG1haW50ZW5hbmNlLmFwcGVuZENoaWxkKG1haW50ZW5hbmNlQ2FyZCk7XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZChtYWludGVuYW5jZSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckluc3RhbGxIZWFsdGgoc2VjdGlvbnNXcmFwOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBzZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XG4gIHNlY3Rpb24uY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yXCI7XG4gIHNlY3Rpb24uYXBwZW5kQ2hpbGQoc2VjdGlvblRpdGxlKFwiSW5zdGFsbCBIZWFsdGhcIikpO1xuICBjb25zdCBjYXJkID0gcm91bmRlZENhcmQoKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChsb2FkaW5nUm93KFwiTG9hZGluZyBydW50aW1lIGhlYWx0aFwiLCBcIkNoZWNraW5nIHJ1bnRpbWUgcGF0aHMgYW5kIHJlbG9hZCBzdGF0dXMuXCIpKTtcbiAgc2VjdGlvbi5hcHBlbmRDaGlsZChjYXJkKTtcbiAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuXG4gIHZvaWQgbG9hZFJ1bnRpbWVIZWFsdGgoKVxuICAgIC50aGVuKChoZWFsdGgpID0+IHtcbiAgICAgIGNhcmQudGV4dENvbnRlbnQgPSBcIlwiO1xuICAgICAgaWYgKCFoZWFsdGgpIHtcbiAgICAgICAgY2FyZC5hcHBlbmRDaGlsZChlcnJvclJvdyhcIlJ1bnRpbWUgaGVhbHRoIHVuYXZhaWxhYmxlXCIsIFwiQ29kZXgrKyBjb3VsZCBub3QgcmVhZCBydW50aW1lIGRpYWdub3N0aWNzIGZyb20gdGhlIG1haW4gcHJvY2Vzcy5cIikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCByZWxvYWQgPSBoZWFsdGgubGFzdFJlbG9hZFxuICAgICAgICA/IGAke2hlYWx0aC5sYXN0UmVsb2FkLm9rID8gXCJMYXN0IHJlbG9hZCBzdWNjZWVkZWRcIiA6IFwiTGFzdCByZWxvYWQgZmFpbGVkXCJ9ICR7Zm9ybWF0RGF0ZShoZWFsdGgubGFzdFJlbG9hZC5hdCl9YFxuICAgICAgICA6IFwiTm8gcmVsb2FkIGhhcyBydW4gdGhpcyBzZXNzaW9uLlwiO1xuICAgICAgY29uc3QgdW5oZWFsdGh5ID0gaGVhbHRoLnJlY2VudEVycm9ycy5sZW5ndGggPiAwIHx8IGhlYWx0aC5sYXN0UmVsb2FkPy5vayA9PT0gZmFsc2U7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKG5vdGljZVJvdyhcbiAgICAgICAgdW5oZWFsdGh5ID8gXCJOZWVkcyBBdHRlbnRpb25cIiA6IFwiSGVhbHRoeVwiLFxuICAgICAgICB1bmhlYWx0aHlcbiAgICAgICAgICA/IFwiUmVjZW50IHJ1bnRpbWUgZXJyb3JzIHdlcmUgcmVjb3JkZWQuIE9wZW4gbG9ncyBvciBjcmVhdGUgYSBzdXBwb3J0IGJ1bmRsZSBpZiBiZWhhdmlvciBsb29rcyB3cm9uZy5cIlxuICAgICAgICAgIDogXCJSdW50aW1lIGRpYWdub3N0aWNzIGxvb2sgaGVhbHRoeS5cIixcbiAgICAgICAgdW5oZWFsdGh5ID8gXCJ3YXJuXCIgOiBcInN1Y2Nlc3NcIixcbiAgICAgICkpO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXCJSdW50aW1lXCIsIGB2JHtoZWFsdGgudmVyc2lvbn07ICR7cmVsb2FkfWApKTtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQocm93U2ltcGxlKFwiVHdlYWtzIGRpcmVjdG9yeVwiLCBoZWFsdGgucGF0aHMudHdlYWtzRGlyKSk7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKHJvd1NpbXBsZShcIkxvZyBkaXJlY3RvcnlcIiwgaGVhbHRoLnBhdGhzLmxvZ0RpcikpO1xuICAgICAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUoXG4gICAgICAgIFwiTG9hZGVkIHR3ZWFrc1wiLFxuICAgICAgICBgRGlzY292ZXJlZCAke2hlYWx0aC50d2Vha3MuZGlzY292ZXJlZH07IG1haW4gbG9hZGVkICR7aGVhbHRoLnR3ZWFrcy5sb2FkZWRNYWlufTsgcmVuZGVyZXIgbG9hZGVkICR7aGVhbHRoLnR3ZWFrcy5sb2FkZWRSZW5kZXJlciA/PyBcInVua25vd25cIn0uYCxcbiAgICAgICkpO1xuICAgICAgaWYgKGhlYWx0aC5yZWNlbnRFcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBsYXRlc3QgPSBoZWFsdGgucmVjZW50RXJyb3JzW2hlYWx0aC5yZWNlbnRFcnJvcnMubGVuZ3RoIC0gMV07XG4gICAgICAgIGNhcmQuYXBwZW5kQ2hpbGQoZXJyb3JSb3coXCJNb3N0IHJlY2VudCBydW50aW1lIGlzc3VlXCIsIGAke2Zvcm1hdERhdGUobGF0ZXN0LmF0KX06ICR7bGF0ZXN0Lm1lc3NhZ2V9YCkpO1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICBjYXJkLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICAgIGNhcmQuYXBwZW5kQ2hpbGQoZXJyb3JSb3coXCJDb3VsZCBub3QgbG9hZCBydW50aW1lIGhlYWx0aFwiLCBTdHJpbmcoZSkpKTtcbiAgICB9KTtcbn1cblxyXG5mdW5jdGlvbiByZW5kZXJDb2RleFBsdXNQbHVzQ29uZmlnKGNhcmQ6IEhUTUxFbGVtZW50LCBjb25maWc6IENvZGV4UGx1c1BsdXNDb25maWcpOiB2b2lkIHtcclxuICBjYXJkLmFwcGVuZENoaWxkKGF1dG9VcGRhdGVSb3coY29uZmlnKSk7XHJcbiAgY2FyZC5hcHBlbmRDaGlsZChjaGVja0ZvclVwZGF0ZXNSb3coY29uZmlnLnVwZGF0ZUNoZWNrKSk7XHJcbiAgaWYgKGNvbmZpZy51cGRhdGVDaGVjaykgY2FyZC5hcHBlbmRDaGlsZChyZWxlYXNlTm90ZXNSb3coY29uZmlnLnVwZGF0ZUNoZWNrKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGF1dG9VcGRhdGVSb3coY29uZmlnOiBDb2RleFBsdXNQbHVzQ29uZmlnKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IFwiQXV0b21hdGljYWxseSByZWZyZXNoIENvZGV4KytcIjtcclxuICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcclxuICBkZXNjLnRleHRDb250ZW50ID0gYEluc3RhbGxlZCB2ZXJzaW9uIHYke2NvbmZpZy52ZXJzaW9ufS4gVGhlIHdhdGNoZXIgY2FuIHJlZnJlc2ggdGhlIENvZGV4KysgcnVudGltZSBhZnRlciB5b3UgcmVydW4gdGhlIEdpdEh1YiBpbnN0YWxsZXIuYDtcclxuICBsZWZ0LmFwcGVuZENoaWxkKHRpdGxlKTtcclxuICBsZWZ0LmFwcGVuZENoaWxkKGRlc2MpO1xyXG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcclxuICByb3cuYXBwZW5kQ2hpbGQoXHJcbiAgICBzd2l0Y2hDb250cm9sKGNvbmZpZy5hdXRvVXBkYXRlLCBhc3luYyAobmV4dCkgPT4ge1xyXG4gICAgICBhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnNldC1hdXRvLXVwZGF0ZVwiLCBuZXh0KTtcclxuICAgIH0pLFxyXG4gICk7XHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tGb3JVcGRhdGVzUm93KGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgfCBudWxsKTogSFRNTEVsZW1lbnQge1xyXG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG4gIGNvbnN0IGxlZnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxlZnQuY2xhc3NOYW1lID0gXCJmbGV4IG1pbi13LTAgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGUuY2xhc3NOYW1lID0gXCJtaW4tdy0wIHRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IGNoZWNrPy51cGRhdGVBdmFpbGFibGUgPyBcIkNvZGV4KysgdXBkYXRlIGF2YWlsYWJsZVwiIDogXCJDb2RleCsrIGlzIHVwIHRvIGRhdGVcIjtcclxuICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcclxuICBkZXNjLnRleHRDb250ZW50ID0gdXBkYXRlU3VtbWFyeShjaGVjayk7XHJcbiAgbGVmdC5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcbiAgbGVmdC5hcHBlbmRDaGlsZChkZXNjKTtcclxuICByb3cuYXBwZW5kQ2hpbGQobGVmdCk7XHJcblxyXG4gIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xyXG4gIGlmIChjaGVjaz8ucmVsZWFzZVVybCkge1xyXG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChcclxuICAgICAgY29tcGFjdEJ1dHRvbihcIlJlbGVhc2UgTm90ZXNcIiwgKCkgPT4ge1xyXG4gICAgICAgIHZvaWQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIGNoZWNrLnJlbGVhc2VVcmwpO1xyXG4gICAgICB9KSxcclxuICAgICk7XHJcbiAgfVxuICBhY3Rpb25zLmFwcGVuZENoaWxkKFxuICAgIGFjdGlvbkJ1dHRvbihcIkNoZWNrIE5vd1wiLCBcIkNoZWNrIGZvciBDb2RleCsrIHVwZGF0ZXNcIiwgYXN5bmMgKGJ0bikgPT4ge1xuICAgICAgc2V0QnV0dG9uUGVuZGluZyhidG4sIHRydWUsIFwiQ2hlY2tpbmdcIik7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBuZXh0ID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjaGVjay1jb2RleHBwLXVwZGF0ZVwiLCB0cnVlKTtcbiAgICAgICAgY29uc3QgY2FyZCA9IHJvdy5wYXJlbnRFbGVtZW50O1xuICAgICAgICBpZiAoIWNhcmQpIHJldHVybjtcbiAgICAgICAgY2FyZC50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6Z2V0LWNvbmZpZ1wiKTtcbiAgICAgICAgcmVuZGVyQ29kZXhQbHVzUGx1c0NvbmZpZyhjYXJkLCB7XG4gICAgICAgICAgLi4uKGNvbmZpZyBhcyBDb2RleFBsdXNQbHVzQ29uZmlnKSxcbiAgICAgICAgICB1cGRhdGVDaGVjazogbmV4dCBhcyBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2ssXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwbG9nKFwiQ29kZXgrKyB1cGRhdGUgY2hlY2sgZmFpbGVkXCIsIFN0cmluZyhlKSk7XG4gICAgICAgIHJvdy5pbnNlcnRBZGphY2VudEVsZW1lbnQoXCJhZnRlcmVuZFwiLCBlcnJvclJvdyhcIlVwZGF0ZSBjaGVjayBmYWlsZWRcIiwgU3RyaW5nKGUpKSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBzZXRCdXR0b25QZW5kaW5nKGJ0biwgZmFsc2UpO1xuICAgICAgfVxuICAgIH0pLFxuICApO1xuICByb3cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuZnVuY3Rpb24gcmVsZWFzZU5vdGVzUm93KGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2spOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0yIHAtM1wiO1xyXG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZS5jbGFzc05hbWUgPSBcInRleHQtc20gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IFwiTGF0ZXN0IHJlbGVhc2Ugbm90ZXNcIjtcclxuICByb3cuYXBwZW5kQ2hpbGQodGl0bGUpO1xyXG4gIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicHJlXCIpO1xyXG4gIGJvZHkuY2xhc3NOYW1lID1cclxuICAgIFwibWF4LWgtNDggb3ZlcmZsb3ctYXV0byB3aGl0ZXNwYWNlLXByZS13cmFwIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHAtMyB0ZXh0LXhzIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICBib2R5LnRleHRDb250ZW50ID0gY2hlY2sucmVsZWFzZU5vdGVzPy50cmltKCkgfHwgY2hlY2suZXJyb3IgfHwgXCJObyByZWxlYXNlIG5vdGVzIGF2YWlsYWJsZS5cIjtcclxuICByb3cuYXBwZW5kQ2hpbGQoYm9keSk7XHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlU3VtbWFyeShjaGVjazogQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrIHwgbnVsbCk6IHN0cmluZyB7XHJcbiAgaWYgKCFjaGVjaykgcmV0dXJuIFwiTm8gdXBkYXRlIGNoZWNrIGhhcyBydW4geWV0LlwiO1xyXG4gIGNvbnN0IGxhdGVzdCA9IGNoZWNrLmxhdGVzdFZlcnNpb24gPyBgTGF0ZXN0IHYke2NoZWNrLmxhdGVzdFZlcnNpb259LiBgIDogXCJcIjtcclxuICBjb25zdCBjaGVja2VkID0gYENoZWNrZWQgJHtuZXcgRGF0ZShjaGVjay5jaGVja2VkQXQpLnRvTG9jYWxlU3RyaW5nKCl9LmA7XHJcbiAgaWYgKGNoZWNrLmVycm9yKSByZXR1cm4gYCR7bGF0ZXN0fSR7Y2hlY2tlZH0gJHtjaGVjay5lcnJvcn1gO1xyXG4gIHJldHVybiBgJHtsYXRlc3R9JHtjaGVja2VkfWA7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlcG9ydEJ1Z1JvdygpOiBIVE1MRWxlbWVudCB7XG4gIHJldHVybiBtYWludGVuYW5jZUFjdGlvblJvdyhcbiAgICBcIlJlcG9ydCBhIGJ1Z1wiLFxuICAgIFwiT3BlbiBhIEdpdEh1YiBpc3N1ZSB3aXRoIHJ1bnRpbWUsIGluc3RhbGxlciwgb3IgdHdlYWstbWFuYWdlciBkZXRhaWxzLlwiLFxuICAgIFwiT3BlbiBJc3N1ZVwiLFxuICAgICgpID0+IHtcbiAgICAgIGNvbnN0IHRpdGxlID0gZW5jb2RlVVJJQ29tcG9uZW50KFwiW0J1Z106IFwiKTtcbiAgICAgIGNvbnN0IGJvZHkgPSBlbmNvZGVVUklDb21wb25lbnQoXG4gICAgICAgIFtcbiAgICAgICAgICBcIiMjIFdoYXQgaGFwcGVuZWQ/XCIsXG4gICAgICAgICAgXCJcIixcbiAgICAgICAgICBcIiMjIFN0ZXBzIHRvIHJlcHJvZHVjZVwiLFxuICAgICAgICAgIFwiMS4gXCIsXG4gICAgICAgICAgXCJcIixcbiAgICAgICAgICBcIiMjIEVudmlyb25tZW50XCIsXG4gICAgICAgICAgXCItIENvZGV4KysgdmVyc2lvbjogXCIsXG4gICAgICAgICAgXCItIENvZGV4IGFwcCB2ZXJzaW9uOiBcIixcbiAgICAgICAgICBcIi0gT1M6IFwiLFxuICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgXCIjIyBEaWFnbm9zdGljc1wiLFxuICAgICAgICAgIFwiUnVuIGBjb2RleC1wbHVzcGx1cyBzdXBwb3J0IGJ1bmRsZWAgYW5kIGF0dGFjaCByZWxldmFudCByZWRhY3RlZCBvdXRwdXQuXCIsXG4gICAgICAgIF0uam9pbihcIlxcblwiKSxcbiAgICAgICk7XG4gICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcbiAgICAgICAgXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIixcbiAgICAgICAgYGh0dHBzOi8vZ2l0aHViLmNvbS9iLW5uZXR0L2NvZGV4LXBsdXNwbHVzL2lzc3Vlcy9uZXc/dGl0bGU9JHt0aXRsZX0mYm9keT0ke2JvZHl9YCxcbiAgICAgICk7XG4gICAgfSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gbWFpbnRlbmFuY2VBY3Rpb25Sb3coXG4gIHRpdGxlVGV4dDogc3RyaW5nLFxuICBkZXNjcmlwdGlvbjogc3RyaW5nLFxuICBhY3Rpb25MYWJlbDogc3RyaW5nLFxuICBvbkFjdGlvbjogKCkgPT4gdm9pZCxcbiAgZmVlZGJhY2tLZXk/OiBzdHJpbmcsXG4pOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcbiAgY29uc3QgbGVmdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbGVmdC5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xyXG4gIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZS5jbGFzc05hbWUgPSBcIm1pbi13LTAgdGV4dC1zbSB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xyXG4gIHRpdGxlLnRleHRDb250ZW50ID0gdGl0bGVUZXh0O1xyXG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xyXG4gIGRlc2MudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcbiAgbGVmdC5hcHBlbmRDaGlsZCh0aXRsZSk7XG4gIGxlZnQuYXBwZW5kQ2hpbGQoZGVzYyk7XG4gIGNvbnN0IGZlZWRiYWNrID0gZmVlZGJhY2tLZXkgPyBzdGF0ZS5mZWVkYmFjay5nZXQoZmVlZGJhY2tLZXkpIDogbnVsbDtcbiAgaWYgKGZlZWRiYWNrKSBsZWZ0LmFwcGVuZENoaWxkKGlubGluZUZlZWRiYWNrKGZlZWRiYWNrLmtpbmQsIGZlZWRiYWNrLm1lc3NhZ2UpKTtcbiAgcm93LmFwcGVuZENoaWxkKGxlZnQpO1xuICBjb25zdCBhY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgYWN0aW9ucy5kYXRhc2V0LmNvZGV4cHBSb3dBY3Rpb25zID0gXCJ0cnVlXCI7XG4gIGFjdGlvbnMuY2xhc3NOYW1lID0gXCJmbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciBnYXAtMlwiO1xuICBhY3Rpb25zLmFwcGVuZENoaWxkKGNvbXBhY3RCdXR0b24oYWN0aW9uTGFiZWwsIG9uQWN0aW9uKSk7XG4gIHJvdy5hcHBlbmRDaGlsZChhY3Rpb25zKTtcbiAgcmV0dXJuIHJvdztcbn1cblxuZnVuY3Rpb24gY29weUNvbW1hbmRSb3codGl0bGU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgY29tbWFuZDogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBrZXkgPSBgY29weToke2NvbW1hbmR9YDtcbiAgcmV0dXJuIG1haW50ZW5hbmNlQWN0aW9uUm93KHRpdGxlLCBgJHtkZXNjcmlwdGlvbn0gJHtjb21tYW5kfWAsIFwiQ29weVwiLCAoKSA9PiB7XG4gICAgdm9pZCBpbnZva2VBY3Rpb24oa2V5LCBcIkNvcHlpbmcgY29tbWFuZFwiLCBcIkNvbW1hbmQgY29waWVkLlwiLCAoKSA9PlxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpjb3B5LXRleHRcIiwgY29tbWFuZCksXG4gICAgKTtcbiAgfSwga2V5KTtcbn1cblxyXG5mdW5jdGlvbiByZW5kZXJUd2Vha3NQYWdlKHNlY3Rpb25zV3JhcDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgLy8gR3JvdXAgcmVnaXN0ZXJlZCBTZXR0aW5nc1NlY3Rpb25zIGJ5IHR3ZWFrIGlkIChwcmVmaXggc3BsaXQgYXQgXCI6XCIpLlxuICBjb25zdCBzZWN0aW9uc0J5VHdlYWsgPSBuZXcgTWFwPHN0cmluZywgU2V0dGluZ3NTZWN0aW9uW10+KCk7XG4gIGZvciAoY29uc3QgcyBvZiBzdGF0ZS5zZWN0aW9ucy52YWx1ZXMoKSkge1xuICAgIGNvbnN0IHR3ZWFrSWQgPSBzLmlkLnNwbGl0KFwiOlwiKVswXTtcbiAgICBpZiAoIXNlY3Rpb25zQnlUd2Vhay5oYXModHdlYWtJZCkpIHNlY3Rpb25zQnlUd2Vhay5zZXQodHdlYWtJZCwgW10pO1xyXG4gICAgc2VjdGlvbnNCeVR3ZWFrLmdldCh0d2Vha0lkKSEucHVzaChzKTtcbiAgfVxuXG4gIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcbiAgd3JhcC5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTNcIjtcbiAgd3JhcC5hcHBlbmRDaGlsZChzZWN0aW9uVGl0bGUoXCJJbnN0YWxsZWQgVHdlYWtzXCIpKTtcbiAgd3JhcC5hcHBlbmRDaGlsZCh0d2Vha3NUb29sYmFyKCkpO1xuXG4gIGNvbnN0IGdsb2JhbEZlZWRiYWNrID0gc3RhdGUuZmVlZGJhY2suZ2V0KFwidHdlYWtzOmdsb2JhbFwiKTtcbiAgaWYgKGdsb2JhbEZlZWRiYWNrKSB3cmFwLmFwcGVuZENoaWxkKG5vdGljZVJvdyhcIlR3ZWFrc1wiLCBnbG9iYWxGZWVkYmFjay5tZXNzYWdlLCBnbG9iYWxGZWVkYmFjay5raW5kKSk7XG5cbiAgaWYgKHN0YXRlLmxpc3RlZFR3ZWFrcy5sZW5ndGggPT09IDApIHtcbiAgICB3cmFwLmFwcGVuZENoaWxkKGVtcHR5U3RhdGUoXG4gICAgICBcIk5vIHR3ZWFrcyBpbnN0YWxsZWRcIixcbiAgICAgIGBEcm9wIGEgdHdlYWsgZm9sZGVyIGludG8gJHt0d2Vha3NQYXRoKCl9IGFuZCByZWxvYWQuYCxcbiAgICApKTtcbiAgICBzZWN0aW9uc1dyYXAuYXBwZW5kQ2hpbGQod3JhcCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgdmlzaWJsZSA9IGZpbHRlcmVkVHdlYWtzKHN0YXRlLmxpc3RlZFR3ZWFrcyk7XG4gIGlmICh2aXNpYmxlLmxlbmd0aCA9PT0gMCkge1xuICAgIHdyYXAuYXBwZW5kQ2hpbGQoZW1wdHlTdGF0ZShcIk5vIHR3ZWFrcyBtYXRjaFwiLCBcIlRyeSBhIGRpZmZlcmVudCBzZWFyY2ggb3IgZmlsdGVyLlwiKSk7XG4gICAgc2VjdGlvbnNXcmFwLmFwcGVuZENoaWxkKHdyYXApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGZvciAoY29uc3QgZ3JvdXAgb2YgdHdlYWtHcm91cHModmlzaWJsZSkpIHtcbiAgICBpZiAoZ3JvdXAuaXRlbXMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcbiAgICBjb25zdCBzZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XG4gICAgc2VjdGlvbi5jbGFzc05hbWUgPSBcImZsZXggZmxleC1jb2wgZ2FwLTJcIjtcbiAgICBzZWN0aW9uLmFwcGVuZENoaWxkKHNlY3Rpb25UaXRsZShgJHtncm91cC50aXRsZX0gKCR7Z3JvdXAuaXRlbXMubGVuZ3RofSlgKSk7XG4gICAgY29uc3QgY2FyZCA9IHJvdW5kZWRDYXJkKCk7XG4gICAgZm9yIChjb25zdCB0IG9mIGdyb3VwLml0ZW1zKSB7XG4gICAgICBjYXJkLmFwcGVuZENoaWxkKHR3ZWFrUm93KHQsIHNlY3Rpb25zQnlUd2Vhay5nZXQodC5tYW5pZmVzdC5pZCkgPz8gW10pKTtcbiAgICB9XG4gICAgc2VjdGlvbi5hcHBlbmRDaGlsZChjYXJkKTtcbiAgICB3cmFwLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuICB9XG4gIHNlY3Rpb25zV3JhcC5hcHBlbmRDaGlsZCh3cmFwKTtcbn1cblxuZnVuY3Rpb24gdHdlYWtzVG9vbGJhcigpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHRvb2xiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB0b29sYmFyLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LXdyYXAgaXRlbXMtY2VudGVyIGdhcC0yXCI7XG4gIHRvb2xiYXIuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInRvb2xiYXJcIik7XG4gIHRvb2xiYXIuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIlR3ZWFrIG1hbmFnZXIgY29udHJvbHNcIik7XG5cbiAgY29uc3Qgc2VhcmNoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICBzZWFyY2gudHlwZSA9IFwic2VhcmNoXCI7XG4gIHNlYXJjaC52YWx1ZSA9IHN0YXRlLnR3ZWFrc1NlYXJjaDtcbiAgc2VhcmNoLnBsYWNlaG9sZGVyID0gXCJTZWFyY2ggdHdlYWtzXCI7XG4gIHNlYXJjaC5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwiU2VhcmNoIHR3ZWFrc1wiKTtcbiAgc2VhcmNoLmNsYXNzTmFtZSA9XG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIGgtOCBtaW4tdy00OCBmbGV4LTEgcm91bmRlZC1sZyBib3JkZXIgYmctdHJhbnNwYXJlbnQgcHgtMiB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IG91dGxpbmUtbm9uZSBmb2N1cy12aXNpYmxlOnJpbmctMiBmb2N1cy12aXNpYmxlOnJpbmctdG9rZW4tZm9jdXMtYm9yZGVyXCI7XG4gIHNlYXJjaC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4ge1xuICAgIHN0YXRlLnR3ZWFrc1NlYXJjaCA9IHNlYXJjaC52YWx1ZTtcbiAgICByZXJlbmRlcigpO1xuICB9KTtcbiAgdG9vbGJhci5hcHBlbmRDaGlsZChzZWFyY2gpO1xuXG4gIHRvb2xiYXIuYXBwZW5kQ2hpbGQoZmlsdGVyU2VnbWVudGVkQ29udHJvbCgpKTtcbiAgdG9vbGJhci5hcHBlbmRDaGlsZChpY29uQnV0dG9uKFwiUmVsb2FkIHR3ZWFrc1wiLCByZWZyZXNoSWNvblN2ZygpLCBhc3luYyAoYnRuKSA9PiB7XG4gICAgc2V0QnV0dG9uUGVuZGluZyhidG4sIHRydWUsIFwiUmVsb2FkaW5nXCIpO1xuICAgIHN0YXRlLmZlZWRiYWNrLnNldChcInR3ZWFrczpnbG9iYWxcIiwgeyBraW5kOiBcImluZm9cIiwgbWVzc2FnZTogXCJSZWxvYWRpbmcgdHdlYWtzLi4uXCIgfSk7XG4gICAgcmVyZW5kZXIoKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpyZWxvYWQtdHdlYWtzXCIpO1xuICAgICAgc3RhdGUuZmVlZGJhY2suc2V0KFwidHdlYWtzOmdsb2JhbFwiLCB7IGtpbmQ6IFwic3VjY2Vzc1wiLCBtZXNzYWdlOiBcIlR3ZWFrcyByZWxvYWRlZC4gUmVsb2FkaW5nIHdpbmRvdy4uLlwiIH0pO1xuICAgICAgcmVyZW5kZXIoKTtcbiAgICAgIGxvY2F0aW9uLnJlbG9hZCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHN0YXRlLmZlZWRiYWNrLnNldChcInR3ZWFrczpnbG9iYWxcIiwgeyBraW5kOiBcImVycm9yXCIsIG1lc3NhZ2U6IGBSZWxvYWQgZmFpbGVkOiAke1N0cmluZyhlKX1gIH0pO1xuICAgICAgcmVyZW5kZXIoKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0QnV0dG9uUGVuZGluZyhidG4sIGZhbHNlKTtcbiAgICB9XG4gIH0pKTtcbiAgdG9vbGJhci5hcHBlbmRDaGlsZChpY29uQnV0dG9uKFwiT3BlbiB0d2Vha3MgZm9sZGVyXCIsIGZvbGRlckljb25TdmcoKSwgYXN5bmMgKGJ0bikgPT4ge1xuICAgIHNldEJ1dHRvblBlbmRpbmcoYnRuLCB0cnVlLCBcIk9wZW5pbmdcIik7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cmV2ZWFsXCIsIHR3ZWFrc1BhdGgoKSk7XG4gICAgICBzdGF0ZS5mZWVkYmFjay5zZXQoXCJ0d2Vha3M6Z2xvYmFsXCIsIHsga2luZDogXCJzdWNjZXNzXCIsIG1lc3NhZ2U6IFwiT3BlbmVkIHR3ZWFrcyBmb2xkZXIuXCIgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgc3RhdGUuZmVlZGJhY2suc2V0KFwidHdlYWtzOmdsb2JhbFwiLCB7IGtpbmQ6IFwiZXJyb3JcIiwgbWVzc2FnZTogYENvdWxkIG5vdCBvcGVuIHR3ZWFrcyBmb2xkZXI6ICR7U3RyaW5nKGUpfWAgfSk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldEJ1dHRvblBlbmRpbmcoYnRuLCBmYWxzZSk7XG4gICAgICByZXJlbmRlcigpO1xuICAgIH1cbiAgfSkpO1xuICByZXR1cm4gdG9vbGJhcjtcbn1cblxuZnVuY3Rpb24gZmlsdGVyU2VnbWVudGVkQ29udHJvbCgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICB3cmFwLmNsYXNzTmFtZSA9IFwiYm9yZGVyLXRva2VuLWJvcmRlciBpbmxpbmUtZmxleCBoLTggb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtbGcgYm9yZGVyXCI7XG4gIHdyYXAuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcImdyb3VwXCIpO1xuICB3cmFwLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCJGaWx0ZXIgdHdlYWtzIGJ5IHN0YXR1c1wiKTtcbiAgY29uc3Qgb3B0aW9uczogQXJyYXk8W1R3ZWFrU3RhdHVzRmlsdGVyLCBzdHJpbmddPiA9IFtcbiAgICBbXCJhbGxcIiwgXCJBbGxcIl0sXG4gICAgW1wiYXR0ZW50aW9uXCIsIFwiQXR0ZW50aW9uXCJdLFxuICAgIFtcInVwZGF0ZXNcIiwgXCJVcGRhdGVzXCJdLFxuICAgIFtcImVuYWJsZWRcIiwgXCJFbmFibGVkXCJdLFxuICAgIFtcImRpc2FibGVkXCIsIFwiRGlzYWJsZWRcIl0sXG4gIF07XG4gIGZvciAoY29uc3QgW3ZhbHVlLCBsYWJlbF0gb2Ygb3B0aW9ucykge1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGJ0bi5kYXRhc2V0LmNvZGV4cHBGaWx0ZXIgPSB2YWx1ZTtcbiAgICBidG4uY2xhc3NOYW1lID1cbiAgICAgIFwiaC04IHB4LTIgdGV4dC14cyB0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IGhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBhcmlhLXByZXNzZWQ6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGFyaWEtcHJlc3NlZDp0ZXh0LXRva2VuLXRleHQtcHJpbWFyeVwiO1xuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLXByZXNzZWRcIiwgU3RyaW5nKHN0YXRlLnR3ZWFrc0ZpbHRlciA9PT0gdmFsdWUpKTtcbiAgICBidG4udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBzdGF0ZS50d2Vha3NGaWx0ZXIgPSB2YWx1ZTtcbiAgICAgIHJlcmVuZGVyKCk7XG4gICAgfSk7XG4gICAgd3JhcC5hcHBlbmRDaGlsZChidG4pO1xuICB9XG4gIHJldHVybiB3cmFwO1xufVxuXHJcbmZ1bmN0aW9uIHR3ZWFrUm93KHQ6IExpc3RlZFR3ZWFrLCBzZWN0aW9uczogU2V0dGluZ3NTZWN0aW9uW10pOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IG0gPSB0Lm1hbmlmZXN0O1xuICBjb25zdCBuZWVkc01haW5XYXJuaW5nID0gaGFzTWFpblByb2Nlc3NBY2Nlc3ModCk7XG5cclxuICAvLyBPdXRlciBjZWxsIHdyYXBzIHRoZSBoZWFkZXIgcm93ICsgKG9wdGlvbmFsKSBuZXN0ZWQgc2VjdGlvbnMgc28gdGhlXHJcbiAgLy8gcGFyZW50IGNhcmQncyBkaXZpZGVyIHN0YXlzIGJldHdlZW4gKnR3ZWFrcyosIG5vdCBiZXR3ZWVuIGhlYWRlciBhbmRcclxuICAvLyBib2R5IG9mIHRoZSBzYW1lIHR3ZWFrLlxyXG4gIGNvbnN0IGNlbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGNlbGwuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sXCI7XHJcbiAgaWYgKCF0LmVuYWJsZWQgfHwgIXQubG9hZGFibGUpIGNlbGwuc3R5bGUub3BhY2l0eSA9IFwiMC43XCI7XG5cclxuICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGhlYWRlci5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtc3RhcnQganVzdGlmeS1iZXR3ZWVuIGdhcC00IHAtM1wiO1xyXG5cclxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtMSBpdGVtcy1zdGFydCBnYXAtM1wiO1xyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgQXZhdGFyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gIGNvbnN0IGF2YXRhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYXZhdGFyLmNsYXNzTmFtZSA9XHJcbiAgICBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGp1c3RpZnktY2VudGVyIHJvdW5kZWQtbWQgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgb3ZlcmZsb3ctaGlkZGVuIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICBhdmF0YXIuc3R5bGUud2lkdGggPSBcIjU2cHhcIjtcclxuICBhdmF0YXIuc3R5bGUuaGVpZ2h0ID0gXCI1NnB4XCI7XHJcbiAgYXZhdGFyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwidmFyKC0tY29sb3ItdG9rZW4tYmctZm9nLCB0cmFuc3BhcmVudClcIjtcclxuICBpZiAobS5pY29uVXJsKSB7XHJcbiAgICBjb25zdCBpbWcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO1xyXG4gICAgaW1nLmFsdCA9IFwiXCI7XHJcbiAgICBpbWcuY2xhc3NOYW1lID0gXCJzaXplLWZ1bGwgb2JqZWN0LWNvbnRhaW5cIjtcclxuICAgIC8vIEluaXRpYWw6IHNob3cgZmFsbGJhY2sgaW5pdGlhbCBpbiBjYXNlIHRoZSBpY29uIGZhaWxzIHRvIGxvYWQuXHJcbiAgICBjb25zdCBpbml0aWFsID0gKG0ubmFtZT8uWzBdID8/IFwiP1wiKS50b1VwcGVyQ2FzZSgpO1xyXG4gICAgY29uc3QgZmFsbGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgIGZhbGxiYWNrLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xyXG4gICAgZmFsbGJhY2sudGV4dENvbnRlbnQgPSBpbml0aWFsO1xyXG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGZhbGxiYWNrKTtcclxuICAgIGltZy5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgKCkgPT4ge1xyXG4gICAgICBmYWxsYmFjay5yZW1vdmUoKTtcclxuICAgICAgaW1nLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xyXG4gICAgfSk7XHJcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcclxuICAgICAgaW1nLnJlbW92ZSgpO1xyXG4gICAgfSk7XHJcbiAgICB2b2lkIHJlc29sdmVJY29uVXJsKG0uaWNvblVybCwgdC5kaXIpLnRoZW4oKHVybCkgPT4ge1xyXG4gICAgICBpZiAodXJsKSBpbWcuc3JjID0gdXJsO1xyXG4gICAgICBlbHNlIGltZy5yZW1vdmUoKTtcclxuICAgIH0pO1xyXG4gICAgYXZhdGFyLmFwcGVuZENoaWxkKGltZyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IGluaXRpYWwgPSAobS5uYW1lPy5bMF0gPz8gXCI/XCIpLnRvVXBwZXJDYXNlKCk7XHJcbiAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICBzcGFuLmNsYXNzTmFtZSA9IFwidGV4dC14bCBmb250LW1lZGl1bVwiO1xyXG4gICAgc3Bhbi50ZXh0Q29udGVudCA9IGluaXRpYWw7XHJcbiAgICBhdmF0YXIuYXBwZW5kQ2hpbGQoc3Bhbik7XHJcbiAgfVxyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoYXZhdGFyKTtcclxuXHJcbiAgLy8gXHUyNTAwXHUyNTAwIFRleHQgc3RhY2sgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHJcbiAgY29uc3Qgc3RhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHN0YWNrLmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGZsZXgtY29sIGdhcC0wLjVcIjtcclxuXHJcbiAgY29uc3QgdGl0bGVSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRpdGxlUm93LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcclxuICBjb25zdCBuYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBuYW1lLmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgbmFtZS50ZXh0Q29udGVudCA9IG0ubmFtZTtcclxuICB0aXRsZVJvdy5hcHBlbmRDaGlsZChuYW1lKTtcclxuICBpZiAobS52ZXJzaW9uKSB7XHJcbiAgICBjb25zdCB2ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgIHZlci5jbGFzc05hbWUgPVxyXG4gICAgICBcInRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnkgdGV4dC14cyBmb250LW5vcm1hbCB0YWJ1bGFyLW51bXNcIjtcclxuICAgIHZlci50ZXh0Q29udGVudCA9IGB2JHttLnZlcnNpb259YDtcclxuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKHZlcik7XHJcbiAgfVxyXG4gIGlmICh0LnVwZGF0ZT8udXBkYXRlQXZhaWxhYmxlKSB7XG4gICAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQoc3RhdHVzQmFkZ2UoXCJVcGRhdGUgQXZhaWxhYmxlXCIsIFwiaW5mb1wiKSk7XG4gIH1cbiAgaWYgKCF0LmxvYWRhYmxlKSB7XG4gICAgdGl0bGVSb3cuYXBwZW5kQ2hpbGQoc3RhdHVzQmFkZ2UoXCJOb3QgTG9hZGVkXCIsIFwid2FyblwiKSk7XG4gIH1cbiAgaWYgKG5lZWRzTWFpbldhcm5pbmcpIHtcbiAgICB0aXRsZVJvdy5hcHBlbmRDaGlsZChzdGF0dXNCYWRnZShcIk1haW4gUHJvY2VzcyBBY2Nlc3NcIiwgXCJkYW5nZXJcIikpO1xuICB9XG4gIHN0YWNrLmFwcGVuZENoaWxkKHRpdGxlUm93KTtcblxuICBpZiAodC5sb2FkRXJyb3IpIHtcbiAgICBjb25zdCBkZXNjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQtc21cIjtcbiAgICBkZXNjLnRleHRDb250ZW50ID0gdC5sb2FkRXJyb3I7XG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoZGVzYyk7XG4gIH0gZWxzZSBpZiAobS5kZXNjcmlwdGlvbikge1xuICAgIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGRlc2MuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xuICAgIGRlc2MudGV4dENvbnRlbnQgPSBtLmRlc2NyaXB0aW9uO1xuICAgIHN0YWNrLmFwcGVuZENoaWxkKGRlc2MpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbWV0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbWV0YS5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGdhcC0yIHRleHQteHMgdGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeVwiO1xyXG4gIGNvbnN0IGF1dGhvckVsID0gcmVuZGVyQXV0aG9yKG0uYXV0aG9yKTtcclxuICBpZiAoYXV0aG9yRWwpIG1ldGEuYXBwZW5kQ2hpbGQoYXV0aG9yRWwpO1xyXG4gIGlmIChtLmdpdGh1YlJlcG8pIHtcclxuICAgIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIG1ldGEuYXBwZW5kQ2hpbGQoZG90KCkpO1xyXG4gICAgY29uc3QgcmVwbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICByZXBvLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgcmVwby5jbGFzc05hbWUgPSBcImlubGluZS1mbGV4IHRleHQtdG9rZW4tdGV4dC1saW5rLWZvcmVncm91bmQgaG92ZXI6dW5kZXJsaW5lXCI7XHJcbiAgICByZXBvLnRleHRDb250ZW50ID0gbS5naXRodWJSZXBvO1xyXG4gICAgcmVwby5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHtcclxuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCBgaHR0cHM6Ly9naXRodWIuY29tLyR7bS5naXRodWJSZXBvfWApO1xyXG4gICAgfSk7XHJcbiAgICBtZXRhLmFwcGVuZENoaWxkKHJlcG8pO1xyXG4gIH1cclxuICBpZiAobS5ob21lcGFnZSkge1xyXG4gICAgaWYgKG1ldGEuY2hpbGRyZW4ubGVuZ3RoID4gMCkgbWV0YS5hcHBlbmRDaGlsZChkb3QoKSk7XHJcbiAgICBjb25zdCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XHJcbiAgICBsaW5rLmhyZWYgPSBtLmhvbWVwYWdlO1xyXG4gICAgbGluay50YXJnZXQgPSBcIl9ibGFua1wiO1xyXG4gICAgbGluay5yZWwgPSBcIm5vcmVmZXJyZXJcIjtcclxuICAgIGxpbmsuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xyXG4gICAgbGluay50ZXh0Q29udGVudCA9IFwiSG9tZXBhZ2VcIjtcclxuICAgIG1ldGEuYXBwZW5kQ2hpbGQobGluayk7XHJcbiAgfVxyXG4gIGlmIChtZXRhLmNoaWxkcmVuLmxlbmd0aCA+IDApIHN0YWNrLmFwcGVuZENoaWxkKG1ldGEpO1xyXG5cclxuICAvLyBUYWdzIHJvdyAoaWYgYW55KSBcdTIwMTQgc21hbGwgcGlsbCBjaGlwcyBiZWxvdyB0aGUgbWV0YSBsaW5lLlxyXG4gIGlmIChtLnRhZ3MgJiYgbS50YWdzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCB0YWdzUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHRhZ3NSb3cuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtd3JhcCBpdGVtcy1jZW50ZXIgZ2FwLTEgcHQtMC41XCI7XHJcbiAgICBmb3IgKGNvbnN0IHRhZyBvZiBtLnRhZ3MpIHtcclxuICAgICAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gICAgICBwaWxsLmNsYXNzTmFtZSA9XHJcbiAgICAgICAgXCJyb3VuZGVkLWZ1bGwgYm9yZGVyIGJvcmRlci10b2tlbi1ib3JkZXIgYmctdG9rZW4tZm9yZWdyb3VuZC81IHB4LTIgcHktMC41IHRleHQtWzExcHhdIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcclxuICAgICAgcGlsbC50ZXh0Q29udGVudCA9IHRhZztcclxuICAgICAgdGFnc1Jvdy5hcHBlbmRDaGlsZChwaWxsKTtcclxuICAgIH1cclxuICAgIHN0YWNrLmFwcGVuZENoaWxkKHRhZ3NSb3cpO1xuICB9XG5cbiAgaWYgKG5lZWRzTWFpbldhcm5pbmcpIHtcbiAgICBjb25zdCB3YXJuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICB3YXJuLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSBtaW4tdy0wIHRleHQteHNcIjtcbiAgICB3YXJuLnRleHRDb250ZW50ID0gXCJDYW4gcnVuIGluIENvZGV4J3MgbWFpbiBwcm9jZXNzLiBFbmFibGUgb25seSB0d2Vha3MgZnJvbSBzb3VyY2VzIHlvdSB0cnVzdC5cIjtcbiAgICBzdGFjay5hcHBlbmRDaGlsZCh3YXJuKTtcbiAgfVxuXG4gIGNvbnN0IGZyaWVuZGx5Q2FwYWJpbGl0aWVzID0gZnJpZW5kbHlDYXBhYmlsaXR5TGFiZWxzKHQuY2FwYWJpbGl0aWVzID8/IFtdKTtcbiAgaWYgKGZyaWVuZGx5Q2FwYWJpbGl0aWVzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBjYXBSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIGNhcFJvdy5jbGFzc05hbWUgPSBcImZsZXggZmxleC13cmFwIGl0ZW1zLWNlbnRlciBnYXAtMSBwdC0wLjVcIjtcbiAgICBmb3IgKGNvbnN0IGNhcCBvZiBmcmllbmRseUNhcGFiaWxpdGllcykgY2FwUm93LmFwcGVuZENoaWxkKHN0YXR1c0JhZGdlKGNhcCwgXCJtdXRlZFwiKSk7XG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoY2FwUm93KTtcbiAgfVxuXG4gIGNvbnN0IGZlZWRiYWNrID0gc3RhdGUuZmVlZGJhY2suZ2V0KGB0d2Vhazoke20uaWR9YCk7XG4gIGlmIChmZWVkYmFjaykgc3RhY2suYXBwZW5kQ2hpbGQoaW5saW5lRmVlZGJhY2soZmVlZGJhY2sua2luZCwgZmVlZGJhY2subWVzc2FnZSkpO1xuXHJcbiAgbGVmdC5hcHBlbmRDaGlsZChzdGFjayk7XHJcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGxlZnQpO1xyXG5cclxuICAvLyBcdTI1MDBcdTI1MDAgVG9nZ2xlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxyXG4gIGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICByaWdodC5jbGFzc05hbWUgPSBcImZsZXggc2hyaW5rLTAgaXRlbXMtY2VudGVyIGdhcC0yIHB0LTAuNVwiO1xyXG4gIGlmICh0LnVwZGF0ZT8udXBkYXRlQXZhaWxhYmxlICYmIHQudXBkYXRlLnJlbGVhc2VVcmwpIHtcbiAgICByaWdodC5hcHBlbmRDaGlsZChcbiAgICAgIGNvbXBhY3RCdXR0b24oXCJWaWV3IFJlbGVhc2VcIiwgKCkgPT4ge1xuICAgICAgICB2b2lkIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6b3Blbi1leHRlcm5hbFwiLCB0LnVwZGF0ZSEucmVsZWFzZVVybCk7XG4gICAgICB9KSxcbiAgICApO1xuICB9XG4gIGNvbnN0IHRvZ2dsZSA9IHN3aXRjaENvbnRyb2wodC5lbmFibGVkLCBhc3luYyAobmV4dCkgPT4ge1xuICAgICAgaWYgKG5leHQgJiYgbmVlZHNNYWluV2FybmluZyAmJiAhc3RhdGUuY29uZmlybWVkTWFpblR3ZWFrcy5oYXMobS5pZCkpIHtcbiAgICAgICAgY29uc3Qgb2sgPSB3aW5kb3cuY29uZmlybShcbiAgICAgICAgICBgJHttLm5hbWV9IGNhbiBydW4gaW4gQ29kZXgncyBtYWluIHByb2Nlc3MuXFxuXFxuT25seSBlbmFibGUgbWFpbi1wcm9jZXNzIHR3ZWFrcyBmcm9tIHNvdXJjZXMgeW91IHRydXN0LmAsXG4gICAgICAgICk7XG4gICAgICAgIGlmICghb2spIHJldHVybiBmYWxzZTtcbiAgICAgICAgc3RhdGUuY29uZmlybWVkTWFpblR3ZWFrcy5hZGQobS5pZCk7XG4gICAgICB9XG4gICAgICBzdGF0ZS5mZWVkYmFjay5zZXQoYHR3ZWFrOiR7bS5pZH1gLCB7XG4gICAgICAgIGtpbmQ6IFwiaW5mb1wiLFxuICAgICAgICBtZXNzYWdlOiBuZXh0ID8gXCJFbmFibGluZy4uLlwiIDogXCJEaXNhYmxpbmcuLi5cIixcbiAgICAgIH0pO1xuICAgICAgcmVyZW5kZXIoKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6c2V0LXR3ZWFrLWVuYWJsZWRcIiwgbS5pZCwgbmV4dCk7XG4gICAgICAgIHN0YXRlLmxpc3RlZFR3ZWFrcyA9IHN0YXRlLmxpc3RlZFR3ZWFrcy5tYXAoKGl0ZW0pID0+XG4gICAgICAgICAgaXRlbS5tYW5pZmVzdC5pZCA9PT0gbS5pZCA/IHsgLi4uaXRlbSwgZW5hYmxlZDogbmV4dCB9IDogaXRlbSxcbiAgICAgICAgKTtcbiAgICAgICAgc3RhdGUuZmVlZGJhY2suc2V0KGB0d2Vhazoke20uaWR9YCwge1xuICAgICAgICAgIGtpbmQ6IFwic3VjY2Vzc1wiLFxuICAgICAgICAgIG1lc3NhZ2U6IG5leHQgPyBcIkVuYWJsZWQuIFJlbG9hZGluZyB0d2Vha3MuLi5cIiA6IFwiRGlzYWJsZWQuIFJlbG9hZGluZyB0d2Vha3MuLi5cIixcbiAgICAgICAgfSk7XG4gICAgICAgIHJlcmVuZGVyKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBzdGF0ZS5mZWVkYmFjay5zZXQoYHR3ZWFrOiR7bS5pZH1gLCB7XG4gICAgICAgICAga2luZDogXCJlcnJvclwiLFxuICAgICAgICAgIG1lc3NhZ2U6IGBDb3VsZCBub3QgJHtuZXh0ID8gXCJlbmFibGVcIiA6IFwiZGlzYWJsZVwifTogJHtTdHJpbmcoZSl9YCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJlcmVuZGVyKCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9LCB7XG4gICAgICBkaXNhYmxlZDogIXQubG9hZGFibGUgfHwgIXQuZW50cnlFeGlzdHMsXG4gICAgICBhcmlhTGFiZWw6IGAke3QuZW5hYmxlZCA/IFwiRGlzYWJsZVwiIDogXCJFbmFibGVcIn0gJHttLm5hbWV9YCxcbiAgICB9KTtcbiAgcmlnaHQuYXBwZW5kQ2hpbGQodG9nZ2xlKTtcbiAgaGVhZGVyLmFwcGVuZENoaWxkKHJpZ2h0KTtcblxyXG4gIGNlbGwuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuXHJcbiAgLy8gSWYgdGhlIHR3ZWFrIGlzIGVuYWJsZWQgYW5kIHJlZ2lzdGVyZWQgc2V0dGluZ3Mgc2VjdGlvbnMsIHJlbmRlciB0aG9zZVxyXG4gIC8vIGJvZGllcyBhcyBuZXN0ZWQgcm93cyBiZW5lYXRoIHRoZSBoZWFkZXIgaW5zaWRlIHRoZSBzYW1lIGNlbGwuXHJcbiAgaWYgKHQuZW5hYmxlZCAmJiB0LmxvYWRhYmxlICYmIHNlY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBuZXN0ZWQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgbmVzdGVkLmNsYXNzTmFtZSA9XHJcbiAgICAgIFwiZmxleCBmbGV4LWNvbCBkaXZpZGUteS1bMC41cHhdIGRpdmlkZS10b2tlbi1ib3JkZXIgYm9yZGVyLXQtWzAuNXB4XSBib3JkZXItdG9rZW4tYm9yZGVyXCI7XHJcbiAgICBmb3IgKGNvbnN0IHMgb2Ygc2VjdGlvbnMpIHtcclxuICAgICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgIGJvZHkuY2xhc3NOYW1lID0gXCJwLTNcIjtcclxuICAgICAgdHJ5IHtcbiAgICAgICAgcy5yZW5kZXIoYm9keSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGJvZHkuYXBwZW5kQ2hpbGQoZXJyb3JSb3coXCJFcnJvciByZW5kZXJpbmcgdHdlYWsgc2VjdGlvblwiLCAoZSBhcyBFcnJvcikubWVzc2FnZSkpO1xuICAgICAgfVxuICAgICAgbmVzdGVkLmFwcGVuZENoaWxkKGJvZHkpO1xyXG4gICAgfVxyXG4gICAgY2VsbC5hcHBlbmRDaGlsZChuZXN0ZWQpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGNlbGw7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlckF1dGhvcihhdXRob3I6IFR3ZWFrTWFuaWZlc3RbXCJhdXRob3JcIl0pOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICBpZiAoIWF1dGhvcikgcmV0dXJuIG51bGw7XHJcbiAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIHdyYXAuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTFcIjtcclxuICBpZiAodHlwZW9mIGF1dGhvciA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgd3JhcC50ZXh0Q29udGVudCA9IGBieSAke2F1dGhvcn1gO1xyXG4gICAgcmV0dXJuIHdyYXA7XHJcbiAgfVxyXG4gIHdyYXAuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJieSBcIikpO1xyXG4gIGlmIChhdXRob3IudXJsKSB7XHJcbiAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XHJcbiAgICBhLmhyZWYgPSBhdXRob3IudXJsO1xyXG4gICAgYS50YXJnZXQgPSBcIl9ibGFua1wiO1xyXG4gICAgYS5yZWwgPSBcIm5vcmVmZXJyZXJcIjtcclxuICAgIGEuY2xhc3NOYW1lID0gXCJpbmxpbmUtZmxleCB0ZXh0LXRva2VuLXRleHQtbGluay1mb3JlZ3JvdW5kIGhvdmVyOnVuZGVybGluZVwiO1xyXG4gICAgYS50ZXh0Q29udGVudCA9IGF1dGhvci5uYW1lO1xyXG4gICAgd3JhcC5hcHBlbmRDaGlsZChhKTtcclxuICB9IGVsc2Uge1xyXG4gICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gICAgc3Bhbi50ZXh0Q29udGVudCA9IGF1dGhvci5uYW1lO1xyXG4gICAgd3JhcC5hcHBlbmRDaGlsZChzcGFuKTtcclxuICB9XHJcbiAgcmV0dXJuIHdyYXA7XG59XG5cbmZ1bmN0aW9uIGZpbHRlcmVkVHdlYWtzKHR3ZWFrczogTGlzdGVkVHdlYWtbXSk6IExpc3RlZFR3ZWFrW10ge1xuICBjb25zdCBxID0gc3RhdGUudHdlYWtzU2VhcmNoLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICByZXR1cm4gdHdlYWtzLmZpbHRlcigodCkgPT4ge1xuICAgIGNvbnN0IGhheXN0YWNrID0gW1xuICAgICAgdC5tYW5pZmVzdC5uYW1lLFxuICAgICAgdC5tYW5pZmVzdC5pZCxcbiAgICAgIHQubWFuaWZlc3QuZGVzY3JpcHRpb24sXG4gICAgICB0Lm1hbmlmZXN0LmdpdGh1YlJlcG8sXG4gICAgICAuLi4odC5tYW5pZmVzdC50YWdzID8/IFtdKSxcbiAgICAgIC4uLmZyaWVuZGx5Q2FwYWJpbGl0eUxhYmVscyh0LmNhcGFiaWxpdGllcyA/PyBbXSksXG4gICAgICB0LmxvYWRFcnJvcixcbiAgICBdLmZpbHRlcihCb29sZWFuKS5qb2luKFwiIFwiKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChxICYmICFoYXlzdGFjay5pbmNsdWRlcyhxKSkgcmV0dXJuIGZhbHNlO1xuICAgIHN3aXRjaCAoc3RhdGUudHdlYWtzRmlsdGVyKSB7XG4gICAgICBjYXNlIFwiYXR0ZW50aW9uXCI6IHJldHVybiBpc0F0dGVudGlvblR3ZWFrKHQpO1xuICAgICAgY2FzZSBcInVwZGF0ZXNcIjogcmV0dXJuICEhdC51cGRhdGU/LnVwZGF0ZUF2YWlsYWJsZTtcbiAgICAgIGNhc2UgXCJlbmFibGVkXCI6IHJldHVybiB0LmVuYWJsZWQgJiYgdC5sb2FkYWJsZTtcbiAgICAgIGNhc2UgXCJkaXNhYmxlZFwiOiByZXR1cm4gIXQuZW5hYmxlZDtcbiAgICAgIGRlZmF1bHQ6IHJldHVybiB0cnVlO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHR3ZWFrR3JvdXBzKHR3ZWFrczogTGlzdGVkVHdlYWtbXSk6IEFycmF5PHsgdGl0bGU6IHN0cmluZzsgaXRlbXM6IExpc3RlZFR3ZWFrW10gfT4ge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGNvbnN0IHRha2UgPSAocHJlZGljYXRlOiAodDogTGlzdGVkVHdlYWspID0+IGJvb2xlYW4pOiBMaXN0ZWRUd2Vha1tdID0+IHtcbiAgICBjb25zdCBvdXQ6IExpc3RlZFR3ZWFrW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHR3ZWFrIG9mIHR3ZWFrcykge1xuICAgICAgaWYgKHNlZW4uaGFzKHR3ZWFrLm1hbmlmZXN0LmlkKSkgY29udGludWU7XG4gICAgICBpZiAoIXByZWRpY2F0ZSh0d2VhaykpIGNvbnRpbnVlO1xuICAgICAgc2Vlbi5hZGQodHdlYWsubWFuaWZlc3QuaWQpO1xuICAgICAgb3V0LnB1c2godHdlYWspO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xuICB9O1xuICByZXR1cm4gW1xuICAgIHsgdGl0bGU6IFwiTmVlZHMgQXR0ZW50aW9uXCIsIGl0ZW1zOiB0YWtlKGlzQXR0ZW50aW9uVHdlYWspIH0sXG4gICAgeyB0aXRsZTogXCJVcGRhdGVzIEF2YWlsYWJsZVwiLCBpdGVtczogdGFrZSgodCkgPT4gISF0LnVwZGF0ZT8udXBkYXRlQXZhaWxhYmxlKSB9LFxuICAgIHsgdGl0bGU6IFwiRW5hYmxlZFwiLCBpdGVtczogdGFrZSgodCkgPT4gdC5lbmFibGVkKSB9LFxuICAgIHsgdGl0bGU6IFwiRGlzYWJsZWRcIiwgaXRlbXM6IHRha2UoKHQpID0+ICF0LmVuYWJsZWQpIH0sXG4gIF07XG59XG5cbmZ1bmN0aW9uIGlzQXR0ZW50aW9uVHdlYWsodDogTGlzdGVkVHdlYWspOiBib29sZWFuIHtcbiAgcmV0dXJuICF0LmxvYWRhYmxlIHx8ICF0LmVudHJ5RXhpc3RzIHx8ICEhdC5sb2FkRXJyb3I7XG59XG5cbmZ1bmN0aW9uIGhhc01haW5Qcm9jZXNzQWNjZXNzKHQ6IExpc3RlZFR3ZWFrKTogYm9vbGVhbiB7XG4gIHJldHVybiAodC5jYXBhYmlsaXRpZXMgPz8gW10pLnNvbWUoKGMpID0+IHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gYy50b0xvd2VyQ2FzZSgpO1xuICAgIHJldHVybiBub3JtYWxpemVkID09PSBcIm1haW4gcHJvY2Vzc1wiIHx8IG5vcm1hbGl6ZWQgPT09IFwibWFpbiBwcm9jZXNzIGFjY2Vzc1wiO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZnJpZW5kbHlDYXBhYmlsaXR5TGFiZWxzKGNhcGFiaWxpdGllczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IG1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICBcInJlbmRlcmVyIHVpXCI6IFwiUmVuZGVyZXIgVUlcIixcbiAgICBcIm1haW4gcHJvY2Vzc1wiOiBcIk1haW4gUHJvY2VzcyBBY2Nlc3NcIixcbiAgICBcImlzb2xhdGVkIHN0b3JhZ2VcIjogXCJMb2NhbCBEYXRhIFN0b3JhZ2VcIixcbiAgICBcInNjb3BlZCBpcGNcIjogXCJTY29wZWQgSVBDXCIsXG4gICAgXCJjdXN0b20gZW50cnlcIjogXCJDdXN0b20gRW50cnlcIixcbiAgICBcInJ1bnRpbWUgZ2F0ZVwiOiBcIlJ1bnRpbWUgUmVxdWlyZW1lbnRcIixcbiAgfTtcbiAgY29uc3QgbGFiZWxzID0gY2FwYWJpbGl0aWVzLm1hcCgoYykgPT4gbWFwW2MudG9Mb3dlckNhc2UoKV0gPz8gYyk7XG4gIHJldHVybiBbLi4ubmV3IFNldChsYWJlbHMpXTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0RGF0ZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgcmV0dXJuIE51bWJlci5pc05hTihkYXRlLmdldFRpbWUoKSkgPyB2YWx1ZSA6IGRhdGUudG9Mb2NhbGVTdHJpbmcoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZFJ1bnRpbWVIZWFsdGgoKTogUHJvbWlzZTxSdW50aW1lSGVhbHRoIHwgbnVsbD4ge1xuICByZXR1cm4gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6cnVudGltZS1oZWFsdGhcIikuY2F0Y2goKCkgPT4gbnVsbCkpIGFzIFJ1bnRpbWVIZWFsdGggfCBudWxsO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbnZva2VBY3Rpb24oXG4gIGtleTogc3RyaW5nLFxuICBwZW5kaW5nOiBzdHJpbmcsXG4gIHN1Y2Nlc3M6IHN0cmluZyxcbiAgYWN0aW9uOiAoKSA9PiBQcm9taXNlPHVua25vd24+LFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHN0YXRlLmZlZWRiYWNrLnNldChrZXksIHsga2luZDogXCJpbmZvXCIsIG1lc3NhZ2U6IHBlbmRpbmcgfSk7XG4gIHJlcmVuZGVyKCk7XG4gIHRyeSB7XG4gICAgYXdhaXQgYWN0aW9uKCk7XG4gICAgc3RhdGUuZmVlZGJhY2suc2V0KGtleSwgeyBraW5kOiBcInN1Y2Nlc3NcIiwgbWVzc2FnZTogc3VjY2VzcyB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN0YXRlLmZlZWRiYWNrLnNldChrZXksIHsga2luZDogXCJlcnJvclwiLCBtZXNzYWdlOiBTdHJpbmcoZSkgfSk7XG4gIH1cbiAgcmVyZW5kZXIoKTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGNvbXBvbmVudHMgXHUyNTAwXHUyNTAwXG5cclxuLyoqIFRoZSBmdWxsIHBhbmVsIHNoZWxsICh0b29sYmFyICsgc2Nyb2xsICsgaGVhZGluZyArIHNlY3Rpb25zIHdyYXApLiAqL1xyXG5mdW5jdGlvbiBwYW5lbFNoZWxsKFxyXG4gIHRpdGxlOiBzdHJpbmcsXHJcbiAgc3VidGl0bGU/OiBzdHJpbmcsXHJcbik6IHsgb3V0ZXI6IEhUTUxFbGVtZW50OyBzZWN0aW9uc1dyYXA6IEhUTUxFbGVtZW50IH0ge1xyXG4gIGNvbnN0IG91dGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBvdXRlci5jbGFzc05hbWUgPSBcIm1haW4tc3VyZmFjZSBmbGV4IGgtZnVsbCBtaW4taC0wIGZsZXgtY29sXCI7XHJcblxyXG4gIGNvbnN0IHRvb2xiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRvb2xiYXIuY2xhc3NOYW1lID1cclxuICAgIFwiZHJhZ2dhYmxlIGZsZXggaXRlbXMtY2VudGVyIHB4LXBhbmVsIGVsZWN0cm9uOmgtdG9vbGJhciBleHRlbnNpb246aC10b29sYmFyLXNtXCI7XHJcbiAgb3V0ZXIuYXBwZW5kQ2hpbGQodG9vbGJhcik7XHJcblxyXG4gIGNvbnN0IHNjcm9sbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgc2Nyb2xsLmNsYXNzTmFtZSA9IFwiZmxleC0xIG92ZXJmbG93LXktYXV0byBwLXBhbmVsXCI7XHJcbiAgb3V0ZXIuYXBwZW5kQ2hpbGQoc2Nyb2xsKTtcclxuXHJcbiAgY29uc3QgaW5uZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGlubmVyLmNsYXNzTmFtZSA9XHJcbiAgICBcIm14LWF1dG8gZmxleCB3LWZ1bGwgZmxleC1jb2wgbWF4LXctMnhsIGVsZWN0cm9uOm1pbi13LVtjYWxjKDMyMHB4KnZhcigtLWNvZGV4LXdpbmRvdy16b29tKSldXCI7XHJcbiAgc2Nyb2xsLmFwcGVuZENoaWxkKGlubmVyKTtcclxuXHJcbiAgY29uc3QgaGVhZGVyV3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyV3JhcC5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtMyBwYi1wYW5lbFwiO1xyXG4gIGNvbnN0IGhlYWRlcklubmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoZWFkZXJJbm5lci5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgZmxleC1jb2wgZ2FwLTEuNSBwYi1wYW5lbFwiO1xyXG4gIGNvbnN0IGhlYWRpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGhlYWRpbmcuY2xhc3NOYW1lID0gXCJlbGVjdHJvbjpoZWFkaW5nLWxnIGhlYWRpbmctYmFzZSB0cnVuY2F0ZVwiO1xyXG4gIGhlYWRpbmcudGV4dENvbnRlbnQgPSB0aXRsZTtcclxuICBoZWFkZXJJbm5lci5hcHBlbmRDaGlsZChoZWFkaW5nKTtcclxuICBpZiAoc3VidGl0bGUpIHtcclxuICAgIGNvbnN0IHN1YiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBzdWIuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IHRleHQtc21cIjtcclxuICAgIHN1Yi50ZXh0Q29udGVudCA9IHN1YnRpdGxlO1xyXG4gICAgaGVhZGVySW5uZXIuYXBwZW5kQ2hpbGQoc3ViKTtcclxuICB9XHJcbiAgaGVhZGVyV3JhcC5hcHBlbmRDaGlsZChoZWFkZXJJbm5lcik7XHJcbiAgaW5uZXIuYXBwZW5kQ2hpbGQoaGVhZGVyV3JhcCk7XHJcblxyXG4gIGNvbnN0IHNlY3Rpb25zV3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgc2VjdGlvbnNXcmFwLmNsYXNzTmFtZSA9IFwiZmxleCBmbGV4LWNvbCBnYXAtW3ZhcigtLXBhZGRpbmctcGFuZWwpXVwiO1xyXG4gIGlubmVyLmFwcGVuZENoaWxkKHNlY3Rpb25zV3JhcCk7XHJcblxyXG4gIHJldHVybiB7IG91dGVyLCBzZWN0aW9uc1dyYXAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2VjdGlvblRpdGxlKHRleHQ6IHN0cmluZywgdHJhaWxpbmc/OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgdGl0bGVSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRpdGxlUm93LmNsYXNzTmFtZSA9XHJcbiAgICBcImZsZXggaC10b29sYmFyIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTIgcHgtMCBweS0wXCI7XHJcbiAgY29uc3QgdGl0bGVJbm5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGVJbm5lci5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LTEgZmxleC1jb2wgZ2FwLTFcIjtcclxuICBjb25zdCB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0LmNsYXNzTmFtZSA9IFwidGV4dC1iYXNlIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgdC50ZXh0Q29udGVudCA9IHRleHQ7XHJcbiAgdGl0bGVJbm5lci5hcHBlbmRDaGlsZCh0KTtcclxuICB0aXRsZVJvdy5hcHBlbmRDaGlsZCh0aXRsZUlubmVyKTtcclxuICBpZiAodHJhaWxpbmcpIHtcclxuICAgIGNvbnN0IHJpZ2h0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHJpZ2h0LmNsYXNzTmFtZSA9IFwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTJcIjtcclxuICAgIHJpZ2h0LmFwcGVuZENoaWxkKHRyYWlsaW5nKTtcclxuICAgIHRpdGxlUm93LmFwcGVuZENoaWxkKHJpZ2h0KTtcclxuICB9XHJcbiAgcmV0dXJuIHRpdGxlUm93O1xufVxuXG5mdW5jdGlvbiBzdGF0dXNCYWRnZShsYWJlbDogc3RyaW5nLCBraW5kOiBcImluZm9cIiB8IFwic3VjY2Vzc1wiIHwgXCJ3YXJuXCIgfCBcImRhbmdlclwiIHwgXCJtdXRlZFwiID0gXCJtdXRlZFwiKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuICBjb25zdCB0b25lID1cbiAgICBraW5kID09PSBcImRhbmdlclwiID8gXCJ0ZXh0LXRva2VuLWNoYXJ0cy1yZWRcIlxuICAgIDoga2luZCA9PT0gXCJ3YXJuXCIgPyBcInRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCJcbiAgICA6IGtpbmQgPT09IFwic3VjY2Vzc1wiID8gXCJ0ZXh0LXRva2VuLWNoYXJ0cy1ncmVlblwiXG4gICAgOiBraW5kID09PSBcImluZm9cIiA/IFwidGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIlxuICAgIDogXCJ0ZXh0LXRva2VuLWRlc2NyaXB0aW9uLWZvcmVncm91bmRcIjtcbiAgYmFkZ2UuY2xhc3NOYW1lID1cbiAgICBgcm91bmRlZC1mdWxsIGJvcmRlciBib3JkZXItdG9rZW4tYm9yZGVyIGJnLXRva2VuLWZvcmVncm91bmQvNSBweC0yIHB5LTAuNSB0ZXh0LVsxMXB4XSBmb250LW1lZGl1bSAke3RvbmV9YDtcbiAgYmFkZ2UudGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgcmV0dXJuIGJhZGdlO1xufVxuXG5mdW5jdGlvbiBub3RpY2VSb3coXG4gIHRpdGxlVGV4dDogc3RyaW5nLFxuICBkZXNjcmlwdGlvbjogc3RyaW5nLFxuICBraW5kOiBGZWVkYmFja0tpbmQgfCBcIndhcm5cIiA9IFwiaW5mb1wiLFxuKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICByb3cuY2xhc3NOYW1lID0gXCJmbGV4IGZsZXgtY29sIGdhcC0xIHAtM1wiO1xuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gIHRpdGxlLmNsYXNzTmFtZSA9XG4gICAga2luZCA9PT0gXCJlcnJvclwiID8gXCJ0ZXh0LXNtIGZvbnQtbWVkaXVtIHRleHQtdG9rZW4tY2hhcnRzLXJlZFwiXG4gICAgOiBraW5kID09PSBcInN1Y2Nlc3NcIiA/IFwidGV4dC1zbSBmb250LW1lZGl1bSB0ZXh0LXRva2VuLWNoYXJ0cy1ncmVlblwiXG4gICAgOiBcInRleHQtc20gZm9udC1tZWRpdW0gdGV4dC10b2tlbi10ZXh0LXByaW1hcnlcIjtcbiAgdGl0bGUudGV4dENvbnRlbnQgPSB0aXRsZVRleHQ7XG4gIGNvbnN0IGRlc2MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBkZXNjLmNsYXNzTmFtZSA9IFwidGV4dC10b2tlbi10ZXh0LXNlY29uZGFyeSB0ZXh0LXNtXCI7XG4gIGRlc2MudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcbiAgcm93LmFwcGVuZCh0aXRsZSwgZGVzYyk7XG4gIHJldHVybiByb3c7XG59XG5cbmZ1bmN0aW9uIGxvYWRpbmdSb3codGl0bGU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgcmV0dXJuIHJvd1NpbXBsZSh0aXRsZSwgZGVzY3JpcHRpb24pO1xufVxuXG5mdW5jdGlvbiBlcnJvclJvdyh0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICByZXR1cm4gbm90aWNlUm93KHRpdGxlLCBkZXNjcmlwdGlvbiwgXCJlcnJvclwiKTtcbn1cblxuZnVuY3Rpb24gZW1wdHlTdGF0ZSh0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogSFRNTEVsZW1lbnQge1xuICBjb25zdCBjYXJkID0gcm91bmRlZENhcmQoKTtcbiAgY2FyZC5hcHBlbmRDaGlsZChyb3dTaW1wbGUodGl0bGUsIGRlc2NyaXB0aW9uKSk7XG4gIHJldHVybiBjYXJkO1xufVxuXG5mdW5jdGlvbiBpbmxpbmVGZWVkYmFjayhraW5kOiBGZWVkYmFja0tpbmQsIG1lc3NhZ2U6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcbiAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBlbC5jbGFzc05hbWUgPVxuICAgIGtpbmQgPT09IFwiZXJyb3JcIiA/IFwidGV4dC14cyB0ZXh0LXRva2VuLWNoYXJ0cy1yZWRcIlxuICAgIDoga2luZCA9PT0gXCJzdWNjZXNzXCIgPyBcInRleHQteHMgdGV4dC10b2tlbi1jaGFydHMtZ3JlZW5cIlxuICAgIDogXCJ0ZXh0LXhzIHRleHQtdG9rZW4tdGV4dC1zZWNvbmRhcnlcIjtcbiAgZWwudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuICByZXR1cm4gZWw7XG59XG5cbi8qKlxuICogQ29kZXgncyBcIk9wZW4gY29uZmlnLnRvbWxcIi1zdHlsZSB0cmFpbGluZyBidXR0b246IGdob3N0IGJvcmRlciwgbXV0ZWRcbiAqIGxhYmVsLCB0b3AtcmlnaHQgZGlhZ29uYWwgYXJyb3cgaWNvbi4gTWFya3VwIG1pcnJvcnMgQ29uZmlndXJhdGlvbiBwYW5lbC5cclxuICovXHJcbmZ1bmN0aW9uIG9wZW5JblBsYWNlQnV0dG9uKGxhYmVsOiBzdHJpbmcsIG9uQ2xpY2s6ICgpID0+IHZvaWQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XHJcbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgYnRuLmNsYXNzTmFtZSA9XHJcbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMSBib3JkZXIgd2hpdGVzcGFjZS1ub3dyYXAgZm9jdXM6b3V0bGluZS1ub25lIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwIHJvdW5kZWQtbGcgdGV4dC10b2tlbi1kZXNjcmlwdGlvbi1mb3JlZ3JvdW5kIGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRhdGEtW3N0YXRlPW9wZW5dOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBib3JkZXItdHJhbnNwYXJlbnQgaC10b2tlbi1idXR0b24tY29tcG9zZXIgcHgtMiBweS0wIHRleHQtYmFzZSBsZWFkaW5nLVsxOHB4XVwiO1xyXG4gIGJ0bi5pbm5lckhUTUwgPVxyXG4gICAgYCR7bGFiZWx9YCArXHJcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLTJ4c1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNMTQuMzM0OSAxMy4zMzAxVjYuNjA2NDVMNS40NzA2NSAxNS40NzA3QzUuMjEwOTUgMTUuNzMwNCA0Ljc4ODk1IDE1LjczMDQgNC41MjkyNSAxNS40NzA3QzQuMjY5NTUgMTUuMjExIDQuMjY5NTUgMTQuNzg5IDQuNTI5MjUgMTQuNTI5M0wxMy4zOTM1IDUuNjY1MDRINi42NjAxMUM2LjI5Mjg0IDUuNjY1MDQgNS45OTUwNyA1LjM2NzI3IDUuOTk1MDcgNUM1Ljk5NTA3IDQuNjMyNzMgNi4yOTI4NCA0LjMzNDk2IDYuNjYwMTEgNC4zMzQ5NkgxNC45OTk5TDE1LjEzMzcgNC4zNDg2M0MxNS40MzY5IDQuNDEwNTcgMTUuNjY1IDQuNjc4NTcgMTUuNjY1IDVWMTMuMzMwMUMxNS42NjQ5IDEzLjY5NzMgMTUuMzY3MiAxMy45OTUxIDE0Ljk5OTkgMTMuOTk1MUMxNC42MzI3IDEzLjk5NTEgMTQuMzM1IDEzLjY5NzMgMTQuMzM0OSAxMy4zMzAxWlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIj48L3BhdGg+YCArXHJcbiAgICBgPC9zdmc+YDtcclxuICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XHJcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgb25DbGljaygpO1xyXG4gIH0pO1xyXG4gIHJldHVybiBidG47XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbXBhY3RCdXR0b24obGFiZWw6IHN0cmluZywgb25DbGljazogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgcmV0dXJuIGFjdGlvbkJ1dHRvbihsYWJlbCwgbGFiZWwsIChfYnRuKSA9PiB7XG4gICAgb25DbGljaygpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gYWN0aW9uQnV0dG9uKFxuICBsYWJlbDogc3RyaW5nLFxuICBhcmlhTGFiZWw6IHN0cmluZyxcbiAgb25DbGljazogKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+LFxuKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICBidG4udHlwZSA9IFwiYnV0dG9uXCI7XG4gIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIGFyaWFMYWJlbCk7XG4gIGJ0bi5jbGFzc05hbWUgPVxuICAgIFwiYm9yZGVyLXRva2VuLWJvcmRlciB1c2VyLXNlbGVjdC1ub25lIG5vLWRyYWcgY3Vyc29yLWludGVyYWN0aW9uIGlubGluZS1mbGV4IGgtOCBpdGVtcy1jZW50ZXIgd2hpdGVzcGFjZS1ub3dyYXAgcm91bmRlZC1sZyBib3JkZXIgcHgtMiB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5IGVuYWJsZWQ6aG92ZXI6YmctdG9rZW4tbGlzdC1ob3Zlci1iYWNrZ3JvdW5kIGRpc2FibGVkOmN1cnNvci1ub3QtYWxsb3dlZCBkaXNhYmxlZDpvcGFjaXR5LTQwXCI7XG4gIGJ0bi50ZXh0Q29udGVudCA9IGxhYmVsO1xuICBidG4uZGF0YXNldC5jb2RleHBwTGFiZWwgPSBsYWJlbDtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGF3YWl0IG9uQ2xpY2soYnRuKTtcbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cbmZ1bmN0aW9uIGljb25CdXR0b24oXG4gIGxhYmVsOiBzdHJpbmcsXG4gIGljb25Tdmc6IHN0cmluZyxcbiAgb25DbGljazogKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+LFxuKTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidG4gPSBhY3Rpb25CdXR0b24oXCJcIiwgbGFiZWwsIG9uQ2xpY2spO1xuICBidG4uY2xhc3NOYW1lID1cbiAgICBcImJvcmRlci10b2tlbi1ib3JkZXIgdXNlci1zZWxlY3Qtbm9uZSBuby1kcmFnIGN1cnNvci1pbnRlcmFjdGlvbiBpbmxpbmUtZmxleCBoLTggdy04IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciByb3VuZGVkLWxnIGJvcmRlciB0ZXh0LXRva2VuLXRleHQtcHJpbWFyeSBlbmFibGVkOmhvdmVyOmJnLXRva2VuLWxpc3QtaG92ZXItYmFja2dyb3VuZCBkaXNhYmxlZDpjdXJzb3Itbm90LWFsbG93ZWQgZGlzYWJsZWQ6b3BhY2l0eS00MFwiO1xuICBidG4uaW5uZXJIVE1MID0gaWNvblN2ZztcbiAgYnRuLmRhdGFzZXQuY29kZXhwcExhYmVsID0gXCJcIjtcbiAgcmV0dXJuIGJ0bjtcbn1cblxuZnVuY3Rpb24gc2V0QnV0dG9uUGVuZGluZyhidG46IEhUTUxCdXR0b25FbGVtZW50LCBwZW5kaW5nOiBib29sZWFuLCBsYWJlbCA9IFwiV29ya2luZ1wiKTogdm9pZCB7XG4gIGJ0bi5kaXNhYmxlZCA9IHBlbmRpbmc7XG4gIGlmIChidG4uZGF0YXNldC5jb2RleHBwTGFiZWwpIHtcbiAgICBidG4udGV4dENvbnRlbnQgPSBwZW5kaW5nID8gbGFiZWwgOiBidG4uZGF0YXNldC5jb2RleHBwTGFiZWw7XG4gIH1cbn1cblxyXG5mdW5jdGlvbiByb3VuZGVkQ2FyZCgpOiBIVE1MRWxlbWVudCB7XHJcbiAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgY2FyZC5jbGFzc05hbWUgPVxyXG4gICAgXCJib3JkZXItdG9rZW4tYm9yZGVyIGZsZXggZmxleC1jb2wgZGl2aWRlLXktWzAuNXB4XSBkaXZpZGUtdG9rZW4tYm9yZGVyIHJvdW5kZWQtbGcgYm9yZGVyXCI7XHJcbiAgY2FyZC5zZXRBdHRyaWJ1dGUoXHJcbiAgICBcInN0eWxlXCIsXHJcbiAgICBcImJhY2tncm91bmQtY29sb3I6IHZhcigtLWNvbG9yLWJhY2tncm91bmQtcGFuZWwsIHZhcigtLWNvbG9yLXRva2VuLWJnLWZvZykpO1wiLFxyXG4gICk7XHJcbiAgcmV0dXJuIGNhcmQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJvd1NpbXBsZSh0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHJvdy5jbGFzc05hbWUgPSBcImZsZXggaXRlbXMtY2VudGVyIGp1c3RpZnktYmV0d2VlbiBnYXAtNCBwLTNcIjtcclxuICBjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsZWZ0LmNsYXNzTmFtZSA9IFwiZmxleCBtaW4tdy0wIGl0ZW1zLWNlbnRlciBnYXAtM1wiO1xyXG4gIGNvbnN0IHN0YWNrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzdGFjay5jbGFzc05hbWUgPSBcImZsZXggbWluLXctMCBmbGV4LWNvbCBnYXAtMVwiO1xyXG4gIGlmICh0aXRsZSkge1xyXG4gICAgY29uc3QgdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICB0LmNsYXNzTmFtZSA9IFwibWluLXctMCB0ZXh0LXNtIHRleHQtdG9rZW4tdGV4dC1wcmltYXJ5XCI7XHJcbiAgICB0LnRleHRDb250ZW50ID0gdGl0bGU7XHJcbiAgICBzdGFjay5hcHBlbmRDaGlsZCh0KTtcclxuICB9XHJcbiAgaWYgKGRlc2NyaXB0aW9uKSB7XHJcbiAgICBjb25zdCBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGQuY2xhc3NOYW1lID0gXCJ0ZXh0LXRva2VuLXRleHQtc2Vjb25kYXJ5IG1pbi13LTAgdGV4dC1zbVwiO1xyXG4gICAgZC50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xyXG4gICAgc3RhY2suYXBwZW5kQ2hpbGQoZCk7XHJcbiAgfVxyXG4gIGxlZnQuYXBwZW5kQ2hpbGQoc3RhY2spO1xyXG4gIHJvdy5hcHBlbmRDaGlsZChsZWZ0KTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG4vKipcclxuICogQ29kZXgtc3R5bGVkIHRvZ2dsZSBzd2l0Y2guIE1hcmt1cCBtaXJyb3JzIHRoZSBHZW5lcmFsID4gUGVybWlzc2lvbnMgcm93XHJcbiAqIHN3aXRjaCB3ZSBjYXB0dXJlZDogb3V0ZXIgYnV0dG9uIChyb2xlPXN3aXRjaCksIGlubmVyIHBpbGwsIHNsaWRpbmcga25vYi5cclxuICovXHJcbmZ1bmN0aW9uIHN3aXRjaENvbnRyb2woXG4gIGluaXRpYWw6IGJvb2xlYW4sXG4gIG9uQ2hhbmdlOiAobmV4dDogYm9vbGVhbikgPT4gYm9vbGVhbiB8IHZvaWQgfCBQcm9taXNlPGJvb2xlYW4gfCB2b2lkPixcbiAgb3B0czogeyBkaXNhYmxlZD86IGJvb2xlYW47IGFyaWFMYWJlbD86IHN0cmluZyB9ID0ge30sXG4pOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gIGJ0bi50eXBlID0gXCJidXR0b25cIjtcbiAgYnRuLnNldEF0dHJpYnV0ZShcInJvbGVcIiwgXCJzd2l0Y2hcIik7XG4gIGlmIChvcHRzLmFyaWFMYWJlbCkgYnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgb3B0cy5hcmlhTGFiZWwpO1xuXHJcbiAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIGNvbnN0IGtub2IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICBrbm9iLmNsYXNzTmFtZSA9XHJcbiAgICBcInJvdW5kZWQtZnVsbCBib3JkZXIgYm9yZGVyLVtjb2xvcjp2YXIoLS1ncmF5LTApXSBiZy1bY29sb3I6dmFyKC0tZ3JheS0wKV0gc2hhZG93LXNtIHRyYW5zaXRpb24tdHJhbnNmb3JtIGR1cmF0aW9uLTIwMCBlYXNlLW91dCBoLTQgdy00XCI7XHJcbiAgcGlsbC5hcHBlbmRDaGlsZChrbm9iKTtcclxuXHJcbiAgY29uc3QgYXBwbHkgPSAob246IGJvb2xlYW4pOiB2b2lkID0+IHtcclxuICAgIGJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWNoZWNrZWRcIiwgU3RyaW5nKG9uKSk7XHJcbiAgICBidG4uZGF0YXNldC5zdGF0ZSA9IG9uID8gXCJjaGVja2VkXCIgOiBcInVuY2hlY2tlZFwiO1xyXG4gICAgYnRuLmNsYXNzTmFtZSA9XHJcbiAgICAgIFwiaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIHRleHQtc20gZm9jdXMtdmlzaWJsZTpvdXRsaW5lLW5vbmUgZm9jdXMtdmlzaWJsZTpyaW5nLTIgZm9jdXMtdmlzaWJsZTpyaW5nLXRva2VuLWZvY3VzLWJvcmRlciBmb2N1cy12aXNpYmxlOnJvdW5kZWQtZnVsbCBjdXJzb3ItaW50ZXJhY3Rpb25cIjtcclxuICAgIHBpbGwuY2xhc3NOYW1lID0gYHJlbGF0aXZlIGlubGluZS1mbGV4IHNocmluay0wIGl0ZW1zLWNlbnRlciByb3VuZGVkLWZ1bGwgdHJhbnNpdGlvbi1jb2xvcnMgZHVyYXRpb24tMjAwIGVhc2Utb3V0IGgtNSB3LTggJHtcclxuICAgICAgb24gPyBcImJnLXRva2VuLWNoYXJ0cy1ibHVlXCIgOiBcImJnLXRva2VuLWZvcmVncm91bmQvMjBcIlxyXG4gICAgfWA7XHJcbiAgICBwaWxsLmRhdGFzZXQuc3RhdGUgPSBvbiA/IFwiY2hlY2tlZFwiIDogXCJ1bmNoZWNrZWRcIjtcclxuICAgIGtub2IuZGF0YXNldC5zdGF0ZSA9IG9uID8gXCJjaGVja2VkXCIgOiBcInVuY2hlY2tlZFwiO1xyXG4gICAga25vYi5zdHlsZS50cmFuc2Zvcm0gPSBvbiA/IFwidHJhbnNsYXRlWCgxNHB4KVwiIDogXCJ0cmFuc2xhdGVYKDJweClcIjtcclxuICB9O1xyXG4gIGFwcGx5KGluaXRpYWwpO1xuICBidG4uZGlzYWJsZWQgPSBvcHRzLmRpc2FibGVkID09PSB0cnVlO1xuXG4gIGJ0bi5hcHBlbmRDaGlsZChwaWxsKTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGlmIChidG4uZGlzYWJsZWQpIHJldHVybjtcbiAgICBjb25zdCBuZXh0ID0gYnRuLmdldEF0dHJpYnV0ZShcImFyaWEtY2hlY2tlZFwiKSAhPT0gXCJ0cnVlXCI7XG4gICAgYXBwbHkobmV4dCk7XG4gICAgYnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgb25DaGFuZ2UobmV4dCk7XG4gICAgICBpZiAocmVzdWx0ID09PSBmYWxzZSkgYXBwbHkoIW5leHQpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgYXBwbHkoIW5leHQpO1xuICAgICAgY29uc29sZS53YXJuKFwiW2NvZGV4LXBsdXNwbHVzXSBzd2l0Y2ggYWN0aW9uIGZhaWxlZFwiLCBlcnIpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBidG4uZGlzYWJsZWQgPSBvcHRzLmRpc2FibGVkID09PSB0cnVlO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBidG47XG59XG5cclxuZnVuY3Rpb24gZG90KCk6IEhUTUxFbGVtZW50IHtcclxuICBjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgcy5jbGFzc05hbWUgPSBcInRleHQtdG9rZW4tZGVzY3JpcHRpb24tZm9yZWdyb3VuZFwiO1xyXG4gIHMudGV4dENvbnRlbnQgPSBcIlx1MDBCN1wiO1xyXG4gIHJldHVybiBzO1xyXG59XHJcblxyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgaWNvbnMgXHUyNTAwXHUyNTAwXHJcblxyXG5mdW5jdGlvbiBjb25maWdJY29uU3ZnKCk6IHN0cmluZyB7XHJcbiAgLy8gU2xpZGVycyAvIHNldHRpbmdzIGdseXBoLiAyMHgyMCBjdXJyZW50Q29sb3IuXHJcbiAgcmV0dXJuIChcclxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNMyA1aDlNMTUgNWgyTTMgMTBoMk04IDEwaDlNMyAxNWgxMU0xNyAxNWgwXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiLz5gICtcclxuICAgIGA8Y2lyY2xlIGN4PVwiMTNcIiBjeT1cIjVcIiByPVwiMS42XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcclxuICAgIGA8Y2lyY2xlIGN4PVwiNlwiIGN5PVwiMTBcIiByPVwiMS42XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcclxuICAgIGA8Y2lyY2xlIGN4PVwiMTVcIiBjeT1cIjE1XCIgcj1cIjEuNlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIi8+YCArXHJcbiAgICBgPC9zdmc+YFxyXG4gICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHR3ZWFrc0ljb25TdmcoKTogc3RyaW5nIHtcclxuICAvLyBTcGFya2xlcyAvIFwiKytcIiBnbHlwaCBmb3IgdHdlYWtzLlxyXG4gIHJldHVybiAoXHJcbiAgICBgPHN2ZyB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMjBcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgY2xhc3M9XCJpY29uLXNtIGlubGluZS1ibG9jayBhbGlnbi1taWRkbGVcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcclxuICAgIGA8cGF0aCBkPVwiTTEwIDIuNSBMMTEuNCA4LjYgTDE3LjUgMTAgTDExLjQgMTEuNCBMMTAgMTcuNSBMOC42IDExLjQgTDIuNSAxMCBMOC42IDguNiBaXCIgZmlsbD1cImN1cnJlbnRDb2xvclwiLz5gICtcclxuICAgIGA8cGF0aCBkPVwiTTE1LjUgMyBMMTYgNSBMMTggNS41IEwxNiA2IEwxNS41IDggTDE1IDYgTDEzIDUuNSBMMTUgNSBaXCIgZmlsbD1cImN1cnJlbnRDb2xvclwiIG9wYWNpdHk9XCIwLjdcIi8+YCArXHJcbiAgICBgPC9zdmc+YFxyXG4gICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlZmF1bHRQYWdlSWNvblN2ZygpOiBzdHJpbmcge1xuICAvLyBEb2N1bWVudC9wYWdlIGdseXBoIGZvciB0d2Vhay1yZWdpc3RlcmVkIHBhZ2VzIHdpdGhvdXQgdGhlaXIgb3duIGljb24uXHJcbiAgcmV0dXJuIChcclxuICAgIGA8c3ZnIHdpZHRoPVwiMjBcIiBoZWlnaHQ9XCIyMFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBjbGFzcz1cImljb24tc20gaW5saW5lLWJsb2NrIGFsaWduLW1pZGRsZVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPmAgK1xyXG4gICAgYDxwYXRoIGQ9XCJNNSAzaDdsMyAzdjExYTEgMSAwIDAgMS0xIDFINWExIDEgMCAwIDEtMS0xVjRhMSAxIDAgMCAxIDEtMVpcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcclxuICAgIGA8cGF0aCBkPVwiTTEyIDN2M2ExIDEgMCAwIDAgMSAxaDJcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz5gICtcclxuICAgIGA8cGF0aCBkPVwiTTcgMTFoNk03IDE0aDRcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIvPmAgK1xyXG4gICAgYDwvc3ZnPmBcclxuICApO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoSWNvblN2ZygpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgIGA8c3ZnIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxOFwiIHZpZXdCb3g9XCIwIDAgMjAgMjBcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5gICtcbiAgICBgPHBhdGggZD1cIk00IDEwYTYgNiAwIDAgMSAxMC4yNC00LjI0TDE2IDcuNU0xNiA0djMuNWgtMy41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8cGF0aCBkPVwiTTE2IDEwYTYgNiAwIDAgMS0xMC4yNCA0LjI0TDQgMTIuNU00IDE2di0zLjVoMy41XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8L3N2Zz5gXG4gICk7XG59XG5cbmZ1bmN0aW9uIGZvbGRlckljb25TdmcoKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICBgPHN2ZyB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiB2aWV3Qm94PVwiMCAwIDIwIDIwXCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+YCArXG4gICAgYDxwYXRoIGQ9XCJNMyA2LjVBMi41IDIuNSAwIDAgMSA1LjUgNEg4bDEuNSAxLjhIMTQuNUEyLjUgMi41IDAgMCAxIDE3IDguM3Y1LjJBMi41IDIuNSAwIDAgMSAxNC41IDE2aC05QTIuNSAyLjUgMCAwIDEgMyAxMy41di03WlwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPmAgK1xuICAgIGA8L3N2Zz5gXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVJY29uVXJsKFxuICB1cmw6IHN0cmluZyxcclxuICB0d2Vha0Rpcjogc3RyaW5nLFxyXG4pOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcclxuICBpZiAoL14oaHR0cHM/OnxkYXRhOikvLnRlc3QodXJsKSkgcmV0dXJuIHVybDtcclxuICAvLyBSZWxhdGl2ZSBwYXRoIFx1MjE5MiBhc2sgbWFpbiB0byByZWFkIHRoZSBmaWxlIGFuZCByZXR1cm4gYSBkYXRhOiBVUkwuXHJcbiAgLy8gUmVuZGVyZXIgaXMgc2FuZGJveGVkIHNvIGZpbGU6Ly8gd29uJ3QgbG9hZCBkaXJlY3RseS5cclxuICBjb25zdCByZWwgPSB1cmwuc3RhcnRzV2l0aChcIi4vXCIpID8gdXJsLnNsaWNlKDIpIDogdXJsO1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gKGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZShcclxuICAgICAgXCJjb2RleHBwOnJlYWQtdHdlYWstYXNzZXRcIixcclxuICAgICAgdHdlYWtEaXIsXHJcbiAgICAgIHJlbCxcclxuICAgICkpIGFzIHN0cmluZztcclxuICB9IGNhdGNoIChlKSB7XHJcbiAgICBwbG9nKFwiaWNvbiBsb2FkIGZhaWxlZFwiLCB7IHVybCwgdHdlYWtEaXIsIGVycjogU3RyaW5nKGUpIH0pO1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgRE9NIGhldXJpc3RpY3MgXHUyNTAwXHUyNTAwXHJcblxyXG5mdW5jdGlvbiBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcclxuICAvLyBBbmNob3Igc3RyYXRlZ3kgZmlyc3QgKHdvdWxkIGJlIGlkZWFsIGlmIENvZGV4IHN3aXRjaGVzIHRvIDxhPikuXHJcbiAgY29uc3QgbGlua3MgPSBBcnJheS5mcm9tKFxyXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MQW5jaG9yRWxlbWVudD4oXCJhW2hyZWYqPScvc2V0dGluZ3MvJ11cIiksXHJcbiAgKTtcclxuICBpZiAobGlua3MubGVuZ3RoID49IDIpIHtcclxuICAgIGxldCBub2RlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBsaW5rc1swXS5wYXJlbnRFbGVtZW50O1xyXG4gICAgd2hpbGUgKG5vZGUpIHtcclxuICAgICAgY29uc3QgaW5zaWRlID0gbm9kZS5xdWVyeVNlbGVjdG9yQWxsKFwiYVtocmVmKj0nL3NldHRpbmdzLyddXCIpO1xyXG4gICAgICBpZiAoaW5zaWRlLmxlbmd0aCA+PSBNYXRoLm1heCgyLCBsaW5rcy5sZW5ndGggLSAxKSkgcmV0dXJuIG5vZGU7XHJcbiAgICAgIG5vZGUgPSBub2RlLnBhcmVudEVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBUZXh0LWNvbnRlbnQgbWF0Y2ggYWdhaW5zdCBDb2RleCdzIGtub3duIHNpZGViYXIgbGFiZWxzLlxyXG4gIGNvbnN0IEtOT1dOID0gW1xyXG4gICAgXCJHZW5lcmFsXCIsXHJcbiAgICBcIkFwcGVhcmFuY2VcIixcclxuICAgIFwiQ29uZmlndXJhdGlvblwiLFxyXG4gICAgXCJQZXJzb25hbGl6YXRpb25cIixcclxuICAgIFwiTUNQIHNlcnZlcnNcIixcclxuICAgIFwiTUNQIFNlcnZlcnNcIixcclxuICAgIFwiR2l0XCIsXHJcbiAgICBcIkVudmlyb25tZW50c1wiLFxyXG4gIF07XHJcbiAgY29uc3QgbWF0Y2hlczogSFRNTEVsZW1lbnRbXSA9IFtdO1xyXG4gIGNvbnN0IGFsbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxyXG4gICAgXCJidXR0b24sIGEsIFtyb2xlPSdidXR0b24nXSwgbGksIGRpdlwiLFxyXG4gICk7XHJcbiAgZm9yIChjb25zdCBlbCBvZiBBcnJheS5mcm9tKGFsbCkpIHtcclxuICAgIGNvbnN0IHQgPSAoZWwudGV4dENvbnRlbnQgPz8gXCJcIikudHJpbSgpO1xyXG4gICAgaWYgKHQubGVuZ3RoID4gMzApIGNvbnRpbnVlO1xyXG4gICAgaWYgKEtOT1dOLnNvbWUoKGspID0+IHQgPT09IGspKSBtYXRjaGVzLnB1c2goZWwpO1xyXG4gICAgaWYgKG1hdGNoZXMubGVuZ3RoID4gNTApIGJyZWFrO1xyXG4gIH1cclxuICBpZiAobWF0Y2hlcy5sZW5ndGggPj0gMikge1xyXG4gICAgbGV0IG5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG1hdGNoZXNbMF0ucGFyZW50RWxlbWVudDtcclxuICAgIHdoaWxlIChub2RlKSB7XHJcbiAgICAgIGxldCBjb3VudCA9IDA7XHJcbiAgICAgIGZvciAoY29uc3QgbSBvZiBtYXRjaGVzKSBpZiAobm9kZS5jb250YWlucyhtKSkgY291bnQrKztcclxuICAgICAgaWYgKGNvdW50ID49IE1hdGgubWluKDMsIG1hdGNoZXMubGVuZ3RoKSkgcmV0dXJuIG5vZGU7XHJcbiAgICAgIG5vZGUgPSBub2RlLnBhcmVudEVsZW1lbnQ7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5kQ29udGVudEFyZWEoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcclxuICBjb25zdCBzaWRlYmFyID0gZmluZFNpZGViYXJJdGVtc0dyb3VwKCk7XHJcbiAgaWYgKCFzaWRlYmFyKSByZXR1cm4gbnVsbDtcclxuICBsZXQgcGFyZW50ID0gc2lkZWJhci5wYXJlbnRFbGVtZW50O1xyXG4gIHdoaWxlIChwYXJlbnQpIHtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShwYXJlbnQuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W10pIHtcclxuICAgICAgaWYgKGNoaWxkID09PSBzaWRlYmFyIHx8IGNoaWxkLmNvbnRhaW5zKHNpZGViYXIpKSBjb250aW51ZTtcclxuICAgICAgY29uc3QgciA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICBpZiAoci53aWR0aCA+IDMwMCAmJiByLmhlaWdodCA+IDIwMCkgcmV0dXJuIGNoaWxkO1xyXG4gICAgfVxyXG4gICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQ7XHJcbiAgfVxyXG4gIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBtYXliZUR1bXBEb20oKTogdm9pZCB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHNpZGViYXIgPSBmaW5kU2lkZWJhckl0ZW1zR3JvdXAoKTtcclxuICAgIGlmIChzaWRlYmFyICYmICFzdGF0ZS5zaWRlYmFyRHVtcGVkKSB7XHJcbiAgICAgIHN0YXRlLnNpZGViYXJEdW1wZWQgPSB0cnVlO1xyXG4gICAgICBjb25zdCBzYlJvb3QgPSBzaWRlYmFyLnBhcmVudEVsZW1lbnQgPz8gc2lkZWJhcjtcclxuICAgICAgcGxvZyhgY29kZXggc2lkZWJhciBIVE1MYCwgc2JSb290Lm91dGVySFRNTC5zbGljZSgwLCAzMjAwMCkpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGVudCA9IGZpbmRDb250ZW50QXJlYSgpO1xyXG4gICAgaWYgKCFjb250ZW50KSB7XHJcbiAgICAgIGlmIChzdGF0ZS5maW5nZXJwcmludCAhPT0gbG9jYXRpb24uaHJlZikge1xyXG4gICAgICAgIHN0YXRlLmZpbmdlcnByaW50ID0gbG9jYXRpb24uaHJlZjtcclxuICAgICAgICBwbG9nKFwiZG9tIHByb2JlIChubyBjb250ZW50KVwiLCB7XHJcbiAgICAgICAgICB1cmw6IGxvY2F0aW9uLmhyZWYsXHJcbiAgICAgICAgICBzaWRlYmFyOiBzaWRlYmFyID8gZGVzY3JpYmUoc2lkZWJhcikgOiBudWxsLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGxldCBwYW5lbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgQXJyYXkuZnJvbShjb250ZW50LmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdKSB7XHJcbiAgICAgIGlmIChjaGlsZC5kYXRhc2V0LmNvZGV4cHAgPT09IFwidHdlYWtzLXBhbmVsXCIpIGNvbnRpbnVlO1xyXG4gICAgICBpZiAoY2hpbGQuc3R5bGUuZGlzcGxheSA9PT0gXCJub25lXCIpIGNvbnRpbnVlO1xyXG4gICAgICBwYW5lbCA9IGNoaWxkO1xyXG4gICAgICBicmVhaztcclxuICAgIH1cclxuICAgIGNvbnN0IGFjdGl2ZU5hdiA9IHNpZGViYXJcclxuICAgICAgPyBBcnJheS5mcm9tKHNpZGViYXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCJidXR0b24sIGFcIikpLmZpbmQoXHJcbiAgICAgICAgICAoYikgPT5cclxuICAgICAgICAgICAgYi5nZXRBdHRyaWJ1dGUoXCJhcmlhLWN1cnJlbnRcIikgPT09IFwicGFnZVwiIHx8XHJcbiAgICAgICAgICAgIGIuZ2V0QXR0cmlidXRlKFwiZGF0YS1hY3RpdmVcIikgPT09IFwidHJ1ZVwiIHx8XHJcbiAgICAgICAgICAgIGIuZ2V0QXR0cmlidXRlKFwiYXJpYS1zZWxlY3RlZFwiKSA9PT0gXCJ0cnVlXCIgfHxcclxuICAgICAgICAgICAgYi5jbGFzc0xpc3QuY29udGFpbnMoXCJhY3RpdmVcIiksXHJcbiAgICAgICAgKVxyXG4gICAgICA6IG51bGw7XHJcbiAgICBjb25zdCBoZWFkaW5nID0gcGFuZWw/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxyXG4gICAgICBcImgxLCBoMiwgaDMsIFtjbGFzcyo9J2hlYWRpbmcnXVwiLFxyXG4gICAgKTtcclxuICAgIGNvbnN0IGZpbmdlcnByaW50ID0gYCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudCA/PyBcIlwifXwke2hlYWRpbmc/LnRleHRDb250ZW50ID8/IFwiXCJ9fCR7cGFuZWw/LmNoaWxkcmVuLmxlbmd0aCA/PyAwfWA7XHJcbiAgICBpZiAoc3RhdGUuZmluZ2VycHJpbnQgPT09IGZpbmdlcnByaW50KSByZXR1cm47XHJcbiAgICBzdGF0ZS5maW5nZXJwcmludCA9IGZpbmdlcnByaW50O1xyXG4gICAgcGxvZyhcImRvbSBwcm9iZVwiLCB7XHJcbiAgICAgIHVybDogbG9jYXRpb24uaHJlZixcclxuICAgICAgYWN0aXZlTmF2OiBhY3RpdmVOYXY/LnRleHRDb250ZW50Py50cmltKCkgPz8gbnVsbCxcclxuICAgICAgaGVhZGluZzogaGVhZGluZz8udGV4dENvbnRlbnQ/LnRyaW0oKSA/PyBudWxsLFxyXG4gICAgICBjb250ZW50OiBkZXNjcmliZShjb250ZW50KSxcclxuICAgIH0pO1xyXG4gICAgaWYgKHBhbmVsKSB7XHJcbiAgICAgIGNvbnN0IGh0bWwgPSBwYW5lbC5vdXRlckhUTUw7XHJcbiAgICAgIHBsb2coXHJcbiAgICAgICAgYGNvZGV4IHBhbmVsIEhUTUwgKCR7YWN0aXZlTmF2Py50ZXh0Q29udGVudD8udHJpbSgpID8/IFwiP1wifSlgLFxyXG4gICAgICAgIGh0bWwuc2xpY2UoMCwgMzIwMDApLFxyXG4gICAgICApO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGUpIHtcclxuICAgIHBsb2coXCJkb20gcHJvYmUgZmFpbGVkXCIsIFN0cmluZyhlKSk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkZXNjcmliZShlbDogSFRNTEVsZW1lbnQpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIHRhZzogZWwudGFnTmFtZSxcclxuICAgIGNsczogZWwuY2xhc3NOYW1lLnNsaWNlKDAsIDEyMCksXHJcbiAgICBpZDogZWwuaWQgfHwgdW5kZWZpbmVkLFxyXG4gICAgY2hpbGRyZW46IGVsLmNoaWxkcmVuLmxlbmd0aCxcclxuICAgIHJlY3Q6ICgoKSA9PiB7XHJcbiAgICAgIGNvbnN0IHIgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgcmV0dXJuIHsgdzogTWF0aC5yb3VuZChyLndpZHRoKSwgaDogTWF0aC5yb3VuZChyLmhlaWdodCkgfTtcclxuICAgIH0pKCksXHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gdHdlYWtzUGF0aCgpOiBzdHJpbmcge1xyXG4gIHJldHVybiAoXHJcbiAgICAod2luZG93IGFzIHVua25vd24gYXMgeyBfX2NvZGV4cHBfdHdlYWtzX2Rpcl9fPzogc3RyaW5nIH0pLl9fY29kZXhwcF90d2Vha3NfZGlyX18gPz9cclxuICAgIFwiPHVzZXIgZGlyPi90d2Vha3NcIlxyXG4gICk7XHJcbn1cclxuIiwgIi8qKlxyXG4gKiBSZW5kZXJlci1zaWRlIHR3ZWFrIGhvc3QuIFdlOlxyXG4gKiAgIDEuIEFzayBtYWluIGZvciB0aGUgdHdlYWsgbGlzdCAod2l0aCByZXNvbHZlZCBlbnRyeSBwYXRoKS5cclxuICogICAyLiBGb3IgZWFjaCByZW5kZXJlci1zY29wZWQgKG9yIFwiYm90aFwiKSB0d2VhaywgZmV0Y2ggaXRzIHNvdXJjZSB2aWEgSVBDXHJcbiAqICAgICAgYW5kIGV4ZWN1dGUgaXQgYXMgYSBDb21tb25KUy1zaGFwZWQgZnVuY3Rpb24uXHJcbiAqICAgMy4gUHJvdmlkZSBpdCB0aGUgcmVuZGVyZXIgaGFsZiBvZiB0aGUgQVBJLlxyXG4gKlxyXG4gKiBDb2RleCBydW5zIHRoZSByZW5kZXJlciB3aXRoIHNhbmRib3g6IHRydWUsIHNvIE5vZGUncyBgcmVxdWlyZSgpYCBpc1xyXG4gKiByZXN0cmljdGVkIHRvIGEgdGlueSB3aGl0ZWxpc3QgKGVsZWN0cm9uICsgYSBmZXcgcG9seWZpbGxzKS4gVGhhdCBtZWFucyB3ZVxyXG4gKiBjYW5ub3QgYHJlcXVpcmUoKWAgYXJiaXRyYXJ5IHR3ZWFrIGZpbGVzIGZyb20gZGlzay4gSW5zdGVhZCB3ZSBwdWxsIHRoZVxyXG4gKiBzb3VyY2Ugc3RyaW5nIGZyb20gbWFpbiBhbmQgZXZhbHVhdGUgaXQgd2l0aCBgbmV3IEZ1bmN0aW9uYCBpbnNpZGUgdGhlXHJcbiAqIHByZWxvYWQgY29udGV4dC4gVHdlYWsgYXV0aG9ycyB3aG8gbmVlZCBucG0gZGVwcyBtdXN0IGJ1bmRsZSB0aGVtIGluLlxyXG4gKi9cclxuXHJcbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSBcImVsZWN0cm9uXCI7XHJcbmltcG9ydCB7IHJlZ2lzdGVyU2VjdGlvbiwgcmVnaXN0ZXJQYWdlLCBjbGVhclNlY3Rpb25zLCBzZXRMaXN0ZWRUd2Vha3MgfSBmcm9tIFwiLi9zZXR0aW5ncy1pbmplY3RvclwiO1xyXG5pbXBvcnQgeyBmaWJlckZvck5vZGUgfSBmcm9tIFwiLi9yZWFjdC1ob29rXCI7XHJcbmltcG9ydCB0eXBlIHtcclxuICBUd2Vha01hbmlmZXN0LFxyXG4gIFR3ZWFrQXBpLFxyXG4gIFJlYWN0RmliZXJOb2RlLFxyXG4gIFR3ZWFrLFxyXG59IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XHJcblxyXG5pbnRlcmZhY2UgTGlzdGVkVHdlYWsge1xyXG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xyXG4gIGVudHJ5OiBzdHJpbmc7XHJcbiAgZGlyOiBzdHJpbmc7XG4gIGVudHJ5RXhpc3RzOiBib29sZWFuO1xuICBlbmFibGVkOiBib29sZWFuO1xuICBsb2FkYWJsZTogYm9vbGVhbjtcbiAgbG9hZEVycm9yPzogc3RyaW5nO1xuICBjYXBhYmlsaXRpZXM/OiBzdHJpbmdbXTtcbiAgdXBkYXRlOiB7XG4gICAgY2hlY2tlZEF0OiBzdHJpbmc7XHJcbiAgICByZXBvOiBzdHJpbmc7XHJcbiAgICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xyXG4gICAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcclxuICAgIGxhdGVzdFRhZzogc3RyaW5nIHwgbnVsbDtcclxuICAgIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XHJcbiAgICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XHJcbiAgICBlcnJvcj86IHN0cmluZztcclxuICB9IHwgbnVsbDtcclxufVxyXG5cclxuaW50ZXJmYWNlIFVzZXJQYXRocyB7XHJcbiAgdXNlclJvb3Q6IHN0cmluZztcclxuICBydW50aW1lRGlyOiBzdHJpbmc7XHJcbiAgdHdlYWtzRGlyOiBzdHJpbmc7XHJcbiAgbG9nRGlyOiBzdHJpbmc7XHJcbn1cclxuXHJcbmNvbnN0IGxvYWRlZCA9IG5ldyBNYXA8c3RyaW5nLCB7IHN0b3A/OiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB9PigpO1xubGV0IGNhY2hlZFBhdGhzOiBVc2VyUGF0aHMgfCBudWxsID0gbnVsbDtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydFR3ZWFrSG9zdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zdCB0d2Vha3MgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDpsaXN0LXR3ZWFrc1wiKSkgYXMgTGlzdGVkVHdlYWtbXTtcclxuICBjb25zdCBwYXRocyA9IChhd2FpdCBpcGNSZW5kZXJlci5pbnZva2UoXCJjb2RleHBwOnVzZXItcGF0aHNcIikpIGFzIFVzZXJQYXRocztcclxuICBjYWNoZWRQYXRocyA9IHBhdGhzO1xyXG4gIC8vIFB1c2ggdGhlIGxpc3QgdG8gdGhlIHNldHRpbmdzIGluamVjdG9yIHNvIHRoZSBUd2Vha3MgcGFnZSBjYW4gcmVuZGVyXHJcbiAgLy8gY2FyZHMgZXZlbiBiZWZvcmUgYW55IHR3ZWFrJ3Mgc3RhcnQoKSBydW5zIChhbmQgZm9yIGRpc2FibGVkIHR3ZWFrc1xyXG4gIC8vIHRoYXQgd2UgbmV2ZXIgbG9hZCkuXHJcbiAgc2V0TGlzdGVkVHdlYWtzKHR3ZWFrcyk7XHJcbiAgLy8gU3Rhc2ggZm9yIHRoZSBzZXR0aW5ncyBpbmplY3RvcidzIGVtcHR5LXN0YXRlIG1lc3NhZ2UuXHJcbiAgKHdpbmRvdyBhcyB1bmtub3duIGFzIHsgX19jb2RleHBwX3R3ZWFrc19kaXJfXz86IHN0cmluZyB9KS5fX2NvZGV4cHBfdHdlYWtzX2Rpcl9fID1cclxuICAgIHBhdGhzLnR3ZWFrc0RpcjtcclxuXHJcbiAgZm9yIChjb25zdCB0IG9mIHR3ZWFrcykge1xyXG4gICAgaWYgKHQubWFuaWZlc3Quc2NvcGUgPT09IFwibWFpblwiKSBjb250aW51ZTtcbiAgICBpZiAoIXQuZW50cnlFeGlzdHMpIGNvbnRpbnVlO1xuICAgIGlmICghdC5lbmFibGVkKSBjb250aW51ZTtcbiAgICBpZiAoIXQubG9hZGFibGUpIGNvbnRpbnVlO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBsb2FkVHdlYWsodCwgcGF0aHMpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiW2NvZGV4LXBsdXNwbHVzXSB0d2VhayBsb2FkIGZhaWxlZDpcIiwgdC5tYW5pZmVzdC5pZCwgZSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb25zb2xlLmluZm8oXHJcbiAgICBgW2NvZGV4LXBsdXNwbHVzXSByZW5kZXJlciBob3N0IGxvYWRlZCAke2xvYWRlZC5zaXplfSB0d2VhayhzKTpgLFxyXG4gICAgWy4uLmxvYWRlZC5rZXlzKCldLmpvaW4oXCIsIFwiKSB8fCBcIihub25lKVwiLFxyXG4gICk7XHJcbiAgaXBjUmVuZGVyZXIuc2VuZChcclxuICAgIFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLFxyXG4gICAgXCJpbmZvXCIsXHJcbiAgICBgcmVuZGVyZXIgaG9zdCBsb2FkZWQgJHtsb2FkZWQuc2l6ZX0gdHdlYWsocyk6ICR7Wy4uLmxvYWRlZC5rZXlzKCldLmpvaW4oXCIsIFwiKSB8fCBcIihub25lKVwifWAsXHJcbiAgKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFN0b3AgZXZlcnkgcmVuZGVyZXItc2NvcGUgdHdlYWsgc28gYSBzdWJzZXF1ZW50IGBzdGFydFR3ZWFrSG9zdCgpYCB3aWxsXHJcbiAqIHJlLWV2YWx1YXRlIGZyZXNoIHNvdXJjZS4gTW9kdWxlIGNhY2hlIGlzbid0IHJlbGV2YW50IHNpbmNlIHdlIGV2YWxcclxuICogc291cmNlIHN0cmluZ3MgZGlyZWN0bHkgXHUyMDE0IGVhY2ggbG9hZCBjcmVhdGVzIGEgZnJlc2ggc2NvcGUuXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdGVhcmRvd25Ud2Vha0hvc3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGZvciAoY29uc3QgW2lkLCB0XSBvZiBsb2FkZWQpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdC5zdG9wPy4oKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJbY29kZXgtcGx1c3BsdXNdIHR3ZWFrIHN0b3AgZmFpbGVkOlwiLCBpZCwgZSk7XG4gICAgfVxuICB9XHJcbiAgbG9hZGVkLmNsZWFyKCk7XHJcbiAgY2xlYXJTZWN0aW9ucygpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkVHdlYWsodDogTGlzdGVkVHdlYWssIHBhdGhzOiBVc2VyUGF0aHMpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zdCBzb3VyY2UgPSAoYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKFxyXG4gICAgXCJjb2RleHBwOnJlYWQtdHdlYWstc291cmNlXCIsXHJcbiAgICB0LmVudHJ5LFxyXG4gICkpIGFzIHN0cmluZztcclxuXHJcbiAgLy8gRXZhbHVhdGUgYXMgQ0pTLXNoYXBlZDogcHJvdmlkZSBtb2R1bGUvZXhwb3J0cy9hcGkuIFR3ZWFrIGNvZGUgbWF5IHVzZVxyXG4gIC8vIGBtb2R1bGUuZXhwb3J0cyA9IHsgc3RhcnQsIHN0b3AgfWAgb3IgYGV4cG9ydHMuc3RhcnQgPSAuLi5gIG9yIHB1cmUgRVNNXHJcbiAgLy8gZGVmYXVsdCBleHBvcnQgc2hhcGUgKHdlIGFjY2VwdCBib3RoKS5cclxuICBjb25zdCBtb2R1bGUgPSB7IGV4cG9ydHM6IHt9IGFzIHsgZGVmYXVsdD86IFR3ZWFrIH0gJiBUd2VhayB9O1xyXG4gIGNvbnN0IGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cztcclxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWltcGxpZWQtZXZhbCwgbm8tbmV3LWZ1bmNcclxuICBjb25zdCBmbiA9IG5ldyBGdW5jdGlvbihcclxuICAgIFwibW9kdWxlXCIsXHJcbiAgICBcImV4cG9ydHNcIixcclxuICAgIFwiY29uc29sZVwiLFxyXG4gICAgYCR7c291cmNlfVxcbi8vIyBzb3VyY2VVUkw9Y29kZXhwcC10d2VhazovLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHQubWFuaWZlc3QuaWQpfS8ke2VuY29kZVVSSUNvbXBvbmVudCh0LmVudHJ5KX1gLFxyXG4gICk7XHJcbiAgZm4obW9kdWxlLCBleHBvcnRzLCBjb25zb2xlKTtcclxuICBjb25zdCBtb2QgPSBtb2R1bGUuZXhwb3J0cyBhcyB7IGRlZmF1bHQ/OiBUd2VhayB9ICYgVHdlYWs7XHJcbiAgY29uc3QgdHdlYWs6IFR3ZWFrID0gKG1vZCBhcyB7IGRlZmF1bHQ/OiBUd2VhayB9KS5kZWZhdWx0ID8/IChtb2QgYXMgVHdlYWspO1xyXG4gIGlmICh0eXBlb2YgdHdlYWs/LnN0YXJ0ICE9PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgdHdlYWsgJHt0Lm1hbmlmZXN0LmlkfSBoYXMgbm8gc3RhcnQoKWApO1xyXG4gIH1cclxuICBjb25zdCBhcGkgPSBtYWtlUmVuZGVyZXJBcGkodC5tYW5pZmVzdCwgcGF0aHMpO1xyXG4gIGF3YWl0IHR3ZWFrLnN0YXJ0KGFwaSk7XHJcbiAgbG9hZGVkLnNldCh0Lm1hbmlmZXN0LmlkLCB7IHN0b3A6IHR3ZWFrLnN0b3A/LmJpbmQodHdlYWspIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBtYWtlUmVuZGVyZXJBcGkobWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3QsIHBhdGhzOiBVc2VyUGF0aHMpOiBUd2Vha0FwaSB7XHJcbiAgY29uc3QgaWQgPSBtYW5pZmVzdC5pZDtcclxuICBjb25zdCBsb2cgPSAobGV2ZWw6IFwiZGVidWdcIiB8IFwiaW5mb1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIC4uLmE6IHVua25vd25bXSkgPT4ge1xyXG4gICAgY29uc3QgY29uc29sZUZuID1cclxuICAgICAgbGV2ZWwgPT09IFwiZGVidWdcIiA/IGNvbnNvbGUuZGVidWdcclxuICAgICAgOiBsZXZlbCA9PT0gXCJ3YXJuXCIgPyBjb25zb2xlLndhcm5cclxuICAgICAgOiBsZXZlbCA9PT0gXCJlcnJvclwiID8gY29uc29sZS5lcnJvclxyXG4gICAgICA6IGNvbnNvbGUubG9nO1xyXG4gICAgY29uc29sZUZuKGBbY29kZXgtcGx1c3BsdXNdWyR7aWR9XWAsIC4uLmEpO1xyXG4gICAgLy8gQWxzbyBtaXJyb3IgdG8gbWFpbidzIGxvZyBmaWxlIHNvIHdlIGNhbiBkaWFnbm9zZSB0d2VhayBiZWhhdmlvclxyXG4gICAgLy8gd2l0aG91dCBhdHRhY2hpbmcgRGV2VG9vbHMuIFN0cmluZ2lmeSBlYWNoIGFyZyBkZWZlbnNpdmVseS5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHBhcnRzID0gYS5tYXAoKHYpID0+IHtcclxuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHJldHVybiB2O1xyXG4gICAgICAgIGlmICh2IGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiBgJHt2Lm5hbWV9OiAke3YubWVzc2FnZX1gO1xyXG4gICAgICAgIHRyeSB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTsgfSBjYXRjaCB7IHJldHVybiBTdHJpbmcodik7IH1cclxuICAgICAgfSk7XHJcbiAgICAgIGlwY1JlbmRlcmVyLnNlbmQoXHJcbiAgICAgICAgXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsXHJcbiAgICAgICAgbGV2ZWwsXHJcbiAgICAgICAgYFt0d2VhayAke2lkfV0gJHtwYXJ0cy5qb2luKFwiIFwiKX1gLFxyXG4gICAgICApO1xyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIC8qIHN3YWxsb3cgXHUyMDE0IG5ldmVyIGxldCBsb2dnaW5nIGJyZWFrIGEgdHdlYWsgKi9cclxuICAgIH1cclxuICB9O1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgbWFuaWZlc3QsXHJcbiAgICBwcm9jZXNzOiBcInJlbmRlcmVyXCIsXHJcbiAgICBsb2c6IHtcclxuICAgICAgZGVidWc6ICguLi5hKSA9PiBsb2coXCJkZWJ1Z1wiLCAuLi5hKSxcclxuICAgICAgaW5mbzogKC4uLmEpID0+IGxvZyhcImluZm9cIiwgLi4uYSksXHJcbiAgICAgIHdhcm46ICguLi5hKSA9PiBsb2coXCJ3YXJuXCIsIC4uLmEpLFxyXG4gICAgICBlcnJvcjogKC4uLmEpID0+IGxvZyhcImVycm9yXCIsIC4uLmEpLFxyXG4gICAgfSxcclxuICAgIHN0b3JhZ2U6IHJlbmRlcmVyU3RvcmFnZShpZCksXHJcbiAgICBzZXR0aW5nczoge1xyXG4gICAgICByZWdpc3RlcjogKHMpID0+IHJlZ2lzdGVyU2VjdGlvbih7IC4uLnMsIGlkOiBgJHtpZH06JHtzLmlkfWAgfSksXHJcbiAgICAgIHJlZ2lzdGVyUGFnZTogKHApID0+XHJcbiAgICAgICAgcmVnaXN0ZXJQYWdlKGlkLCBtYW5pZmVzdCwgeyAuLi5wLCBpZDogYCR7aWR9OiR7cC5pZH1gIH0pLFxyXG4gICAgfSxcclxuICAgIHJlYWN0OiB7XHJcbiAgICAgIGdldEZpYmVyOiAobikgPT4gZmliZXJGb3JOb2RlKG4pIGFzIFJlYWN0RmliZXJOb2RlIHwgbnVsbCxcclxuICAgICAgZmluZE93bmVyQnlOYW1lOiAobiwgbmFtZSkgPT4ge1xyXG4gICAgICAgIGxldCBmID0gZmliZXJGb3JOb2RlKG4pIGFzIFJlYWN0RmliZXJOb2RlIHwgbnVsbDtcclxuICAgICAgICB3aGlsZSAoZikge1xyXG4gICAgICAgICAgY29uc3QgdCA9IGYudHlwZSBhcyB7IGRpc3BsYXlOYW1lPzogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH0gfCBudWxsO1xyXG4gICAgICAgICAgaWYgKHQgJiYgKHQuZGlzcGxheU5hbWUgPT09IG5hbWUgfHwgdC5uYW1lID09PSBuYW1lKSkgcmV0dXJuIGY7XHJcbiAgICAgICAgICBmID0gZi5yZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9LFxyXG4gICAgICB3YWl0Rm9yRWxlbWVudDogKHNlbCwgdGltZW91dE1zID0gNTAwMCkgPT5cclxuICAgICAgICBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcclxuICAgICAgICAgIGlmIChleGlzdGluZykgcmV0dXJuIHJlc29sdmUoZXhpc3RpbmcpO1xyXG4gICAgICAgICAgY29uc3QgZGVhZGxpbmUgPSBEYXRlLm5vdygpICsgdGltZW91dE1zO1xyXG4gICAgICAgICAgY29uc3Qgb2JzID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsKTtcclxuICAgICAgICAgICAgaWYgKGVsKSB7XHJcbiAgICAgICAgICAgICAgb2JzLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgICByZXNvbHZlKGVsKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChEYXRlLm5vdygpID4gZGVhZGxpbmUpIHtcclxuICAgICAgICAgICAgICBvYnMuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYHRpbWVvdXQgd2FpdGluZyBmb3IgJHtzZWx9YCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIG9icy5vYnNlcnZlKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XHJcbiAgICAgICAgfSksXHJcbiAgICB9LFxyXG4gICAgaXBjOiB7XHJcbiAgICAgIG9uOiAoYywgaCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHdyYXBwZWQgPSAoX2U6IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gaCguLi5hcmdzKTtcclxuICAgICAgICBpcGNSZW5kZXJlci5vbihgY29kZXhwcDoke2lkfToke2N9YCwgd3JhcHBlZCk7XHJcbiAgICAgICAgcmV0dXJuICgpID0+IGlwY1JlbmRlcmVyLnJlbW92ZUxpc3RlbmVyKGBjb2RleHBwOiR7aWR9OiR7Y31gLCB3cmFwcGVkKTtcclxuICAgICAgfSxcclxuICAgICAgc2VuZDogKGMsIC4uLmFyZ3MpID0+IGlwY1JlbmRlcmVyLnNlbmQoYGNvZGV4cHA6JHtpZH06JHtjfWAsIC4uLmFyZ3MpLFxyXG4gICAgICBpbnZva2U6IDxUPihjOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkgPT5cclxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoYGNvZGV4cHA6JHtpZH06JHtjfWAsIC4uLmFyZ3MpIGFzIFByb21pc2U8VD4sXHJcbiAgICB9LFxyXG4gICAgZnM6IHJlbmRlcmVyRnMoaWQsIHBhdGhzKSxcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJlclN0b3JhZ2UoaWQ6IHN0cmluZykge1xyXG4gIGNvbnN0IGtleSA9IGBjb2RleHBwOnN0b3JhZ2U6JHtpZH1gO1xyXG4gIGNvbnN0IHJlYWQgPSAoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmV0dXJuIEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KSA/PyBcInt9XCIpO1xyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIHJldHVybiB7fTtcclxuICAgIH1cclxuICB9O1xyXG4gIGNvbnN0IHdyaXRlID0gKHY6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PlxyXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCBKU09OLnN0cmluZ2lmeSh2KSk7XHJcbiAgcmV0dXJuIHtcclxuICAgIGdldDogPFQ+KGs6IHN0cmluZywgZD86IFQpID0+IChrIGluIHJlYWQoKSA/IChyZWFkKClba10gYXMgVCkgOiAoZCBhcyBUKSksXHJcbiAgICBzZXQ6IChrOiBzdHJpbmcsIHY6IHVua25vd24pID0+IHtcclxuICAgICAgY29uc3QgbyA9IHJlYWQoKTtcclxuICAgICAgb1trXSA9IHY7XHJcbiAgICAgIHdyaXRlKG8pO1xyXG4gICAgfSxcclxuICAgIGRlbGV0ZTogKGs6IHN0cmluZykgPT4ge1xyXG4gICAgICBjb25zdCBvID0gcmVhZCgpO1xyXG4gICAgICBkZWxldGUgb1trXTtcclxuICAgICAgd3JpdGUobyk7XHJcbiAgICB9LFxyXG4gICAgYWxsOiAoKSA9PiByZWFkKCksXHJcbiAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyZXJGcyhpZDogc3RyaW5nLCBfcGF0aHM6IFVzZXJQYXRocykge1xyXG4gIC8vIFNhbmRib3hlZCByZW5kZXJlciBjYW4ndCB1c2UgTm9kZSBmcyBkaXJlY3RseSBcdTIwMTQgcHJveHkgdGhyb3VnaCBtYWluIElQQy5cclxuICByZXR1cm4ge1xyXG4gICAgZGF0YURpcjogYDxyZW1vdGU+L3R3ZWFrLWRhdGEvJHtpZH1gLFxyXG4gICAgcmVhZDogKHA6IHN0cmluZykgPT5cclxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp0d2Vhay1mc1wiLCBcInJlYWRcIiwgaWQsIHApIGFzIFByb21pc2U8c3RyaW5nPixcclxuICAgIHdyaXRlOiAocDogc3RyaW5nLCBjOiBzdHJpbmcpID0+XHJcbiAgICAgIGlwY1JlbmRlcmVyLmludm9rZShcImNvZGV4cHA6dHdlYWstZnNcIiwgXCJ3cml0ZVwiLCBpZCwgcCwgYykgYXMgUHJvbWlzZTx2b2lkPixcclxuICAgIGV4aXN0czogKHA6IHN0cmluZykgPT5cclxuICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKFwiY29kZXhwcDp0d2Vhay1mc1wiLCBcImV4aXN0c1wiLCBpZCwgcCkgYXMgUHJvbWlz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O0FBQUEsRUFDMUQ7QUFDRjs7O0FIOU9BLFNBQVMsUUFBUSxPQUFlLE9BQXVCO0FBQ3JELFFBQU0sTUFBTSw0QkFBNEIsS0FBSyxHQUMzQyxVQUFVLFNBQVksS0FBSyxNQUFNRSxlQUFjLEtBQUssQ0FDdEQ7QUFDQSxNQUFJO0FBQ0YsWUFBUSxNQUFNLEdBQUc7QUFBQSxFQUNuQixRQUFRO0FBQUEsRUFBQztBQUNULE1BQUk7QUFDRixpQ0FBWSxLQUFLLHVCQUF1QixRQUFRLEdBQUc7QUFBQSxFQUNyRCxRQUFRO0FBQUEsRUFBQztBQUNYO0FBQ0EsU0FBU0EsZUFBYyxHQUFvQjtBQUN6QyxNQUFJO0FBQ0YsV0FBTyxPQUFPLE1BQU0sV0FBVyxJQUFJLEtBQUssVUFBVSxDQUFDO0FBQUEsRUFDckQsUUFBUTtBQUNOLFdBQU8sT0FBTyxDQUFDO0FBQUEsRUFDakI7QUFDRjtBQUVBLFFBQVEsaUJBQWlCLEVBQUUsS0FBSyxTQUFTLEtBQUssQ0FBQztBQUcvQyxJQUFJO0FBQ0YsbUJBQWlCO0FBQ2pCLFVBQVEsc0JBQXNCO0FBQ2hDLFNBQVMsR0FBRztBQUNWLFVBQVEscUJBQXFCLE9BQU8sQ0FBQyxDQUFDO0FBQ3hDO0FBRUEsZUFBZSxNQUFNO0FBQ25CLE1BQUksU0FBUyxlQUFlLFdBQVc7QUFDckMsYUFBUyxpQkFBaUIsb0JBQW9CLE1BQU0sRUFBRSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ3BFLE9BQU87QUFDTCxTQUFLO0FBQUEsRUFDUDtBQUNGLENBQUM7QUFFRCxlQUFlLE9BQU87QUFDcEIsVUFBUSxjQUFjLEVBQUUsWUFBWSxTQUFTLFdBQVcsQ0FBQztBQUN6RCxNQUFJO0FBQ0YsMEJBQXNCO0FBQ3RCLFlBQVEsMkJBQTJCO0FBQ25DLFVBQU0sZUFBZTtBQUNyQixZQUFRLG9CQUFvQjtBQUM1QixvQkFBZ0I7QUFDaEIsWUFBUSxlQUFlO0FBQUEsRUFDekIsU0FBUyxHQUFHO0FBQ1YsWUFBUSxlQUFlLE9BQVEsR0FBYSxTQUFTLENBQUMsQ0FBQztBQUN2RCxZQUFRLE1BQU0seUNBQXlDLENBQUM7QUFBQSxFQUMxRDtBQUNGO0FBSUEsSUFBSSxZQUFrQztBQUN0QyxTQUFTLGtCQUF3QjtBQUMvQiwrQkFBWSxHQUFHLDBCQUEwQixNQUFNO0FBQzdDLFFBQUksVUFBVztBQUNmLGlCQUFhLFlBQVk7QUFDdkIsVUFBSTtBQUNGLGdCQUFRLEtBQUssdUNBQXVDO0FBQ3BELGNBQU0sa0JBQWtCO0FBQ3hCLGNBQU0sZUFBZTtBQUFBLE1BQ3ZCLFNBQVMsR0FBRztBQUNWLGdCQUFRLE1BQU0sdUNBQXVDLENBQUM7QUFBQSxNQUN4RCxVQUFFO0FBQ0Esb0JBQVk7QUFBQSxNQUNkO0FBQUEsSUFDRixHQUFHO0FBQUEsRUFDTCxDQUFDO0FBQ0g7IiwKICAibmFtZXMiOiBbImltcG9ydF9lbGVjdHJvbiIsICJzdWJ0aXRsZSIsICJyb290IiwgImltcG9ydF9lbGVjdHJvbiIsICJtb2R1bGUiLCAiZXhwb3J0cyIsICJzYWZlU3RyaW5naWZ5Il0KfQo=
