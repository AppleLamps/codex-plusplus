import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { Window } from "happy-dom";

const ipcCalls: Array<{ channel: string; args: unknown[] }> = [];
const electronMock = {
  ipcRenderer: {
    send(channel: string, ...args: unknown[]) {
      ipcCalls.push({ channel, args });
    },
    invoke(channel: string, ...args: unknown[]) {
      ipcCalls.push({ channel, args });
      if (channel === "codexpp:read-tweak-asset") return Promise.resolve(null);
      if (channel === "codexpp:open-external") return Promise.resolve(undefined);
      if (channel === "codexpp:set-tweak-enabled") return Promise.resolve(true);
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

before(async () => {
  injector = await import("../src/preload/settings-injector");
});

beforeEach(() => {
  ipcCalls.length = 0;
  setupDom();
  injector.__resetSettingsInjectorForTests();
});

test("injects Codex++ nav once into a settings sidebar", () => {
  injector.__tryInjectForTests();
  injector.__tryInjectForTests();

  assert.equal(document.querySelectorAll('[data-codexpp="nav-group"]').length, 1);
  assert.equal(document.querySelectorAll('[data-codexpp="nav-config"]').length, 1);
  assert.equal(document.querySelectorAll('[data-codexpp="nav-tweaks"]').length, 1);
});

test("renders unavailable tweaks and capability labels", () => {
  injector.setListedTweaks([
    {
      manifest: {
        id: "future",
        name: "Future Tweak",
        version: "2.0.0",
        githubRepo: "owner/repo",
        description: "Needs a newer runtime",
      },
      entry: "/tmp/future/index.js",
      dir: "/tmp/future",
      entryExists: true,
      enabled: true,
      loadable: false,
      loadError: "requires Codex++ 99.0.0 or newer",
      update: null,
      capabilities: ["renderer UI", "runtime gate"],
    },
  ]);

  injector.__tryInjectForTests();
  click('[data-codexpp="nav-tweaks"]');

  assert.match(document.body.textContent ?? "", /Future Tweak/);
  assert.match(document.body.textContent ?? "", /Not Loaded/);
  assert.match(document.body.textContent ?? "", /requires Codex\+\+ 99\.0\.0/);
  assert.match(document.body.textContent ?? "", /renderer UI/);
  assert.match(document.body.textContent ?? "", /runtime gate/);
});

test("recovers after the settings container remounts", () => {
  injector.__tryInjectForTests();
  assert.equal(document.querySelectorAll('[data-codexpp="nav-group"]').length, 1);

  document.body.textContent = "";
  buildSettingsFixture();
  injector.__tryInjectForTests();

  assert.equal(document.querySelectorAll('[data-codexpp="nav-group"]').length, 1);
  assert.equal(document.querySelector('[data-codexpp="nav-tweaks"]')?.textContent?.includes("Tweaks"), true);
});

function setupDom(): void {
  const window = new Window({ url: "https://codex.local/index.html?hostId=local" });
  const globals: Record<string, unknown> = {
    window,
    document: window.document,
    MutationObserver: window.MutationObserver,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    Element: window.Element,
    Event: window.Event,
    history: window.history,
    location: window.location,
    localStorage: window.localStorage,
  };
  Object.assign(globalThis, globals);
  buildSettingsFixture();
}

function buildSettingsFixture(): void {
  const shell = document.createElement("div");
  shell.className = "flex h-full";

  const sidebar = document.createElement("aside");
  const outer = document.createElement("div");
  outer.className = "flex flex-col gap-1 gap-0";
  const group = document.createElement("div");
  group.className = "flex flex-col gap-px";
  for (const label of ["General", "Appearance", "Configuration"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    group.appendChild(button);
  }
  outer.appendChild(group);
  sidebar.appendChild(outer);

  const content = document.createElement("main");
  content.appendChild(document.createElement("section")).textContent = "General settings";
  content.getBoundingClientRect = () => ({
    width: 640,
    height: 480,
    top: 0,
    left: 0,
    right: 640,
    bottom: 480,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  shell.append(sidebar, content);
  document.body.appendChild(shell);
}

function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  assert.ok(el, selector);
  el.click();
}
