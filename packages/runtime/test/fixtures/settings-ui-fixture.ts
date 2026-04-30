import { Window } from "happy-dom";

export function setupSettingsDom(opts: { onConfirm?: () => boolean } = {}): void {
  const window = new Window({ url: "https://codex.local/index.html?hostId=local" });
  window.confirm = opts.onConfirm ?? (() => true);
  window.location.reload = () => {};

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

export function buildSettingsFixture(): void {
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
