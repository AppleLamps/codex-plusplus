export interface IpcMainLike {
    on(channel: string, listener: (...args: unknown[]) => void): void;
    removeListener(channel: string, listener: (...args: unknown[]) => void): void;
    handle(channel: string, handler: (...args: unknown[]) => unknown): void;
    removeHandler(channel: string): void;
}
export type Disposer = () => void;
export declare function createMainIpc(tweakId: string, ipcMain: IpcMainLike, disposers: Disposer[], registeredHandles: Map<string, Disposer>): {
    on: (channel: string, handler: (...args: unknown[]) => void) => Disposer;
    send: (_channel: string) => never;
    invoke: (_channel: string) => never;
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => Disposer;
};
