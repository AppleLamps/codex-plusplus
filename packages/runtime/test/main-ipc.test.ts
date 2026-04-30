import test from "node:test";
import assert from "node:assert/strict";
import { createMainIpc, type IpcMainLike } from "../src/main-ipc";

test("createMainIpc tracks listener and handler disposers", () => {
  const fake = new FakeIpcMain();
  const disposers: Array<() => void> = [];
  const handles = new Map<string, () => void>();
  const ipc = createMainIpc("tweak", fake, disposers, handles);

  const off = ipc.on("event", () => {});
  const removeHandle = ipc.handle("compute", () => 1);

  assert.equal(fake.listeners.size, 1);
  assert.equal(fake.handlers.size, 1);
  assert.equal(disposers.length, 2);

  off();
  removeHandle();

  assert.equal(fake.listeners.size, 0);
  assert.equal(fake.handlers.size, 0);
});

test("createMainIpc replaces duplicate handlers deterministically", () => {
  const fake = new FakeIpcMain();
  const disposers: Array<() => void> = [];
  const handles = new Map<string, () => void>();
  const ipc = createMainIpc("tweak", fake, disposers, handles);

  const first = ipc.handle("compute", () => 1);
  const second = ipc.handle("compute", () => 2);

  assert.equal(fake.handlers.size, 1);
  assert.equal(fake.removedHandlers, 1);

  first();
  assert.equal(fake.handlers.size, 1);

  second();
  assert.equal(fake.handlers.size, 0);
});

class FakeIpcMain implements IpcMainLike {
  listeners = new Map<string, (...args: unknown[]) => void>();
  handlers = new Map<string, (...args: unknown[]) => unknown>();
  removedHandlers = 0;

  on(channel: string, listener: (...args: unknown[]) => void): void {
    this.listeners.set(channel, listener);
  }

  removeListener(channel: string): void {
    this.listeners.delete(channel);
  }

  handle(channel: string, handler: (...args: unknown[]) => unknown): void {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string): void {
    this.removedHandlers++;
    this.handlers.delete(channel);
  }
}
