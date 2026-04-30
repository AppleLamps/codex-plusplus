"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRuntimeSupportBundle = createRuntimeSupportBundle;
exports.diagnosticsJson = diagnosticsJson;
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const LOG_TAIL_BYTES = 200 * 1024;
const REDACTED = "[redacted]";
const SENSITIVE_KEY_RE = /(token|secret|password|credential|api[-_]?key|access[-_]?key|private[-_]?key)/i;
function createRuntimeSupportBundle(input) {
    const parent = (0, node_path_1.resolve)(input.userRoot, "support");
    const dir = (0, node_path_1.join)(parent, `codex-plusplus-support-${timestampForPath()}`);
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    writeJson((0, node_path_1.join)(dir, "runtime-health.json"), input.runtimeHealth);
    writeJson((0, node_path_1.join)(dir, "paths.json"), {
        root: input.userRoot,
        runtime: input.runtimeDir,
        tweaks: input.tweaksDir,
        logDir: input.logDir,
    });
    if ((0, node_fs_1.existsSync)(input.configFile)) {
        writeJson((0, node_path_1.join)(dir, "config.redacted.json"), readJsonRedacted(input.configFile));
    }
    if (input.stateFile && (0, node_fs_1.existsSync)(input.stateFile)) {
        writeJson((0, node_path_1.join)(dir, "state.redacted.json"), readJsonRedacted(input.stateFile));
    }
    const windows = runtimeWindowsDiagnostics(input.stateFile);
    if (windows)
        writeJson((0, node_path_1.join)(dir, "windows.json"), windows);
    copyLogTails(input.logDir, (0, node_path_1.join)(dir, "logs"));
    return { dir };
}
function diagnosticsJson(input) {
    return JSON.stringify(redactValue({
        runtimeHealth: input.runtimeHealth,
        paths: {
            root: input.userRoot,
            runtime: input.runtimeDir,
            tweaks: input.tweaksDir,
            logDir: input.logDir,
        },
        config: (0, node_fs_1.existsSync)(input.configFile) ? readJsonRedacted(input.configFile) : null,
        state: input.stateFile && (0, node_fs_1.existsSync)(input.stateFile) ? readJsonRedacted(input.stateFile) : null,
        windows: runtimeWindowsDiagnostics(input.stateFile),
    }), null, 2);
}
function copyLogTails(logDir, outDir) {
    if (!(0, node_fs_1.existsSync)(logDir))
        return;
    (0, node_fs_1.mkdirSync)(outDir, { recursive: true });
    for (const name of (0, node_fs_1.readdirSync)(logDir)) {
        const src = (0, node_path_1.join)(logDir, name);
        let stat;
        try {
            stat = (0, node_fs_1.statSync)(src);
        }
        catch {
            continue;
        }
        if (!stat.isFile())
            continue;
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(outDir, (0, node_path_1.basename)(name)), tailFile(src, LOG_TAIL_BYTES));
    }
}
function tailFile(path, maxBytes) {
    const buf = (0, node_fs_1.readFileSync)(path);
    const tail = buf.byteLength > maxBytes ? buf.subarray(buf.byteLength - maxBytes) : buf;
    const prefix = buf.byteLength > maxBytes
        ? `[truncated to last ${maxBytes} bytes]\n`
        : "";
    return prefix + redactText(tail.toString("utf8"));
}
function readJsonRedacted(path) {
    try {
        return redactValue(JSON.parse((0, node_fs_1.readFileSync)(path, "utf8")));
    }
    catch (e) {
        return { error: `could not parse ${(0, node_path_1.basename)(path)}: ${e.message}` };
    }
}
function writeJson(path, value) {
    (0, node_fs_1.writeFileSync)(path, JSON.stringify(redactValue(value), null, 2));
}
function redactValue(value) {
    if (Array.isArray(value))
        return value.map(redactValue);
    if (!value || typeof value !== "object") {
        return typeof value === "string" ? redactText(value) : value;
    }
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY_RE.test(key) ? REDACTED : redactValue(child);
    }
    return out;
}
function redactText(text) {
    return text
        .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/g, REDACTED)
        .replace(/([^\s:@]{1,80}:[^\s@]{1,80})@/g, `${REDACTED}@`);
}
function runtimeWindowsDiagnostics(stateFile) {
    if ((0, node_os_1.platform)() !== "win32")
        return null;
    const state = stateFile && (0, node_fs_1.existsSync)(stateFile) ? readJsonRedacted(stateFile) : null;
    return {
        platform: "win32",
        recordedAppRoot: state && typeof state === "object" && "appRoot" in state
            ? state.appRoot
            : null,
        stateWindows: state && typeof state === "object" && "windows" in state
            ? state.windows
            : null,
        runningCodex: runtimeCodexProcessStatus(),
    };
}
function runtimeCodexProcessStatus() {
    try {
        const output = (0, node_child_process_1.execFileSync)("tasklist.exe", ["/FI", "IMAGENAME eq Codex.exe", "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
        const running = output
            .split(/\r?\n/)
            .some((line) => /^"Codex\.exe"/i.test(line.trim()));
        return { running, detail: running ? "Codex.exe is running" : "Codex.exe is not running" };
    }
    catch (e) {
        return { running: null, detail: `could not query tasklist: ${e.message}` };
    }
}
function timestampForPath() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}
//# sourceMappingURL=support-bundle.js.map