import { spawn } from "node:child_process";
import { platform as currentPlatform } from "node:os";

export interface OpenCommand {
  command: string;
  args: string[];
}

export function openCommandForPath(
  target: string,
  platform = currentPlatform(),
): OpenCommand {
  if (platform === "darwin") return { command: "open", args: [target] };
  if (platform === "win32") {
    return { command: "explorer.exe", args: [target] };
  }
  return { command: "xdg-open", args: [target] };
}

export function openPath(target: string): void {
  const { command, args } = openCommandForPath(target);
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}
