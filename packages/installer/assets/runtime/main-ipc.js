"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMainIpc = createMainIpc;
function createMainIpc(tweakId, ipcMain, disposers, registeredHandles) {
    const ch = (channel) => `codexpp:${tweakId}:${channel}`;
    return {
        on: (channel, handler) => {
            const full = ch(channel);
            const wrapped = (_event, ...args) => handler(...args);
            ipcMain.on(full, wrapped);
            const dispose = once(() => ipcMain.removeListener(full, wrapped));
            disposers.push(dispose);
            return dispose;
        },
        send: (_channel) => {
            throw new Error("ipc.send is renderer→main; main side uses handle/on");
        },
        invoke: (_channel) => {
            throw new Error("ipc.invoke is renderer→main; main side uses handle");
        },
        handle: (channel, handler) => {
            const full = ch(channel);
            registeredHandles.get(full)?.();
            const wrapped = (_event, ...args) => handler(...args);
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
function once(fn) {
    let called = false;
    return () => {
        if (called)
            return;
        called = true;
        fn();
    };
}
//# sourceMappingURL=main-ipc.js.map