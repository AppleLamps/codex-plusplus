export interface IpcMainLike {
  on(channel: string, listener: (...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (...args: unknown[]) => void): void;
  handle(channel: string, handler: (...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export type Disposer = () => void;

export function createMainIpc(
  tweakId: string,
  ipcMain: IpcMainLike,
  disposers: Disposer[],
  registeredHandles: Map<string, Disposer>,
) {
  const ch = (channel: string) => `codexpp:${tweakId}:${channel}`;
  return {
    on: (channel: string, handler: (...args: unknown[]) => void): Disposer => {
      const full = ch(channel);
      const wrapped = (_event: unknown, ...args: unknown[]) => handler(...args);
      ipcMain.on(full, wrapped);
      const dispose = once(() => ipcMain.removeListener(full, wrapped));
      disposers.push(dispose);
      return dispose;
    },
    send: (_channel: string) => {
      throw new Error("ipc.send is renderer→main; main side uses handle/on");
    },
    invoke: (_channel: string) => {
      throw new Error("ipc.invoke is renderer→main; main side uses handle");
    },
    handle: (channel: string, handler: (...args: unknown[]) => unknown): Disposer => {
      const full = ch(channel);
      registeredHandles.get(full)?.();
      const wrapped = (_event: unknown, ...args: unknown[]) => handler(...args);
      ipcMain.handle(full, wrapped);
      const dispose = once(() => {
        if (registeredHandles.get(full) === dispose) {
          registeredHandles.delete(full);
          ipcMain.removeHandler(full);
        }
      });
      registeredHandles.set(full, dispose);
      disposers.push(dispose);
      return dispose;
    },
  };
}

function once(fn: () => void): Disposer {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn();
  };
}
