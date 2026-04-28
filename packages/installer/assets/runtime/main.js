"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/main.ts
var import_electron = require("electron");
var import_node_fs3 = require("node:fs");
var import_node_path4 = require("node:path");

// ../../node_modules/chokidar/esm/index.js
var import_fs2 = require("fs");
var import_promises3 = require("fs/promises");
var import_events = require("events");
var sysPath2 = __toESM(require("path"), 1);

// ../../node_modules/readdirp/esm/index.js
var import_promises = require("node:fs/promises");
var import_node_stream = require("node:stream");
var import_node_path = require("node:path");
var EntryTypes = {
  FILE_TYPE: "files",
  DIR_TYPE: "directories",
  FILE_DIR_TYPE: "files_directories",
  EVERYTHING_TYPE: "all"
};
var defaultOptions = {
  root: ".",
  fileFilter: (_entryInfo) => true,
  directoryFilter: (_entryInfo) => true,
  type: EntryTypes.FILE_TYPE,
  lstat: false,
  depth: 2147483648,
  alwaysStat: false,
  highWaterMark: 4096
};
Object.freeze(defaultOptions);
var RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
var NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
var ALL_TYPES = [
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
];
var DIR_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE
]);
var FILE_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
]);
var isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
var wantBigintFsStats = process.platform === "win32";
var emptyFn = (_entryInfo) => true;
var normalizeFilter = (filter) => {
  if (filter === void 0)
    return emptyFn;
  if (typeof filter === "function")
    return filter;
  if (typeof filter === "string") {
    const fl = filter.trim();
    return (entry) => entry.basename === fl;
  }
  if (Array.isArray(filter)) {
    const trItems = filter.map((item) => item.trim());
    return (entry) => trItems.some((f) => entry.basename === f);
  }
  return emptyFn;
};
var ReaddirpStream = class extends import_node_stream.Readable {
  constructor(options = {}) {
    super({
      objectMode: true,
      autoDestroy: true,
      highWaterMark: options.highWaterMark
    });
    const opts = { ...defaultOptions, ...options };
    const { root, type } = opts;
    this._fileFilter = normalizeFilter(opts.fileFilter);
    this._directoryFilter = normalizeFilter(opts.directoryFilter);
    const statMethod = opts.lstat ? import_promises.lstat : import_promises.stat;
    if (wantBigintFsStats) {
      this._stat = (path) => statMethod(path, { bigint: true });
    } else {
      this._stat = statMethod;
    }
    this._maxDepth = opts.depth ?? defaultOptions.depth;
    this._wantsDir = type ? DIR_TYPES.has(type) : false;
    this._wantsFile = type ? FILE_TYPES.has(type) : false;
    this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
    this._root = (0, import_node_path.resolve)(root);
    this._isDirent = !opts.alwaysStat;
    this._statsProp = this._isDirent ? "dirent" : "stats";
    this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
    this.parents = [this._exploreDir(root, 1)];
    this.reading = false;
    this.parent = void 0;
  }
  async _read(batch) {
    if (this.reading)
      return;
    this.reading = true;
    try {
      while (!this.destroyed && batch > 0) {
        const par = this.parent;
        const fil = par && par.files;
        if (fil && fil.length > 0) {
          const { path, depth } = par;
          const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path));
          const awaited = await Promise.all(slice);
          for (const entry of awaited) {
            if (!entry)
              continue;
            if (this.destroyed)
              return;
            const entryType = await this._getEntryType(entry);
            if (entryType === "directory" && this._directoryFilter(entry)) {
              if (depth <= this._maxDepth) {
                this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
              }
              if (this._wantsDir) {
                this.push(entry);
                batch--;
              }
            } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
              if (this._wantsFile) {
                this.push(entry);
                batch--;
              }
            }
          }
        } else {
          const parent = this.parents.pop();
          if (!parent) {
            this.push(null);
            break;
          }
          this.parent = await parent;
          if (this.destroyed)
            return;
        }
      }
    } catch (error) {
      this.destroy(error);
    } finally {
      this.reading = false;
    }
  }
  async _exploreDir(path, depth) {
    let files;
    try {
      files = await (0, import_promises.readdir)(path, this._rdOptions);
    } catch (error) {
      this._onError(error);
    }
    return { files, depth, path };
  }
  async _formatEntry(dirent, path) {
    let entry;
    const basename3 = this._isDirent ? dirent.name : dirent;
    try {
      const fullPath = (0, import_node_path.resolve)((0, import_node_path.join)(path, basename3));
      entry = { path: (0, import_node_path.relative)(this._root, fullPath), fullPath, basename: basename3 };
      entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
    } catch (err) {
      this._onError(err);
      return;
    }
    return entry;
  }
  _onError(err) {
    if (isNormalFlowError(err) && !this.destroyed) {
      this.emit("warn", err);
    } else {
      this.destroy(err);
    }
  }
  async _getEntryType(entry) {
    if (!entry && this._statsProp in entry) {
      return "";
    }
    const stats = entry[this._statsProp];
    if (stats.isFile())
      return "file";
    if (stats.isDirectory())
      return "directory";
    if (stats && stats.isSymbolicLink()) {
      const full = entry.fullPath;
      try {
        const entryRealPath = await (0, import_promises.realpath)(full);
        const entryRealPathStats = await (0, import_promises.lstat)(entryRealPath);
        if (entryRealPathStats.isFile()) {
          return "file";
        }
        if (entryRealPathStats.isDirectory()) {
          const len = entryRealPath.length;
          if (full.startsWith(entryRealPath) && full.substr(len, 1) === import_node_path.sep) {
            const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
            recursiveError.code = RECURSIVE_ERROR_CODE;
            return this._onError(recursiveError);
          }
          return "directory";
        }
      } catch (error) {
        this._onError(error);
        return "";
      }
    }
  }
  _includeAsFile(entry) {
    const stats = entry && entry[this._statsProp];
    return stats && this._wantsEverything && !stats.isDirectory();
  }
};
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}

// ../../node_modules/chokidar/esm/handler.js
var import_fs = require("fs");
var import_promises2 = require("fs/promises");
var sysPath = __toESM(require("path"), 1);
var import_os = require("os");
var STR_DATA = "data";
var STR_END = "end";
var STR_CLOSE = "close";
var EMPTY_FN = () => {
};
var pl = process.platform;
var isWindows = pl === "win32";
var isMacos = pl === "darwin";
var isLinux = pl === "linux";
var isFreeBSD = pl === "freebsd";
var isIBMi = (0, import_os.type)() === "OS400";
var EVENTS = {
  ALL: "all",
  READY: "ready",
  ADD: "add",
  CHANGE: "change",
  ADD_DIR: "addDir",
  UNLINK: "unlink",
  UNLINK_DIR: "unlinkDir",
  RAW: "raw",
  ERROR: "error"
};
var EV = EVENTS;
var THROTTLE_MODE_WATCH = "watch";
var statMethods = { lstat: import_promises2.lstat, stat: import_promises2.stat };
var KEY_LISTENERS = "listeners";
var KEY_ERR = "errHandlers";
var KEY_RAW = "rawEmitters";
var HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
var binaryExtensions = /* @__PURE__ */ new Set([
  "3dm",
  "3ds",
  "3g2",
  "3gp",
  "7z",
  "a",
  "aac",
  "adp",
  "afdesign",
  "afphoto",
  "afpub",
  "ai",
  "aif",
  "aiff",
  "alz",
  "ape",
  "apk",
  "appimage",
  "ar",
  "arj",
  "asf",
  "au",
  "avi",
  "bak",
  "baml",
  "bh",
  "bin",
  "bk",
  "bmp",
  "btif",
  "bz2",
  "bzip2",
  "cab",
  "caf",
  "cgm",
  "class",
  "cmx",
  "cpio",
  "cr2",
  "cur",
  "dat",
  "dcm",
  "deb",
  "dex",
  "djvu",
  "dll",
  "dmg",
  "dng",
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dra",
  "DS_Store",
  "dsk",
  "dts",
  "dtshd",
  "dvb",
  "dwg",
  "dxf",
  "ecelp4800",
  "ecelp7470",
  "ecelp9600",
  "egg",
  "eol",
  "eot",
  "epub",
  "exe",
  "f4v",
  "fbs",
  "fh",
  "fla",
  "flac",
  "flatpak",
  "fli",
  "flv",
  "fpx",
  "fst",
  "fvt",
  "g3",
  "gh",
  "gif",
  "graffle",
  "gz",
  "gzip",
  "h261",
  "h263",
  "h264",
  "icns",
  "ico",
  "ief",
  "img",
  "ipa",
  "iso",
  "jar",
  "jpeg",
  "jpg",
  "jpgv",
  "jpm",
  "jxr",
  "key",
  "ktx",
  "lha",
  "lib",
  "lvp",
  "lz",
  "lzh",
  "lzma",
  "lzo",
  "m3u",
  "m4a",
  "m4v",
  "mar",
  "mdi",
  "mht",
  "mid",
  "midi",
  "mj2",
  "mka",
  "mkv",
  "mmr",
  "mng",
  "mobi",
  "mov",
  "movie",
  "mp3",
  "mp4",
  "mp4a",
  "mpeg",
  "mpg",
  "mpga",
  "mxu",
  "nef",
  "npx",
  "numbers",
  "nupkg",
  "o",
  "odp",
  "ods",
  "odt",
  "oga",
  "ogg",
  "ogv",
  "otf",
  "ott",
  "pages",
  "pbm",
  "pcx",
  "pdb",
  "pdf",
  "pea",
  "pgm",
  "pic",
  "png",
  "pnm",
  "pot",
  "potm",
  "potx",
  "ppa",
  "ppam",
  "ppm",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "psd",
  "pya",
  "pyc",
  "pyo",
  "pyv",
  "qt",
  "rar",
  "ras",
  "raw",
  "resources",
  "rgb",
  "rip",
  "rlc",
  "rmf",
  "rmvb",
  "rpm",
  "rtf",
  "rz",
  "s3m",
  "s7z",
  "scpt",
  "sgi",
  "shar",
  "snap",
  "sil",
  "sketch",
  "slk",
  "smv",
  "snk",
  "so",
  "stl",
  "suo",
  "sub",
  "swf",
  "tar",
  "tbz",
  "tbz2",
  "tga",
  "tgz",
  "thmx",
  "tif",
  "tiff",
  "tlz",
  "ttc",
  "ttf",
  "txz",
  "udf",
  "uvh",
  "uvi",
  "uvm",
  "uvp",
  "uvs",
  "uvu",
  "viv",
  "vob",
  "war",
  "wav",
  "wax",
  "wbmp",
  "wdp",
  "weba",
  "webm",
  "webp",
  "whl",
  "wim",
  "wm",
  "wma",
  "wmv",
  "wmx",
  "woff",
  "woff2",
  "wrm",
  "wvx",
  "xbm",
  "xif",
  "xla",
  "xlam",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
  "xm",
  "xmind",
  "xpi",
  "xpm",
  "xwd",
  "xz",
  "z",
  "zip",
  "zipx"
]);
var isBinaryPath = (filePath) => binaryExtensions.has(sysPath.extname(filePath).slice(1).toLowerCase());
var foreach = (val, fn) => {
  if (val instanceof Set) {
    val.forEach(fn);
  } else {
    fn(val);
  }
};
var addAndConvert = (main, prop, item) => {
  let container = main[prop];
  if (!(container instanceof Set)) {
    main[prop] = container = /* @__PURE__ */ new Set([container]);
  }
  container.add(item);
};
var clearItem = (cont) => (key) => {
  const set = cont[key];
  if (set instanceof Set) {
    set.clear();
  } else {
    delete cont[key];
  }
};
var delFromSet = (main, prop, item) => {
  const container = main[prop];
  if (container instanceof Set) {
    container.delete(item);
  } else if (container === item) {
    delete main[prop];
  }
};
var isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
var FsWatchInstances = /* @__PURE__ */ new Map();
function createFsWatchInstance(path, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path);
    emitRaw(rawEvent, evPath, { watchedPath: path });
    if (evPath && path !== evPath) {
      fsWatchBroadcast(sysPath.resolve(path, evPath), KEY_LISTENERS, sysPath.join(path, evPath));
    }
  };
  try {
    return (0, import_fs.watch)(path, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
var fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
  const cont = FsWatchInstances.get(fullPath);
  if (!cont)
    return;
  foreach(cont[listenerType], (listener) => {
    listener(val1, val2, val3);
  });
};
var setFsWatchListener = (path, fullPath, options, handlers) => {
  const { listener, errHandler, rawEmitter } = handlers;
  let cont = FsWatchInstances.get(fullPath);
  let watcher;
  if (!options.persistent) {
    watcher = createFsWatchInstance(path, options, listener, errHandler, rawEmitter);
    if (!watcher)
      return;
    return watcher.close.bind(watcher);
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_ERR, errHandler);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    watcher = createFsWatchInstance(
      path,
      options,
      fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
      errHandler,
      // no need to use broadcast here
      fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
    );
    if (!watcher)
      return;
    watcher.on(EV.ERROR, async (error) => {
      const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
      if (cont)
        cont.watcherUnusable = true;
      if (isWindows && error.code === "EPERM") {
        try {
          const fd = await (0, import_promises2.open)(path, "r");
          await fd.close();
          broadcastErr(error);
        } catch (err) {
        }
      } else {
        broadcastErr(error);
      }
    });
    cont = {
      listeners: listener,
      errHandlers: errHandler,
      rawEmitters: rawEmitter,
      watcher
    };
    FsWatchInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_ERR, errHandler);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      cont.watcher.close();
      FsWatchInstances.delete(fullPath);
      HANDLER_KEYS.forEach(clearItem(cont));
      cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var FsWatchFileInstances = /* @__PURE__ */ new Map();
var setFsWatchFileListener = (path, fullPath, options, handlers) => {
  const { listener, rawEmitter } = handlers;
  let cont = FsWatchFileInstances.get(fullPath);
  const copts = cont && cont.options;
  if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
    (0, import_fs.unwatchFile)(fullPath);
    cont = void 0;
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    cont = {
      listeners: listener,
      rawEmitters: rawEmitter,
      options,
      watcher: (0, import_fs.watchFile)(fullPath, options, (curr, prev) => {
        foreach(cont.rawEmitters, (rawEmitter2) => {
          rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
        });
        const currmtime = curr.mtimeMs;
        if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
          foreach(cont.listeners, (listener2) => listener2(path, curr));
        }
      })
    };
    FsWatchFileInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      FsWatchFileInstances.delete(fullPath);
      (0, import_fs.unwatchFile)(fullPath);
      cont.options = cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var NodeFsHandler = class {
  constructor(fsW) {
    this.fsw = fsW;
    this._boundHandleError = (error) => fsW._handleError(error);
  }
  /**
   * Watch file for changes with fs_watchFile or fs_watch.
   * @param path to file or dir
   * @param listener on fs change
   * @returns closer for the watcher instance
   */
  _watchWithNodeFs(path, listener) {
    const opts = this.fsw.options;
    const directory = sysPath.dirname(path);
    const basename3 = sysPath.basename(path);
    const parent = this.fsw._getWatchedDir(directory);
    parent.add(basename3);
    const absolutePath = sysPath.resolve(path);
    const options = {
      persistent: opts.persistent
    };
    if (!listener)
      listener = EMPTY_FN;
    let closer;
    if (opts.usePolling) {
      const enableBin = opts.interval !== opts.binaryInterval;
      options.interval = enableBin && isBinaryPath(basename3) ? opts.binaryInterval : opts.interval;
      closer = setFsWatchFileListener(path, absolutePath, options, {
        listener,
        rawEmitter: this.fsw._emitRaw
      });
    } else {
      closer = setFsWatchListener(path, absolutePath, options, {
        listener,
        errHandler: this._boundHandleError,
        rawEmitter: this.fsw._emitRaw
      });
    }
    return closer;
  }
  /**
   * Watch a file and emit add event if warranted.
   * @returns closer for the watcher instance
   */
  _handleFile(file, stats, initialAdd) {
    if (this.fsw.closed) {
      return;
    }
    const dirname3 = sysPath.dirname(file);
    const basename3 = sysPath.basename(file);
    const parent = this.fsw._getWatchedDir(dirname3);
    let prevStats = stats;
    if (parent.has(basename3))
      return;
    const listener = async (path, newStats) => {
      if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
        return;
      if (!newStats || newStats.mtimeMs === 0) {
        try {
          const newStats2 = await (0, import_promises2.stat)(file);
          if (this.fsw.closed)
            return;
          const at = newStats2.atimeMs;
          const mt = newStats2.mtimeMs;
          if (!at || at <= mt || mt !== prevStats.mtimeMs) {
            this.fsw._emit(EV.CHANGE, file, newStats2);
          }
          if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
            this.fsw._closeFile(path);
            prevStats = newStats2;
            const closer2 = this._watchWithNodeFs(file, listener);
            if (closer2)
              this.fsw._addPathCloser(path, closer2);
          } else {
            prevStats = newStats2;
          }
        } catch (error) {
          this.fsw._remove(dirname3, basename3);
        }
      } else if (parent.has(basename3)) {
        const at = newStats.atimeMs;
        const mt = newStats.mtimeMs;
        if (!at || at <= mt || mt !== prevStats.mtimeMs) {
          this.fsw._emit(EV.CHANGE, file, newStats);
        }
        prevStats = newStats;
      }
    };
    const closer = this._watchWithNodeFs(file, listener);
    if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
      if (!this.fsw._throttle(EV.ADD, file, 0))
        return;
      this.fsw._emit(EV.ADD, file, stats);
    }
    return closer;
  }
  /**
   * Handle symlinks encountered while reading a dir.
   * @param entry returned by readdirp
   * @param directory path of dir being read
   * @param path of this item
   * @param item basename of this item
   * @returns true if no more processing is needed for this entry.
   */
  async _handleSymlink(entry, directory, path, item) {
    if (this.fsw.closed) {
      return;
    }
    const full = entry.fullPath;
    const dir = this.fsw._getWatchedDir(directory);
    if (!this.fsw.options.followSymlinks) {
      this.fsw._incrReadyCount();
      let linkPath;
      try {
        linkPath = await (0, import_promises2.realpath)(path);
      } catch (e) {
        this.fsw._emitReady();
        return true;
      }
      if (this.fsw.closed)
        return;
      if (dir.has(item)) {
        if (this.fsw._symlinkPaths.get(full) !== linkPath) {
          this.fsw._symlinkPaths.set(full, linkPath);
          this.fsw._emit(EV.CHANGE, path, entry.stats);
        }
      } else {
        dir.add(item);
        this.fsw._symlinkPaths.set(full, linkPath);
        this.fsw._emit(EV.ADD, path, entry.stats);
      }
      this.fsw._emitReady();
      return true;
    }
    if (this.fsw._symlinkPaths.has(full)) {
      return true;
    }
    this.fsw._symlinkPaths.set(full, true);
  }
  _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
    directory = sysPath.join(directory, "");
    throttler = this.fsw._throttle("readdir", directory, 1e3);
    if (!throttler)
      return;
    const previous = this.fsw._getWatchedDir(wh.path);
    const current = /* @__PURE__ */ new Set();
    let stream = this.fsw._readdirp(directory, {
      fileFilter: (entry) => wh.filterPath(entry),
      directoryFilter: (entry) => wh.filterDir(entry)
    });
    if (!stream)
      return;
    stream.on(STR_DATA, async (entry) => {
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      const item = entry.path;
      let path = sysPath.join(directory, item);
      current.add(item);
      if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path, item)) {
        return;
      }
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      if (item === target || !target && !previous.has(item)) {
        this.fsw._incrReadyCount();
        path = sysPath.join(dir, sysPath.relative(dir, path));
        this._addToNodeFs(path, initialAdd, wh, depth + 1);
      }
    }).on(EV.ERROR, this._boundHandleError);
    return new Promise((resolve4, reject) => {
      if (!stream)
        return reject();
      stream.once(STR_END, () => {
        if (this.fsw.closed) {
          stream = void 0;
          return;
        }
        const wasThrottled = throttler ? throttler.clear() : false;
        resolve4(void 0);
        previous.getChildren().filter((item) => {
          return item !== directory && !current.has(item);
        }).forEach((item) => {
          this.fsw._remove(directory, item);
        });
        stream = void 0;
        if (wasThrottled)
          this._handleRead(directory, false, wh, target, dir, depth, throttler);
      });
    });
  }
  /**
   * Read directory to add / remove files from `@watched` list and re-read it on change.
   * @param dir fs path
   * @param stats
   * @param initialAdd
   * @param depth relative to user-supplied path
   * @param target child path targeted for watch
   * @param wh Common watch helpers for this path
   * @param realpath
   * @returns closer for the watcher instance.
   */
  async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath2) {
    const parentDir = this.fsw._getWatchedDir(sysPath.dirname(dir));
    const tracked = parentDir.has(sysPath.basename(dir));
    if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
      this.fsw._emit(EV.ADD_DIR, dir, stats);
    }
    parentDir.add(sysPath.basename(dir));
    this.fsw._getWatchedDir(dir);
    let throttler;
    let closer;
    const oDepth = this.fsw.options.depth;
    if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath2)) {
      if (!target) {
        await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
        if (this.fsw.closed)
          return;
      }
      closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
        if (stats2 && stats2.mtimeMs === 0)
          return;
        this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
      });
    }
    return closer;
  }
  /**
   * Handle added file, directory, or glob pattern.
   * Delegates call to _handleFile / _handleDir after checks.
   * @param path to file or ir
   * @param initialAdd was the file added at watch instantiation?
   * @param priorWh depth relative to user-supplied path
   * @param depth Child path actually targeted for watch
   * @param target Child path actually targeted for watch
   */
  async _addToNodeFs(path, initialAdd, priorWh, depth, target) {
    const ready = this.fsw._emitReady;
    if (this.fsw._isIgnored(path) || this.fsw.closed) {
      ready();
      return false;
    }
    const wh = this.fsw._getWatchHelpers(path);
    if (priorWh) {
      wh.filterPath = (entry) => priorWh.filterPath(entry);
      wh.filterDir = (entry) => priorWh.filterDir(entry);
    }
    try {
      const stats = await statMethods[wh.statMethod](wh.watchPath);
      if (this.fsw.closed)
        return;
      if (this.fsw._isIgnored(wh.watchPath, stats)) {
        ready();
        return false;
      }
      const follow = this.fsw.options.followSymlinks;
      let closer;
      if (stats.isDirectory()) {
        const absPath = sysPath.resolve(path);
        const targetPath = follow ? await (0, import_promises2.realpath)(path) : path;
        if (this.fsw.closed)
          return;
        closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (absPath !== targetPath && targetPath !== void 0) {
          this.fsw._symlinkPaths.set(absPath, targetPath);
        }
      } else if (stats.isSymbolicLink()) {
        const targetPath = follow ? await (0, import_promises2.realpath)(path) : path;
        if (this.fsw.closed)
          return;
        const parent = sysPath.dirname(wh.watchPath);
        this.fsw._getWatchedDir(parent).add(wh.watchPath);
        this.fsw._emit(EV.ADD, wh.watchPath, stats);
        closer = await this._handleDir(parent, stats, initialAdd, depth, path, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (targetPath !== void 0) {
          this.fsw._symlinkPaths.set(sysPath.resolve(path), targetPath);
        }
      } else {
        closer = this._handleFile(wh.watchPath, stats, initialAdd);
      }
      ready();
      if (closer)
        this.fsw._addPathCloser(path, closer);
      return false;
    } catch (error) {
      if (this.fsw._handleError(error)) {
        ready();
        return path;
      }
    }
  }
};

// ../../node_modules/chokidar/esm/index.js
var SLASH = "/";
var SLASH_SLASH = "//";
var ONE_DOT = ".";
var TWO_DOTS = "..";
var STRING_TYPE = "string";
var BACK_SLASH_RE = /\\/g;
var DOUBLE_SLASH_RE = /\/\//;
var DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
var REPLACER_RE = /^\.[/\\]/;
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
var isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative3 = sysPath2.relative(matcher.path, string);
        if (!relative3) {
          return false;
        }
        return !relative3.startsWith("..") && !sysPath2.isAbsolute(relative3);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath(path) {
  if (typeof path !== "string")
    throw new Error("string expected");
  path = sysPath2.normalize(path);
  path = path.replace(/\\/g, "/");
  let prepend = false;
  if (path.startsWith("//"))
    prepend = true;
  const DOUBLE_SLASH_RE2 = /\/\//;
  while (path.match(DOUBLE_SLASH_RE2))
    path = path.replace(DOUBLE_SLASH_RE2, "/");
  if (prepend)
    path = "/" + path;
  return path;
}
function matchPatterns(patterns, testString, stats) {
  const path = normalizePath(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  if (testString == null) {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
  return matchPatterns(patterns, testString);
}
var unifyPaths = (paths_) => {
  const paths = arrify(paths_).flat();
  if (!paths.every((p) => typeof p === STRING_TYPE)) {
    throw new TypeError(`Non-string provided as watch path: ${paths}`);
  }
  return paths.map(normalizePathToUnix);
};
var toUnix = (string) => {
  let str = string.replace(BACK_SLASH_RE, SLASH);
  let prepend = false;
  if (str.startsWith(SLASH_SLASH)) {
    prepend = true;
  }
  while (str.match(DOUBLE_SLASH_RE)) {
    str = str.replace(DOUBLE_SLASH_RE, SLASH);
  }
  if (prepend) {
    str = SLASH + str;
  }
  return str;
};
var normalizePathToUnix = (path) => toUnix(sysPath2.normalize(toUnix(path)));
var normalizeIgnored = (cwd = "") => (path) => {
  if (typeof path === "string") {
    return normalizePathToUnix(sysPath2.isAbsolute(path) ? path : sysPath2.join(cwd, path));
  } else {
    return path;
  }
};
var getAbsolutePath = (path, cwd) => {
  if (sysPath2.isAbsolute(path)) {
    return path;
  }
  return sysPath2.join(cwd, path);
};
var EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
var DirEntry = class {
  constructor(dir, removeWatcher) {
    this.path = dir;
    this._removeWatcher = removeWatcher;
    this.items = /* @__PURE__ */ new Set();
  }
  add(item) {
    const { items } = this;
    if (!items)
      return;
    if (item !== ONE_DOT && item !== TWO_DOTS)
      items.add(item);
  }
  async remove(item) {
    const { items } = this;
    if (!items)
      return;
    items.delete(item);
    if (items.size > 0)
      return;
    const dir = this.path;
    try {
      await (0, import_promises3.readdir)(dir);
    } catch (err) {
      if (this._removeWatcher) {
        this._removeWatcher(sysPath2.dirname(dir), sysPath2.basename(dir));
      }
    }
  }
  has(item) {
    const { items } = this;
    if (!items)
      return;
    return items.has(item);
  }
  getChildren() {
    const { items } = this;
    if (!items)
      return [];
    return [...items.values()];
  }
  dispose() {
    this.items.clear();
    this.path = "";
    this._removeWatcher = EMPTY_FN;
    this.items = EMPTY_SET;
    Object.freeze(this);
  }
};
var STAT_METHOD_F = "stat";
var STAT_METHOD_L = "lstat";
var WatchHelper = class {
  constructor(path, follow, fsw) {
    this.fsw = fsw;
    const watchPath = path;
    this.path = path = path.replace(REPLACER_RE, "");
    this.watchPath = watchPath;
    this.fullWatchPath = sysPath2.resolve(watchPath);
    this.dirParts = [];
    this.dirParts.forEach((parts) => {
      if (parts.length > 1)
        parts.pop();
    });
    this.followSymlinks = follow;
    this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
  }
  entryPath(entry) {
    return sysPath2.join(this.watchPath, sysPath2.relative(this.watchPath, entry.fullPath));
  }
  filterPath(entry) {
    const { stats } = entry;
    if (stats && stats.isSymbolicLink())
      return this.filterDir(entry);
    const resolvedPath = this.entryPath(entry);
    return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
  }
  filterDir(entry) {
    return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
  }
};
var FSWatcher = class extends import_events.EventEmitter {
  // Not indenting methods for history sake; for now.
  constructor(_opts = {}) {
    super();
    this.closed = false;
    this._closers = /* @__PURE__ */ new Map();
    this._ignoredPaths = /* @__PURE__ */ new Set();
    this._throttled = /* @__PURE__ */ new Map();
    this._streams = /* @__PURE__ */ new Set();
    this._symlinkPaths = /* @__PURE__ */ new Map();
    this._watched = /* @__PURE__ */ new Map();
    this._pendingWrites = /* @__PURE__ */ new Map();
    this._pendingUnlinks = /* @__PURE__ */ new Map();
    this._readyCount = 0;
    this._readyEmitted = false;
    const awf = _opts.awaitWriteFinish;
    const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
    const opts = {
      // Defaults
      persistent: true,
      ignoreInitial: false,
      ignorePermissionErrors: false,
      interval: 100,
      binaryInterval: 300,
      followSymlinks: true,
      usePolling: false,
      // useAsync: false,
      atomic: true,
      // NOTE: overwritten later (depends on usePolling)
      ..._opts,
      // Change format
      ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
      awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
    };
    if (isIBMi)
      opts.usePolling = true;
    if (opts.atomic === void 0)
      opts.atomic = !opts.usePolling;
    const envPoll = process.env.CHOKIDAR_USEPOLLING;
    if (envPoll !== void 0) {
      const envLower = envPoll.toLowerCase();
      if (envLower === "false" || envLower === "0")
        opts.usePolling = false;
      else if (envLower === "true" || envLower === "1")
        opts.usePolling = true;
      else
        opts.usePolling = !!envLower;
    }
    const envInterval = process.env.CHOKIDAR_INTERVAL;
    if (envInterval)
      opts.interval = Number.parseInt(envInterval, 10);
    let readyCalls = 0;
    this._emitReady = () => {
      readyCalls++;
      if (readyCalls >= this._readyCount) {
        this._emitReady = EMPTY_FN;
        this._readyEmitted = true;
        process.nextTick(() => this.emit(EVENTS.READY));
      }
    };
    this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
    this._boundRemove = this._remove.bind(this);
    this.options = opts;
    this._nodeFsHandler = new NodeFsHandler(this);
    Object.freeze(opts);
  }
  _addIgnoredPath(matcher) {
    if (isMatcherObject(matcher)) {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
          return;
        }
      }
    }
    this._ignoredPaths.add(matcher);
  }
  _removeIgnoredPath(matcher) {
    this._ignoredPaths.delete(matcher);
    if (typeof matcher === "string") {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher) {
          this._ignoredPaths.delete(ignored);
        }
      }
    }
  }
  // Public methods
  /**
   * Adds paths to be watched on an existing FSWatcher instance.
   * @param paths_ file or file list. Other arguments are unused
   */
  add(paths_, _origAdd, _internal) {
    const { cwd } = this.options;
    this.closed = false;
    this._closePromise = void 0;
    let paths = unifyPaths(paths_);
    if (cwd) {
      paths = paths.map((path) => {
        const absPath = getAbsolutePath(path, cwd);
        return absPath;
      });
    }
    paths.forEach((path) => {
      this._removeIgnoredPath(path);
    });
    this._userIgnored = void 0;
    if (!this._readyCount)
      this._readyCount = 0;
    this._readyCount += paths.length;
    Promise.all(paths.map(async (path) => {
      const res = await this._nodeFsHandler._addToNodeFs(path, !_internal, void 0, 0, _origAdd);
      if (res)
        this._emitReady();
      return res;
    })).then((results) => {
      if (this.closed)
        return;
      results.forEach((item) => {
        if (item)
          this.add(sysPath2.dirname(item), sysPath2.basename(_origAdd || item));
      });
    });
    return this;
  }
  /**
   * Close watchers or start ignoring events from specified paths.
   */
  unwatch(paths_) {
    if (this.closed)
      return this;
    const paths = unifyPaths(paths_);
    const { cwd } = this.options;
    paths.forEach((path) => {
      if (!sysPath2.isAbsolute(path) && !this._closers.has(path)) {
        if (cwd)
          path = sysPath2.join(cwd, path);
        path = sysPath2.resolve(path);
      }
      this._closePath(path);
      this._addIgnoredPath(path);
      if (this._watched.has(path)) {
        this._addIgnoredPath({
          path,
          recursive: true
        });
      }
      this._userIgnored = void 0;
    });
    return this;
  }
  /**
   * Close watchers and remove all listeners from watched paths.
   */
  close() {
    if (this._closePromise) {
      return this._closePromise;
    }
    this.closed = true;
    this.removeAllListeners();
    const closers = [];
    this._closers.forEach((closerList) => closerList.forEach((closer) => {
      const promise = closer();
      if (promise instanceof Promise)
        closers.push(promise);
    }));
    this._streams.forEach((stream) => stream.destroy());
    this._userIgnored = void 0;
    this._readyCount = 0;
    this._readyEmitted = false;
    this._watched.forEach((dirent) => dirent.dispose());
    this._closers.clear();
    this._watched.clear();
    this._streams.clear();
    this._symlinkPaths.clear();
    this._throttled.clear();
    this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
    return this._closePromise;
  }
  /**
   * Expose list of watched paths
   * @returns for chaining
   */
  getWatched() {
    const watchList = {};
    this._watched.forEach((entry, dir) => {
      const key = this.options.cwd ? sysPath2.relative(this.options.cwd, dir) : dir;
      const index = key || ONE_DOT;
      watchList[index] = entry.getChildren().sort();
    });
    return watchList;
  }
  emitWithAll(event, args) {
    this.emit(event, ...args);
    if (event !== EVENTS.ERROR)
      this.emit(EVENTS.ALL, event, ...args);
  }
  // Common helpers
  // --------------
  /**
   * Normalize and emit events.
   * Calling _emit DOES NOT MEAN emit() would be called!
   * @param event Type of event
   * @param path File or directory path
   * @param stats arguments to be passed with event
   * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  async _emit(event, path, stats) {
    if (this.closed)
      return;
    const opts = this.options;
    if (isWindows)
      path = sysPath2.normalize(path);
    if (opts.cwd)
      path = sysPath2.relative(opts.cwd, path);
    const args = [path];
    if (stats != null)
      args.push(stats);
    const awf = opts.awaitWriteFinish;
    let pw;
    if (awf && (pw = this._pendingWrites.get(path))) {
      pw.lastChange = /* @__PURE__ */ new Date();
      return this;
    }
    if (opts.atomic) {
      if (event === EVENTS.UNLINK) {
        this._pendingUnlinks.set(path, [event, ...args]);
        setTimeout(() => {
          this._pendingUnlinks.forEach((entry, path2) => {
            this.emit(...entry);
            this.emit(EVENTS.ALL, ...entry);
            this._pendingUnlinks.delete(path2);
          });
        }, typeof opts.atomic === "number" ? opts.atomic : 100);
        return this;
      }
      if (event === EVENTS.ADD && this._pendingUnlinks.has(path)) {
        event = EVENTS.CHANGE;
        this._pendingUnlinks.delete(path);
      }
    }
    if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
      const awfEmit = (err, stats2) => {
        if (err) {
          event = EVENTS.ERROR;
          args[0] = err;
          this.emitWithAll(event, args);
        } else if (stats2) {
          if (args.length > 1) {
            args[1] = stats2;
          } else {
            args.push(stats2);
          }
          this.emitWithAll(event, args);
        }
      };
      this._awaitWriteFinish(path, awf.stabilityThreshold, event, awfEmit);
      return this;
    }
    if (event === EVENTS.CHANGE) {
      const isThrottled = !this._throttle(EVENTS.CHANGE, path, 50);
      if (isThrottled)
        return this;
    }
    if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
      const fullPath = opts.cwd ? sysPath2.join(opts.cwd, path) : path;
      let stats2;
      try {
        stats2 = await (0, import_promises3.stat)(fullPath);
      } catch (err) {
      }
      if (!stats2 || this.closed)
        return;
      args.push(stats2);
    }
    this.emitWithAll(event, args);
    return this;
  }
  /**
   * Common handler for errors
   * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  _handleError(error) {
    const code = error && error.code;
    if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
      this.emit(EVENTS.ERROR, error);
    }
    return error || this.closed;
  }
  /**
   * Helper utility for throttling
   * @param actionType type being throttled
   * @param path being acted upon
   * @param timeout duration of time to suppress duplicate actions
   * @returns tracking object or false if action should be suppressed
   */
  _throttle(actionType, path, timeout) {
    if (!this._throttled.has(actionType)) {
      this._throttled.set(actionType, /* @__PURE__ */ new Map());
    }
    const action = this._throttled.get(actionType);
    if (!action)
      throw new Error("invalid throttle");
    const actionPath = action.get(path);
    if (actionPath) {
      actionPath.count++;
      return false;
    }
    let timeoutObject;
    const clear = () => {
      const item = action.get(path);
      const count = item ? item.count : 0;
      action.delete(path);
      clearTimeout(timeoutObject);
      if (item)
        clearTimeout(item.timeoutObject);
      return count;
    };
    timeoutObject = setTimeout(clear, timeout);
    const thr = { timeoutObject, clear, count: 0 };
    action.set(path, thr);
    return thr;
  }
  _incrReadyCount() {
    return this._readyCount++;
  }
  /**
   * Awaits write operation to finish.
   * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
   * @param path being acted upon
   * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
   * @param event
   * @param awfEmit Callback to be called when ready for event to be emitted.
   */
  _awaitWriteFinish(path, threshold, event, awfEmit) {
    const awf = this.options.awaitWriteFinish;
    if (typeof awf !== "object")
      return;
    const pollInterval = awf.pollInterval;
    let timeoutHandler;
    let fullPath = path;
    if (this.options.cwd && !sysPath2.isAbsolute(path)) {
      fullPath = sysPath2.join(this.options.cwd, path);
    }
    const now = /* @__PURE__ */ new Date();
    const writes = this._pendingWrites;
    function awaitWriteFinishFn(prevStat) {
      (0, import_fs2.stat)(fullPath, (err, curStat) => {
        if (err || !writes.has(path)) {
          if (err && err.code !== "ENOENT")
            awfEmit(err);
          return;
        }
        const now2 = Number(/* @__PURE__ */ new Date());
        if (prevStat && curStat.size !== prevStat.size) {
          writes.get(path).lastChange = now2;
        }
        const pw = writes.get(path);
        const df = now2 - pw.lastChange;
        if (df >= threshold) {
          writes.delete(path);
          awfEmit(void 0, curStat);
        } else {
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
        }
      });
    }
    if (!writes.has(path)) {
      writes.set(path, {
        lastChange: now,
        cancelWait: () => {
          writes.delete(path);
          clearTimeout(timeoutHandler);
          return event;
        }
      });
      timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
    }
  }
  /**
   * Determines whether user has asked to ignore this path.
   */
  _isIgnored(path, stats) {
    if (this.options.atomic && DOT_RE.test(path))
      return true;
    if (!this._userIgnored) {
      const { cwd } = this.options;
      const ign = this.options.ignored;
      const ignored = (ign || []).map(normalizeIgnored(cwd));
      const ignoredPaths = [...this._ignoredPaths];
      const list = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
      this._userIgnored = anymatch(list, void 0);
    }
    return this._userIgnored(path, stats);
  }
  _isntIgnored(path, stat4) {
    return !this._isIgnored(path, stat4);
  }
  /**
   * Provides a set of common helpers and properties relating to symlink handling.
   * @param path file or directory pattern being watched
   */
  _getWatchHelpers(path) {
    return new WatchHelper(path, this.options.followSymlinks, this);
  }
  // Directory helpers
  // -----------------
  /**
   * Provides directory tracking objects
   * @param directory path of the directory
   */
  _getWatchedDir(directory) {
    const dir = sysPath2.resolve(directory);
    if (!this._watched.has(dir))
      this._watched.set(dir, new DirEntry(dir, this._boundRemove));
    return this._watched.get(dir);
  }
  // File helpers
  // ------------
  /**
   * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
   */
  _hasReadPermissions(stats) {
    if (this.options.ignorePermissionErrors)
      return true;
    return Boolean(Number(stats.mode) & 256);
  }
  /**
   * Handles emitting unlink events for
   * files and directories, and via recursion, for
   * files and directories within directories that are unlinked
   * @param directory within which the following item is located
   * @param item      base path of item/directory
   */
  _remove(directory, item, isDirectory) {
    const path = sysPath2.join(directory, item);
    const fullPath = sysPath2.resolve(path);
    isDirectory = isDirectory != null ? isDirectory : this._watched.has(path) || this._watched.has(fullPath);
    if (!this._throttle("remove", path, 100))
      return;
    if (!isDirectory && this._watched.size === 1) {
      this.add(directory, item, true);
    }
    const wp = this._getWatchedDir(path);
    const nestedDirectoryChildren = wp.getChildren();
    nestedDirectoryChildren.forEach((nested) => this._remove(path, nested));
    const parent = this._getWatchedDir(directory);
    const wasTracked = parent.has(item);
    parent.remove(item);
    if (this._symlinkPaths.has(fullPath)) {
      this._symlinkPaths.delete(fullPath);
    }
    let relPath = path;
    if (this.options.cwd)
      relPath = sysPath2.relative(this.options.cwd, path);
    if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
      const event = this._pendingWrites.get(relPath).cancelWait();
      if (event === EVENTS.ADD)
        return;
    }
    this._watched.delete(path);
    this._watched.delete(fullPath);
    const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
    if (wasTracked && !this._isIgnored(path))
      this._emit(eventName, path);
    this._closePath(path);
  }
  /**
   * Closes all watchers for a path
   */
  _closePath(path) {
    this._closeFile(path);
    const dir = sysPath2.dirname(path);
    this._getWatchedDir(dir).remove(sysPath2.basename(path));
  }
  /**
   * Closes only file-specific watchers
   */
  _closeFile(path) {
    const closers = this._closers.get(path);
    if (!closers)
      return;
    closers.forEach((closer) => closer());
    this._closers.delete(path);
  }
  _addPathCloser(path, closer) {
    if (!closer)
      return;
    let list = this._closers.get(path);
    if (!list) {
      list = [];
      this._closers.set(path, list);
    }
    list.push(closer);
  }
  _readdirp(root, opts) {
    if (this.closed)
      return;
    const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
    let stream = readdirp(root, options);
    this._streams.add(stream);
    stream.once(STR_CLOSE, () => {
      stream = void 0;
    });
    stream.once(STR_END, () => {
      if (stream) {
        this._streams.delete(stream);
        stream = void 0;
      }
    });
    return stream;
  }
};
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}
var esm_default = { watch, FSWatcher };

// src/tweak-discovery.ts
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
var ENTRY_CANDIDATES = ["index.js", "index.cjs", "index.mjs"];
function discoverTweaks(tweaksDir) {
  if (!(0, import_node_fs.existsSync)(tweaksDir)) return [];
  const out = [];
  for (const name of (0, import_node_fs.readdirSync)(tweaksDir)) {
    const dir = (0, import_node_path2.join)(tweaksDir, name);
    if (!(0, import_node_fs.statSync)(dir).isDirectory()) continue;
    const manifestPath = (0, import_node_path2.join)(dir, "manifest.json");
    if (!(0, import_node_fs.existsSync)(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse((0, import_node_fs.readFileSync)(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (!isValidManifest(manifest)) continue;
    const entry = resolveEntry(dir, manifest);
    if (!entry) continue;
    out.push({ dir, entry, manifest });
  }
  return out;
}
function isValidManifest(m) {
  if (!m.id || !m.name || !m.version || !m.githubRepo) return false;
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(m.githubRepo)) return false;
  if (m.scope && !["renderer", "main", "both"].includes(m.scope)) return false;
  return true;
}
function resolveEntry(dir, m) {
  if (m.main) {
    const p = (0, import_node_path2.join)(dir, m.main);
    return (0, import_node_fs.existsSync)(p) ? p : null;
  }
  for (const c of ENTRY_CANDIDATES) {
    const p = (0, import_node_path2.join)(dir, c);
    if ((0, import_node_fs.existsSync)(p)) return p;
  }
  return null;
}

// src/storage.ts
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");
var FLUSH_DELAY_MS = 50;
function createDiskStorage(rootDir, id) {
  const dir = (0, import_node_path3.join)(rootDir, "storage");
  (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  const file = (0, import_node_path3.join)(dir, `${sanitize(id)}.json`);
  let data = {};
  if ((0, import_node_fs2.existsSync)(file)) {
    try {
      data = JSON.parse((0, import_node_fs2.readFileSync)(file, "utf8"));
    } catch {
      try {
        (0, import_node_fs2.renameSync)(file, `${file}.corrupt-${Date.now()}`);
      } catch {
      }
      data = {};
    }
  }
  let dirty = false;
  let timer = null;
  const scheduleFlush = () => {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (dirty) flush();
    }, FLUSH_DELAY_MS);
  };
  const flush = () => {
    if (!dirty) return;
    const tmp = `${file}.tmp`;
    try {
      (0, import_node_fs2.writeFileSync)(tmp, JSON.stringify(data, null, 2), "utf8");
      (0, import_node_fs2.renameSync)(tmp, file);
      dirty = false;
    } catch (e) {
      console.error("[codex-plusplus] storage flush failed:", id, e);
    }
  };
  return {
    get: (k, d) => Object.prototype.hasOwnProperty.call(data, k) ? data[k] : d,
    set(k, v) {
      data[k] = v;
      scheduleFlush();
    },
    delete(k) {
      if (k in data) {
        delete data[k];
        scheduleFlush();
      }
    },
    all: () => ({ ...data }),
    flush
  };
}
function sanitize(id) {
  return id.replace(/[^a-zA-Z0-9._@-]/g, "_");
}

// src/main.ts
var userRoot = process.env.CODEX_PLUSPLUS_USER_ROOT;
var runtimeDir = process.env.CODEX_PLUSPLUS_RUNTIME;
if (!userRoot || !runtimeDir) {
  throw new Error(
    "codex-plusplus runtime started without CODEX_PLUSPLUS_USER_ROOT/RUNTIME envs"
  );
}
var PRELOAD_PATH = (0, import_node_path4.resolve)(runtimeDir, "preload.js");
var TWEAKS_DIR = (0, import_node_path4.join)(userRoot, "tweaks");
var LOG_DIR = (0, import_node_path4.join)(userRoot, "log");
var LOG_FILE = (0, import_node_path4.join)(LOG_DIR, "main.log");
var CONFIG_FILE = (0, import_node_path4.join)(userRoot, "config.json");
var CODEX_PLUSPLUS_VERSION = "0.1.0";
var CODEX_PLUSPLUS_REPO = "b-nnett/codex-plusplus";
(0, import_node_fs3.mkdirSync)(LOG_DIR, { recursive: true });
(0, import_node_fs3.mkdirSync)(TWEAKS_DIR, { recursive: true });
if (process.env.CODEXPP_REMOTE_DEBUG === "1") {
  const port = process.env.CODEXPP_REMOTE_DEBUG_PORT ?? "9222";
  import_electron.app.commandLine.appendSwitch("remote-debugging-port", port);
  log("info", `remote debugging enabled on port ${port}`);
}
function readState() {
  try {
    return JSON.parse((0, import_node_fs3.readFileSync)(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeState(s) {
  try {
    (0, import_node_fs3.writeFileSync)(CONFIG_FILE, JSON.stringify(s, null, 2));
  } catch (e) {
    log("warn", "writeState failed:", String(e.message));
  }
}
function isCodexPlusPlusAutoUpdateEnabled() {
  return readState().codexPlusPlus?.autoUpdate !== false;
}
function setCodexPlusPlusAutoUpdate(enabled) {
  const s = readState();
  s.codexPlusPlus ??= {};
  s.codexPlusPlus.autoUpdate = enabled;
  writeState(s);
}
function isTweakEnabled(id) {
  const s = readState();
  return s.tweaks?.[id]?.enabled !== false;
}
function setTweakEnabled(id, enabled) {
  const s = readState();
  s.tweaks ??= {};
  s.tweaks[id] = { ...s.tweaks[id], enabled };
  writeState(s);
}
function log(level, ...args) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] [${level}] ${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}
`;
  try {
    (0, import_node_fs3.appendFileSync)(LOG_FILE, line);
  } catch {
  }
  if (level === "error") console.error("[codex-plusplus]", ...args);
}
process.on("uncaughtException", (e) => {
  log("error", "uncaughtException", { code: e.code, message: e.message, stack: e.stack });
});
process.on("unhandledRejection", (e) => {
  log("error", "unhandledRejection", { value: String(e) });
});
var tweakState = {
  discovered: [],
  loadedMain: /* @__PURE__ */ new Map()
};
function registerPreload(s, label) {
  try {
    const reg = s.registerPreloadScript;
    if (typeof reg === "function") {
      reg.call(s, { type: "frame", filePath: PRELOAD_PATH, id: "codex-plusplus" });
      log("info", `preload registered (registerPreloadScript) on ${label}:`, PRELOAD_PATH);
      return;
    }
    const existing = s.getPreloads();
    if (!existing.includes(PRELOAD_PATH)) {
      s.setPreloads([...existing, PRELOAD_PATH]);
    }
    log("info", `preload registered (setPreloads) on ${label}:`, PRELOAD_PATH);
  } catch (e) {
    if (e instanceof Error && e.message.includes("existing ID")) {
      log("info", `preload already registered on ${label}:`, PRELOAD_PATH);
      return;
    }
    log("error", `preload registration on ${label} failed:`, e);
  }
}
import_electron.app.whenReady().then(() => {
  log("info", "app ready fired");
  registerPreload(import_electron.session.defaultSession, "defaultSession");
});
import_electron.app.on("session-created", (s) => {
  registerPreload(s, "session-created");
});
import_electron.app.on("web-contents-created", (_e, wc) => {
  try {
    const wp = wc.getLastWebPreferences?.();
    log("info", "web-contents-created", {
      id: wc.id,
      type: wc.getType(),
      sessionIsDefault: wc.session === import_electron.session.defaultSession,
      sandbox: wp?.sandbox,
      contextIsolation: wp?.contextIsolation
    });
    wc.on("preload-error", (_ev, p, err) => {
      log("error", `wc ${wc.id} preload-error path=${p}`, String(err?.stack ?? err));
    });
  } catch (e) {
    log("error", "web-contents-created handler failed:", String(e?.stack ?? e));
  }
});
log("info", "main.ts evaluated; app.isReady=" + import_electron.app.isReady());
loadAllMainTweaks();
import_electron.app.on("will-quit", () => {
  stopAllMainTweaks();
  for (const t of tweakState.loadedMain.values()) {
    try {
      t.storage.flush();
    } catch {
    }
  }
});
import_electron.ipcMain.handle("codexpp:list-tweaks", async () => {
  await Promise.all(tweakState.discovered.map((t) => ensureTweakUpdateCheck(t)));
  const updateChecks = readState().tweakUpdateChecks ?? {};
  return tweakState.discovered.map((t) => ({
    manifest: t.manifest,
    entry: t.entry,
    dir: t.dir,
    entryExists: (0, import_node_fs3.existsSync)(t.entry),
    enabled: isTweakEnabled(t.manifest.id),
    update: updateChecks[t.manifest.id] ?? null
  }));
});
import_electron.ipcMain.handle("codexpp:get-tweak-enabled", (_e, id) => isTweakEnabled(id));
import_electron.ipcMain.handle("codexpp:set-tweak-enabled", (_e, id, enabled) => {
  setTweakEnabled(id, !!enabled);
  log("info", `tweak ${id} enabled=${!!enabled}`);
  broadcastReload();
  return true;
});
import_electron.ipcMain.handle("codexpp:get-config", () => {
  const s = readState();
  return {
    version: CODEX_PLUSPLUS_VERSION,
    autoUpdate: s.codexPlusPlus?.autoUpdate !== false,
    updateCheck: s.codexPlusPlus?.updateCheck ?? null
  };
});
import_electron.ipcMain.handle("codexpp:set-auto-update", (_e, enabled) => {
  setCodexPlusPlusAutoUpdate(!!enabled);
  return { autoUpdate: isCodexPlusPlusAutoUpdateEnabled() };
});
import_electron.ipcMain.handle("codexpp:check-codexpp-update", async (_e, force) => {
  return ensureCodexPlusPlusUpdateCheck(force === true);
});
import_electron.ipcMain.handle("codexpp:read-tweak-source", (_e, entryPath) => {
  const resolved = (0, import_node_path4.resolve)(entryPath);
  if (!resolved.startsWith(TWEAKS_DIR + "/") && resolved !== TWEAKS_DIR) {
    throw new Error("path outside tweaks dir");
  }
  return require("node:fs").readFileSync(resolved, "utf8");
});
var ASSET_MAX_BYTES = 1024 * 1024;
var MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};
import_electron.ipcMain.handle(
  "codexpp:read-tweak-asset",
  (_e, tweakDir, relPath) => {
    const fs = require("node:fs");
    const dir = (0, import_node_path4.resolve)(tweakDir);
    if (!dir.startsWith(TWEAKS_DIR + "/")) {
      throw new Error("tweakDir outside tweaks dir");
    }
    const full = (0, import_node_path4.resolve)(dir, relPath);
    if (!full.startsWith(dir + "/")) {
      throw new Error("path traversal");
    }
    const stat4 = fs.statSync(full);
    if (stat4.size > ASSET_MAX_BYTES) {
      throw new Error(`asset too large (${stat4.size} > ${ASSET_MAX_BYTES})`);
    }
    const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const buf = fs.readFileSync(full);
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
);
import_electron.ipcMain.on("codexpp:preload-log", (_e, level, msg) => {
  const lvl = level === "error" || level === "warn" ? level : "info";
  try {
    (0, import_node_fs3.appendFileSync)(
      (0, import_node_path4.join)(LOG_DIR, "preload.log"),
      `[${(/* @__PURE__ */ new Date()).toISOString()}] [${lvl}] ${msg}
`
    );
  } catch {
  }
});
import_electron.ipcMain.handle("codexpp:tweak-fs", (_e, op, id, p, c) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error("bad tweak id");
  if (p.includes("..")) throw new Error("path traversal");
  const dir = (0, import_node_path4.join)(userRoot, "tweak-data", id);
  (0, import_node_fs3.mkdirSync)(dir, { recursive: true });
  const full = (0, import_node_path4.join)(dir, p);
  const fs = require("node:fs");
  switch (op) {
    case "read":
      return fs.readFileSync(full, "utf8");
    case "write":
      return fs.writeFileSync(full, c ?? "", "utf8");
    case "exists":
      return fs.existsSync(full);
    case "dataDir":
      return dir;
    default:
      throw new Error(`unknown op: ${op}`);
  }
});
import_electron.ipcMain.handle("codexpp:user-paths", () => ({
  userRoot,
  runtimeDir,
  tweaksDir: TWEAKS_DIR,
  logDir: LOG_DIR
}));
import_electron.ipcMain.handle("codexpp:reveal", (_e, p) => {
  import_electron.shell.openPath(p).catch(() => {
  });
});
import_electron.ipcMain.handle("codexpp:open-external", (_e, url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("only github.com links can be opened from tweak metadata");
  }
  import_electron.shell.openExternal(parsed.toString()).catch(() => {
  });
});
import_electron.ipcMain.handle("codexpp:copy-text", (_e, text) => {
  import_electron.clipboard.writeText(String(text));
  return true;
});
import_electron.ipcMain.handle("codexpp:reload-tweaks", () => {
  log("info", "reloading tweaks (manual)");
  stopAllMainTweaks();
  clearTweakModuleCache();
  loadAllMainTweaks();
  broadcastReload();
  return { at: Date.now(), count: tweakState.discovered.length };
});
var RELOAD_DEBOUNCE_MS = 250;
var reloadTimer = null;
function scheduleReload(reason) {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    log("info", `reloading tweaks (${reason})`);
    stopAllMainTweaks();
    clearTweakModuleCache();
    loadAllMainTweaks();
    broadcastReload();
  }, RELOAD_DEBOUNCE_MS);
}
try {
  const watcher = esm_default.watch(TWEAKS_DIR, {
    ignoreInitial: true,
    // Wait for files to settle before triggering — guards against partially
    // written tweak files during editor saves / git checkouts.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    // Avoid eating CPU on huge node_modules trees inside tweak folders.
    ignored: (p) => p.includes(`${TWEAKS_DIR}/`) && /\/node_modules\//.test(p)
  });
  watcher.on("all", (event, path) => scheduleReload(`${event} ${path}`));
  watcher.on("error", (e) => log("warn", "watcher error:", e));
  log("info", "watching", TWEAKS_DIR);
  import_electron.app.on("will-quit", () => watcher.close().catch(() => {
  }));
} catch (e) {
  log("error", "failed to start watcher:", e);
}
function loadAllMainTweaks() {
  try {
    tweakState.discovered = discoverTweaks(TWEAKS_DIR);
    log(
      "info",
      `discovered ${tweakState.discovered.length} tweak(s):`,
      tweakState.discovered.map((t) => t.manifest.id).join(", ")
    );
  } catch (e) {
    log("error", "tweak discovery failed:", e);
    tweakState.discovered = [];
  }
  for (const t of tweakState.discovered) {
    if (t.manifest.scope === "renderer") continue;
    if (!isTweakEnabled(t.manifest.id)) {
      log("info", `skipping disabled main tweak: ${t.manifest.id}`);
      continue;
    }
    try {
      const mod = require(t.entry);
      const tweak = mod.default ?? mod;
      if (typeof tweak?.start === "function") {
        const storage = createDiskStorage(userRoot, t.manifest.id);
        tweak.start({
          manifest: t.manifest,
          process: "main",
          log: makeLogger(t.manifest.id),
          storage,
          ipc: makeMainIpc(t.manifest.id),
          fs: makeMainFs(t.manifest.id)
        });
        tweakState.loadedMain.set(t.manifest.id, {
          stop: tweak.stop,
          storage
        });
        log("info", `started main tweak: ${t.manifest.id}`);
      }
    } catch (e) {
      log("error", `tweak ${t.manifest.id} failed to start:`, e);
    }
  }
}
function stopAllMainTweaks() {
  for (const [id, t] of tweakState.loadedMain) {
    try {
      t.stop?.();
      t.storage.flush();
      log("info", `stopped main tweak: ${id}`);
    } catch (e) {
      log("warn", `stop failed for ${id}:`, e);
    }
  }
  tweakState.loadedMain.clear();
}
function clearTweakModuleCache() {
  const prefix = TWEAKS_DIR + (TWEAKS_DIR.endsWith("/") ? "" : "/");
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(prefix)) delete require.cache[key];
  }
}
var UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
async function ensureCodexPlusPlusUpdateCheck(force = false) {
  const state = readState();
  const cached = state.codexPlusPlus?.updateCheck;
  if (!force && cached && cached.currentVersion === CODEX_PLUSPLUS_VERSION && Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS) {
    return cached;
  }
  const release = await fetchLatestRelease(CODEX_PLUSPLUS_REPO, CODEX_PLUSPLUS_VERSION);
  const latestVersion = release.latestTag ? normalizeVersion(release.latestTag) : null;
  const check = {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    currentVersion: CODEX_PLUSPLUS_VERSION,
    latestVersion,
    releaseUrl: release.releaseUrl ?? `https://github.com/${CODEX_PLUSPLUS_REPO}/releases`,
    releaseNotes: release.releaseNotes,
    updateAvailable: latestVersion ? compareVersions(normalizeVersion(latestVersion), CODEX_PLUSPLUS_VERSION) > 0 : false,
    ...release.error ? { error: release.error } : {}
  };
  state.codexPlusPlus ??= {};
  state.codexPlusPlus.updateCheck = check;
  writeState(state);
  return check;
}
async function ensureTweakUpdateCheck(t) {
  const id = t.manifest.id;
  const repo = t.manifest.githubRepo;
  const state = readState();
  const cached = state.tweakUpdateChecks?.[id];
  if (cached && cached.repo === repo && cached.currentVersion === t.manifest.version && Date.now() - Date.parse(cached.checkedAt) < UPDATE_CHECK_INTERVAL_MS) {
    return;
  }
  const next = await fetchLatestRelease(repo, t.manifest.version);
  const latestVersion = next.latestTag ? normalizeVersion(next.latestTag) : null;
  const check = {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    repo,
    currentVersion: t.manifest.version,
    latestVersion,
    latestTag: next.latestTag,
    releaseUrl: next.releaseUrl,
    updateAvailable: latestVersion ? compareVersions(latestVersion, normalizeVersion(t.manifest.version)) > 0 : false,
    ...next.error ? { error: next.error } : {}
  };
  state.tweakUpdateChecks ??= {};
  state.tweakUpdateChecks[id] = check;
  writeState(state);
}
async function fetchLatestRelease(repo, currentVersion) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8e3);
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": `codex-plusplus/${currentVersion}`
        },
        signal: controller.signal
      });
      if (res.status === 404) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: "no GitHub release found" };
      }
      if (!res.ok) {
        return { latestTag: null, releaseUrl: null, releaseNotes: null, error: `GitHub returned ${res.status}` };
      }
      const body = await res.json();
      return {
        latestTag: body.tag_name ?? null,
        releaseUrl: body.html_url ?? `https://github.com/${repo}/releases`,
        releaseNotes: body.body ?? null
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return {
      latestTag: null,
      releaseUrl: null,
      releaseNotes: null,
      error: e instanceof Error ? e.message : String(e)
    };
  }
}
function normalizeVersion(v) {
  return v.trim().replace(/^v/i, "");
}
function compareVersions(a, b) {
  const av = VERSION_RE.exec(a);
  const bv = VERSION_RE.exec(b);
  if (!av || !bv) return 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(av[i]) - Number(bv[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
function broadcastReload() {
  const payload = {
    at: Date.now(),
    tweaks: tweakState.discovered.map((t) => t.manifest.id)
  };
  for (const wc of import_electron.webContents.getAllWebContents()) {
    try {
      wc.send("codexpp:tweaks-changed", payload);
    } catch (e) {
      log("warn", "broadcast send failed:", e);
    }
  }
}
function makeLogger(scope) {
  return {
    debug: (...a) => log("info", `[${scope}]`, ...a),
    info: (...a) => log("info", `[${scope}]`, ...a),
    warn: (...a) => log("warn", `[${scope}]`, ...a),
    error: (...a) => log("error", `[${scope}]`, ...a)
  };
}
function makeMainIpc(id) {
  const ch = (c) => `codexpp:${id}:${c}`;
  return {
    on: (c, h) => {
      const wrapped = (_e, ...args) => h(...args);
      import_electron.ipcMain.on(ch(c), wrapped);
      return () => import_electron.ipcMain.removeListener(ch(c), wrapped);
    },
    send: (_c) => {
      throw new Error("ipc.send is renderer\u2192main; main side uses handle/on");
    },
    invoke: (_c) => {
      throw new Error("ipc.invoke is renderer\u2192main; main side uses handle");
    },
    handle: (c, handler) => {
      import_electron.ipcMain.handle(ch(c), (_e, ...args) => handler(...args));
    }
  };
}
function makeMainFs(id) {
  const dir = (0, import_node_path4.join)(userRoot, "tweak-data", id);
  (0, import_node_fs3.mkdirSync)(dir, { recursive: true });
  const fs = require("node:fs/promises");
  return {
    dataDir: dir,
    read: (p) => fs.readFile((0, import_node_path4.join)(dir, p), "utf8"),
    write: (p, c) => fs.writeFile((0, import_node_path4.join)(dir, p), c, "utf8"),
    exists: async (p) => {
      try {
        await fs.access((0, import_node_path4.join)(dir, p));
        return true;
      } catch {
        return false;
      }
    }
  };
}
/*! Bundled license information:

chokidar/esm/index.js:
  (*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL21haW4udHMiLCAiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL2Nob2tpZGFyL2VzbS9pbmRleC5qcyIsICIuLi8uLi8uLi9ub2RlX21vZHVsZXMvcmVhZGRpcnAvZXNtL2luZGV4LmpzIiwgIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9jaG9raWRhci9lc20vaGFuZGxlci5qcyIsICIuLi9zcmMvdHdlYWstZGlzY292ZXJ5LnRzIiwgIi4uL3NyYy9zdG9yYWdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIE1haW4tcHJvY2VzcyBib290c3RyYXAuIExvYWRlZCBieSB0aGUgYXNhciBsb2FkZXIgYmVmb3JlIENvZGV4J3Mgb3duXG4gKiBtYWluIHByb2Nlc3MgY29kZSBydW5zLiBXZSBob29rIGBCcm93c2VyV2luZG93YCBzbyBldmVyeSB3aW5kb3cgQ29kZXhcbiAqIGNyZWF0ZXMgZ2V0cyBvdXIgcHJlbG9hZCBzY3JpcHQgYXR0YWNoZWQuIFdlIGFsc28gc3RhbmQgdXAgYW4gSVBDXG4gKiBjaGFubmVsIGZvciB0d2Vha3MgdG8gdGFsayB0byB0aGUgbWFpbiBwcm9jZXNzLlxuICpcbiAqIFdlIGFyZSBpbiBDSlMgbGFuZCBoZXJlIChtYXRjaGVzIEVsZWN0cm9uJ3MgbWFpbiBwcm9jZXNzIGFuZCBDb2RleCdzIG93blxuICogY29kZSkuIFRoZSByZW5kZXJlci1zaWRlIHJ1bnRpbWUgaXMgYnVuZGxlZCBzZXBhcmF0ZWx5IGludG8gcHJlbG9hZC5qcy5cbiAqL1xuaW1wb3J0IHsgYXBwLCBCcm93c2VyV2luZG93LCBjbGlwYm9hcmQsIGlwY01haW4sIHNlc3Npb24sIHNoZWxsLCB3ZWJDb250ZW50cyB9IGZyb20gXCJlbGVjdHJvblwiO1xuaW1wb3J0IHsgZXhpc3RzU3luYywgbWtkaXJTeW5jLCBhcHBlbmRGaWxlU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGpvaW4sIHJlc29sdmUgfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5pbXBvcnQgY2hva2lkYXIgZnJvbSBcImNob2tpZGFyXCI7XG5pbXBvcnQgeyBkaXNjb3ZlclR3ZWFrcywgdHlwZSBEaXNjb3ZlcmVkVHdlYWsgfSBmcm9tIFwiLi90d2Vhay1kaXNjb3ZlcnlcIjtcbmltcG9ydCB7IGNyZWF0ZURpc2tTdG9yYWdlLCB0eXBlIERpc2tTdG9yYWdlIH0gZnJvbSBcIi4vc3RvcmFnZVwiO1xuXG5jb25zdCB1c2VyUm9vdCA9IHByb2Nlc3MuZW52LkNPREVYX1BMVVNQTFVTX1VTRVJfUk9PVDtcbmNvbnN0IHJ1bnRpbWVEaXIgPSBwcm9jZXNzLmVudi5DT0RFWF9QTFVTUExVU19SVU5USU1FO1xuXG5pZiAoIXVzZXJSb290IHx8ICFydW50aW1lRGlyKSB7XG4gIHRocm93IG5ldyBFcnJvcihcbiAgICBcImNvZGV4LXBsdXNwbHVzIHJ1bnRpbWUgc3RhcnRlZCB3aXRob3V0IENPREVYX1BMVVNQTFVTX1VTRVJfUk9PVC9SVU5USU1FIGVudnNcIixcbiAgKTtcbn1cblxuY29uc3QgUFJFTE9BRF9QQVRIID0gcmVzb2x2ZShydW50aW1lRGlyLCBcInByZWxvYWQuanNcIik7XG5jb25zdCBUV0VBS1NfRElSID0gam9pbih1c2VyUm9vdCwgXCJ0d2Vha3NcIik7XG5jb25zdCBMT0dfRElSID0gam9pbih1c2VyUm9vdCwgXCJsb2dcIik7XG5jb25zdCBMT0dfRklMRSA9IGpvaW4oTE9HX0RJUiwgXCJtYWluLmxvZ1wiKTtcbmNvbnN0IENPTkZJR19GSUxFID0gam9pbih1c2VyUm9vdCwgXCJjb25maWcuanNvblwiKTtcbmNvbnN0IENPREVYX1BMVVNQTFVTX1ZFUlNJT04gPSBcIjAuMS4wXCI7XG5jb25zdCBDT0RFWF9QTFVTUExVU19SRVBPID0gXCJiLW5uZXR0L2NvZGV4LXBsdXNwbHVzXCI7XG5cbm1rZGlyU3luYyhMT0dfRElSLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbm1rZGlyU3luYyhUV0VBS1NfRElSLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuLy8gT3B0aW9uYWw6IGVuYWJsZSBDaHJvbWUgRGV2VG9vbHMgUHJvdG9jb2wgb24gYSBUQ1AgcG9ydCBzbyB3ZSBjYW4gZHJpdmUgdGhlXG4vLyBydW5uaW5nIENvZGV4IGZyb20gb3V0c2lkZSAoY3VybCBodHRwOi8vbG9jYWxob3N0Ojxwb3J0Pi9qc29uLCBhdHRhY2ggdmlhXG4vLyBDRFAgV2ViU29ja2V0LCB0YWtlIHNjcmVlbnNob3RzLCBldmFsdWF0ZSBpbiByZW5kZXJlciwgZXRjLikuIENvZGV4J3Ncbi8vIHByb2R1Y3Rpb24gYnVpbGQgc2V0cyB3ZWJQcmVmZXJlbmNlcy5kZXZUb29scz1mYWxzZSwgd2hpY2gga2lsbHMgdGhlXG4vLyBpbi13aW5kb3cgRGV2VG9vbHMgc2hvcnRjdXQsIGJ1dCBgLS1yZW1vdGUtZGVidWdnaW5nLXBvcnRgIHdvcmtzIHJlZ2FyZGxlc3Ncbi8vIGJlY2F1c2UgaXQncyBhIENocm9taXVtIGNvbW1hbmQtbGluZSBzd2l0Y2ggcHJvY2Vzc2VkIGJlZm9yZSBhcHAgaW5pdC5cbi8vXG4vLyBPZmYgYnkgZGVmYXVsdC4gU2V0IENPREVYUFBfUkVNT1RFX0RFQlVHPTEgKG9wdGlvbmFsbHkgQ09ERVhQUF9SRU1PVEVfREVCVUdfUE9SVClcbi8vIHRvIHR1cm4gaXQgb24uIE11c3QgYmUgYXBwZW5kZWQgYmVmb3JlIGBhcHBgIGJlY29tZXMgcmVhZHk7IHdlJ3JlIGF0IG1vZHVsZVxuLy8gdG9wLWxldmVsIHNvIHRoYXQncyBmaW5lLlxuaWYgKHByb2Nlc3MuZW52LkNPREVYUFBfUkVNT1RFX0RFQlVHID09PSBcIjFcIikge1xuICBjb25zdCBwb3J0ID0gcHJvY2Vzcy5lbnYuQ09ERVhQUF9SRU1PVEVfREVCVUdfUE9SVCA/PyBcIjkyMjJcIjtcbiAgYXBwLmNvbW1hbmRMaW5lLmFwcGVuZFN3aXRjaChcInJlbW90ZS1kZWJ1Z2dpbmctcG9ydFwiLCBwb3J0KTtcbiAgbG9nKFwiaW5mb1wiLCBgcmVtb3RlIGRlYnVnZ2luZyBlbmFibGVkIG9uIHBvcnQgJHtwb3J0fWApO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkU3RhdGUge1xuICBjb2RleFBsdXNQbHVzPzoge1xuICAgIGF1dG9VcGRhdGU/OiBib29sZWFuO1xuICAgIHVwZGF0ZUNoZWNrPzogQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrO1xuICB9O1xuICAvKiogUGVyLXR3ZWFrIGVuYWJsZSBmbGFncy4gTWlzc2luZyBlbnRyaWVzIGRlZmF1bHQgdG8gZW5hYmxlZC4gKi9cbiAgdHdlYWtzPzogUmVjb3JkPHN0cmluZywgeyBlbmFibGVkPzogYm9vbGVhbiB9PjtcbiAgLyoqIENhY2hlZCBHaXRIdWIgcmVsZWFzZSBjaGVja3MuIFJ1bnRpbWUgbmV2ZXIgYXV0by1pbnN0YWxscyB1cGRhdGVzLiAqL1xuICB0d2Vha1VwZGF0ZUNoZWNrcz86IFJlY29yZDxzdHJpbmcsIFR3ZWFrVXBkYXRlQ2hlY2s+O1xufVxuXG5pbnRlcmZhY2UgQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrIHtcbiAgY2hlY2tlZEF0OiBzdHJpbmc7XG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XG4gIGxhdGVzdFZlcnNpb246IHN0cmluZyB8IG51bGw7XG4gIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XG4gIHJlbGVhc2VOb3Rlczogc3RyaW5nIHwgbnVsbDtcbiAgdXBkYXRlQXZhaWxhYmxlOiBib29sZWFuO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFR3ZWFrVXBkYXRlQ2hlY2sge1xuICBjaGVja2VkQXQ6IHN0cmluZztcbiAgcmVwbzogc3RyaW5nO1xuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nO1xuICBsYXRlc3RWZXJzaW9uOiBzdHJpbmcgfCBudWxsO1xuICBsYXRlc3RUYWc6IHN0cmluZyB8IG51bGw7XG4gIHJlbGVhc2VVcmw6IHN0cmluZyB8IG51bGw7XG4gIHVwZGF0ZUF2YWlsYWJsZTogYm9vbGVhbjtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHJlYWRTdGF0ZSgpOiBQZXJzaXN0ZWRTdGF0ZSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKENPTkZJR19GSUxFLCBcInV0ZjhcIikpIGFzIFBlcnNpc3RlZFN0YXRlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4ge307XG4gIH1cbn1cbmZ1bmN0aW9uIHdyaXRlU3RhdGUoczogUGVyc2lzdGVkU3RhdGUpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICB3cml0ZUZpbGVTeW5jKENPTkZJR19GSUxFLCBKU09OLnN0cmluZ2lmeShzLCBudWxsLCAyKSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2coXCJ3YXJuXCIsIFwid3JpdGVTdGF0ZSBmYWlsZWQ6XCIsIFN0cmluZygoZSBhcyBFcnJvcikubWVzc2FnZSkpO1xuICB9XG59XG5mdW5jdGlvbiBpc0NvZGV4UGx1c1BsdXNBdXRvVXBkYXRlRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgcmV0dXJuIHJlYWRTdGF0ZSgpLmNvZGV4UGx1c1BsdXM/LmF1dG9VcGRhdGUgIT09IGZhbHNlO1xufVxuZnVuY3Rpb24gc2V0Q29kZXhQbHVzUGx1c0F1dG9VcGRhdGUoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuICBjb25zdCBzID0gcmVhZFN0YXRlKCk7XG4gIHMuY29kZXhQbHVzUGx1cyA/Pz0ge307XG4gIHMuY29kZXhQbHVzUGx1cy5hdXRvVXBkYXRlID0gZW5hYmxlZDtcbiAgd3JpdGVTdGF0ZShzKTtcbn1cbmZ1bmN0aW9uIGlzVHdlYWtFbmFibGVkKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgcyA9IHJlYWRTdGF0ZSgpO1xuICByZXR1cm4gcy50d2Vha3M/LltpZF0/LmVuYWJsZWQgIT09IGZhbHNlO1xufVxuZnVuY3Rpb24gc2V0VHdlYWtFbmFibGVkKGlkOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgY29uc3QgcyA9IHJlYWRTdGF0ZSgpO1xuICBzLnR3ZWFrcyA/Pz0ge307XG4gIHMudHdlYWtzW2lkXSA9IHsgLi4ucy50d2Vha3NbaWRdLCBlbmFibGVkIH07XG4gIHdyaXRlU3RhdGUocyk7XG59XG5cbmZ1bmN0aW9uIGxvZyhsZXZlbDogXCJpbmZvXCIgfCBcIndhcm5cIiB8IFwiZXJyb3JcIiwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG4gIGNvbnN0IGxpbmUgPSBgWyR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfV0gWyR7bGV2ZWx9XSAke2FyZ3NcbiAgICAubWFwKChhKSA9PiAodHlwZW9mIGEgPT09IFwic3RyaW5nXCIgPyBhIDogSlNPTi5zdHJpbmdpZnkoYSkpKVxuICAgIC5qb2luKFwiIFwiKX1cXG5gO1xuICB0cnkge1xuICAgIGFwcGVuZEZpbGVTeW5jKExPR19GSUxFLCBsaW5lKTtcbiAgfSBjYXRjaCB7fVxuICBpZiAobGV2ZWwgPT09IFwiZXJyb3JcIikgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c11cIiwgLi4uYXJncyk7XG59XG5cbi8vIFN1cmZhY2UgdW5oYW5kbGVkIGVycm9ycyBmcm9tIGFueXdoZXJlIGluIHRoZSBtYWluIHByb2Nlc3MgdG8gb3VyIGxvZy5cbnByb2Nlc3Mub24oXCJ1bmNhdWdodEV4Y2VwdGlvblwiLCAoZTogRXJyb3IgJiB7IGNvZGU/OiBzdHJpbmcgfSkgPT4ge1xuICBsb2coXCJlcnJvclwiLCBcInVuY2F1Z2h0RXhjZXB0aW9uXCIsIHsgY29kZTogZS5jb2RlLCBtZXNzYWdlOiBlLm1lc3NhZ2UsIHN0YWNrOiBlLnN0YWNrIH0pO1xufSk7XG5wcm9jZXNzLm9uKFwidW5oYW5kbGVkUmVqZWN0aW9uXCIsIChlKSA9PiB7XG4gIGxvZyhcImVycm9yXCIsIFwidW5oYW5kbGVkUmVqZWN0aW9uXCIsIHsgdmFsdWU6IFN0cmluZyhlKSB9KTtcbn0pO1xuXG5pbnRlcmZhY2UgTG9hZGVkTWFpblR3ZWFrIHtcbiAgc3RvcD86ICgpID0+IHZvaWQ7XG4gIHN0b3JhZ2U6IERpc2tTdG9yYWdlO1xufVxuXG5jb25zdCB0d2Vha1N0YXRlID0ge1xuICBkaXNjb3ZlcmVkOiBbXSBhcyBEaXNjb3ZlcmVkVHdlYWtbXSxcbiAgbG9hZGVkTWFpbjogbmV3IE1hcDxzdHJpbmcsIExvYWRlZE1haW5Ud2Vhaz4oKSxcbn07XG5cbi8vIDEuIEhvb2sgZXZlcnkgc2Vzc2lvbiBzbyBvdXIgcHJlbG9hZCBydW5zIGluIGV2ZXJ5IHJlbmRlcmVyLlxuLy9cbi8vIFdlIHVzZSBFbGVjdHJvbidzIG1vZGVybiBgc2Vzc2lvbi5yZWdpc3RlclByZWxvYWRTY3JpcHRgIEFQSSAoYWRkZWQgaW5cbi8vIEVsZWN0cm9uIDM1KS4gVGhlIGRlcHJlY2F0ZWQgYHNldFByZWxvYWRzYCBwYXRoIHNpbGVudGx5IG5vLW9wcyBpbiBzb21lXG4vLyBjb25maWd1cmF0aW9ucyAobm90YWJseSB3aXRoIHNhbmRib3hlZCByZW5kZXJlcnMpLCBzbyByZWdpc3RlclByZWxvYWRTY3JpcHRcbi8vIGlzIHRoZSBvbmx5IHJlbGlhYmxlIHdheSB0byBpbmplY3QgaW50byBDb2RleCdzIEJyb3dzZXJXaW5kb3dzLlxuZnVuY3Rpb24gcmVnaXN0ZXJQcmVsb2FkKHM6IEVsZWN0cm9uLlNlc3Npb24sIGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZWcgPSAocyBhcyB1bmtub3duIGFzIHtcbiAgICAgIHJlZ2lzdGVyUHJlbG9hZFNjcmlwdD86IChvcHRzOiB7XG4gICAgICAgIHR5cGU/OiBcImZyYW1lXCIgfCBcInNlcnZpY2Utd29ya2VyXCI7XG4gICAgICAgIGlkPzogc3RyaW5nO1xuICAgICAgICBmaWxlUGF0aDogc3RyaW5nO1xuICAgICAgfSkgPT4gc3RyaW5nO1xuICAgIH0pLnJlZ2lzdGVyUHJlbG9hZFNjcmlwdDtcbiAgICBpZiAodHlwZW9mIHJlZyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICByZWcuY2FsbChzLCB7IHR5cGU6IFwiZnJhbWVcIiwgZmlsZVBhdGg6IFBSRUxPQURfUEFUSCwgaWQ6IFwiY29kZXgtcGx1c3BsdXNcIiB9KTtcbiAgICAgIGxvZyhcImluZm9cIiwgYHByZWxvYWQgcmVnaXN0ZXJlZCAocmVnaXN0ZXJQcmVsb2FkU2NyaXB0KSBvbiAke2xhYmVsfTpgLCBQUkVMT0FEX1BBVEgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBGYWxsYmFjayBmb3Igb2xkZXIgRWxlY3Ryb24gdmVyc2lvbnMuXG4gICAgY29uc3QgZXhpc3RpbmcgPSBzLmdldFByZWxvYWRzKCk7XG4gICAgaWYgKCFleGlzdGluZy5pbmNsdWRlcyhQUkVMT0FEX1BBVEgpKSB7XG4gICAgICBzLnNldFByZWxvYWRzKFsuLi5leGlzdGluZywgUFJFTE9BRF9QQVRIXSk7XG4gICAgfVxuICAgIGxvZyhcImluZm9cIiwgYHByZWxvYWQgcmVnaXN0ZXJlZCAoc2V0UHJlbG9hZHMpIG9uICR7bGFiZWx9OmAsIFBSRUxPQURfUEFUSCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBpZiAoZSBpbnN0YW5jZW9mIEVycm9yICYmIGUubWVzc2FnZS5pbmNsdWRlcyhcImV4aXN0aW5nIElEXCIpKSB7XG4gICAgICBsb2coXCJpbmZvXCIsIGBwcmVsb2FkIGFscmVhZHkgcmVnaXN0ZXJlZCBvbiAke2xhYmVsfTpgLCBQUkVMT0FEX1BBVEgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsb2coXCJlcnJvclwiLCBgcHJlbG9hZCByZWdpc3RyYXRpb24gb24gJHtsYWJlbH0gZmFpbGVkOmAsIGUpO1xuICB9XG59XG5cbmFwcC53aGVuUmVhZHkoKS50aGVuKCgpID0+IHtcbiAgbG9nKFwiaW5mb1wiLCBcImFwcCByZWFkeSBmaXJlZFwiKTtcbiAgcmVnaXN0ZXJQcmVsb2FkKHNlc3Npb24uZGVmYXVsdFNlc3Npb24sIFwiZGVmYXVsdFNlc3Npb25cIik7XG59KTtcblxuYXBwLm9uKFwic2Vzc2lvbi1jcmVhdGVkXCIsIChzKSA9PiB7XG4gIHJlZ2lzdGVyUHJlbG9hZChzLCBcInNlc3Npb24tY3JlYXRlZFwiKTtcbn0pO1xuXG4vLyBESUFHTk9TVElDOiBsb2cgZXZlcnkgd2ViQ29udGVudHMgY3JlYXRpb24uIFVzZWZ1bCBmb3IgdmVyaWZ5aW5nIG91clxuLy8gcHJlbG9hZCByZWFjaGVzIGV2ZXJ5IHJlbmRlcmVyIENvZGV4IHNwYXducy5cbmFwcC5vbihcIndlYi1jb250ZW50cy1jcmVhdGVkXCIsIChfZSwgd2MpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB3cCA9ICh3YyBhcyB1bmtub3duIGFzIHsgZ2V0TGFzdFdlYlByZWZlcmVuY2VzPzogKCkgPT4gUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSlcbiAgICAgIC5nZXRMYXN0V2ViUHJlZmVyZW5jZXM/LigpO1xuICAgIGxvZyhcImluZm9cIiwgXCJ3ZWItY29udGVudHMtY3JlYXRlZFwiLCB7XG4gICAgICBpZDogd2MuaWQsXG4gICAgICB0eXBlOiB3Yy5nZXRUeXBlKCksXG4gICAgICBzZXNzaW9uSXNEZWZhdWx0OiB3Yy5zZXNzaW9uID09PSBzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLFxuICAgICAgc2FuZGJveDogd3A/LnNhbmRib3gsXG4gICAgICBjb250ZXh0SXNvbGF0aW9uOiB3cD8uY29udGV4dElzb2xhdGlvbixcbiAgICB9KTtcbiAgICB3Yy5vbihcInByZWxvYWQtZXJyb3JcIiwgKF9ldiwgcCwgZXJyKSA9PiB7XG4gICAgICBsb2coXCJlcnJvclwiLCBgd2MgJHt3Yy5pZH0gcHJlbG9hZC1lcnJvciBwYXRoPSR7cH1gLCBTdHJpbmcoZXJyPy5zdGFjayA/PyBlcnIpKTtcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZyhcImVycm9yXCIsIFwid2ViLWNvbnRlbnRzLWNyZWF0ZWQgaGFuZGxlciBmYWlsZWQ6XCIsIFN0cmluZygoZSBhcyBFcnJvcik/LnN0YWNrID8/IGUpKTtcbiAgfVxufSk7XG5cbmxvZyhcImluZm9cIiwgXCJtYWluLnRzIGV2YWx1YXRlZDsgYXBwLmlzUmVhZHk9XCIgKyBhcHAuaXNSZWFkeSgpKTtcblxuLy8gMi4gSW5pdGlhbCB0d2VhayBkaXNjb3ZlcnkgKyBtYWluLXNjb3BlIGxvYWQuXG5sb2FkQWxsTWFpblR3ZWFrcygpO1xuXG5hcHAub24oXCJ3aWxsLXF1aXRcIiwgKCkgPT4ge1xuICBzdG9wQWxsTWFpblR3ZWFrcygpO1xuICAvLyBCZXN0LWVmZm9ydCBmbHVzaCBvZiBhbnkgcGVuZGluZyBzdG9yYWdlIHdyaXRlcy5cbiAgZm9yIChjb25zdCB0IG9mIHR3ZWFrU3RhdGUubG9hZGVkTWFpbi52YWx1ZXMoKSkge1xuICAgIHRyeSB7XG4gICAgICB0LnN0b3JhZ2UuZmx1c2goKTtcbiAgICB9IGNhdGNoIHt9XG4gIH1cbn0pO1xuXG4vLyAzLiBJUEM6IGV4cG9zZSB0d2VhayBtZXRhZGF0YSArIHJldmVhbC1pbi1maW5kZXIuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6bGlzdC10d2Vha3NcIiwgYXN5bmMgKCkgPT4ge1xuICBhd2FpdCBQcm9taXNlLmFsbCh0d2Vha1N0YXRlLmRpc2NvdmVyZWQubWFwKCh0KSA9PiBlbnN1cmVUd2Vha1VwZGF0ZUNoZWNrKHQpKSk7XG4gIGNvbnN0IHVwZGF0ZUNoZWNrcyA9IHJlYWRTdGF0ZSgpLnR3ZWFrVXBkYXRlQ2hlY2tzID8/IHt9O1xuICByZXR1cm4gdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkLm1hcCgodCkgPT4gKHtcbiAgICBtYW5pZmVzdDogdC5tYW5pZmVzdCxcbiAgICBlbnRyeTogdC5lbnRyeSxcbiAgICBkaXI6IHQuZGlyLFxuICAgIGVudHJ5RXhpc3RzOiBleGlzdHNTeW5jKHQuZW50cnkpLFxuICAgIGVuYWJsZWQ6IGlzVHdlYWtFbmFibGVkKHQubWFuaWZlc3QuaWQpLFxuICAgIHVwZGF0ZTogdXBkYXRlQ2hlY2tzW3QubWFuaWZlc3QuaWRdID8/IG51bGwsXG4gIH0pKTtcbn0pO1xuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Z2V0LXR3ZWFrLWVuYWJsZWRcIiwgKF9lLCBpZDogc3RyaW5nKSA9PiBpc1R3ZWFrRW5hYmxlZChpZCkpO1xuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnNldC10d2Vhay1lbmFibGVkXCIsIChfZSwgaWQ6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbikgPT4ge1xuICBzZXRUd2Vha0VuYWJsZWQoaWQsICEhZW5hYmxlZCk7XG4gIGxvZyhcImluZm9cIiwgYHR3ZWFrICR7aWR9IGVuYWJsZWQ9JHshIWVuYWJsZWR9YCk7XG4gIC8vIEJyb2FkY2FzdCBzbyByZW5kZXJlciBob3N0cyByZS1ldmFsdWF0ZSB3aGljaCB0d2Vha3Mgc2hvdWxkIGJlIHJ1bm5pbmcuXG4gIGJyb2FkY2FzdFJlbG9hZCgpO1xuICByZXR1cm4gdHJ1ZTtcbn0pO1xuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Z2V0LWNvbmZpZ1wiLCAoKSA9PiB7XG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcbiAgcmV0dXJuIHtcbiAgICB2ZXJzaW9uOiBDT0RFWF9QTFVTUExVU19WRVJTSU9OLFxuICAgIGF1dG9VcGRhdGU6IHMuY29kZXhQbHVzUGx1cz8uYXV0b1VwZGF0ZSAhPT0gZmFsc2UsXG4gICAgdXBkYXRlQ2hlY2s6IHMuY29kZXhQbHVzUGx1cz8udXBkYXRlQ2hlY2sgPz8gbnVsbCxcbiAgfTtcbn0pO1xuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6c2V0LWF1dG8tdXBkYXRlXCIsIChfZSwgZW5hYmxlZDogYm9vbGVhbikgPT4ge1xuICBzZXRDb2RleFBsdXNQbHVzQXV0b1VwZGF0ZSghIWVuYWJsZWQpO1xuICByZXR1cm4geyBhdXRvVXBkYXRlOiBpc0NvZGV4UGx1c1BsdXNBdXRvVXBkYXRlRW5hYmxlZCgpIH07XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmNoZWNrLWNvZGV4cHAtdXBkYXRlXCIsIGFzeW5jIChfZSwgZm9yY2U/OiBib29sZWFuKSA9PiB7XG4gIHJldHVybiBlbnN1cmVDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2soZm9yY2UgPT09IHRydWUpO1xufSk7XG5cbi8vIFNhbmRib3hlZCByZW5kZXJlciBwcmVsb2FkIGNhbid0IHVzZSBOb2RlIGZzIHRvIHJlYWQgdHdlYWsgc291cmNlLiBNYWluXG4vLyByZWFkcyBpdCBvbiB0aGUgcmVuZGVyZXIncyBiZWhhbGYuIFBhdGggbXVzdCBsaXZlIHVuZGVyIHR3ZWFrc0RpciBmb3Jcbi8vIHNlY3VyaXR5IFx1MjAxNCB3ZSByZWZ1c2UgYW55dGhpbmcgZWxzZS5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpyZWFkLXR3ZWFrLXNvdXJjZVwiLCAoX2UsIGVudHJ5UGF0aDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZShlbnRyeVBhdGgpO1xuICBpZiAoIXJlc29sdmVkLnN0YXJ0c1dpdGgoVFdFQUtTX0RJUiArIFwiL1wiKSAmJiByZXNvbHZlZCAhPT0gVFdFQUtTX0RJUikge1xuICAgIHRocm93IG5ldyBFcnJvcihcInBhdGggb3V0c2lkZSB0d2Vha3MgZGlyXCIpO1xuICB9XG4gIHJldHVybiByZXF1aXJlKFwibm9kZTpmc1wiKS5yZWFkRmlsZVN5bmMocmVzb2x2ZWQsIFwidXRmOFwiKTtcbn0pO1xuXG4vKipcbiAqIFJlYWQgYW4gYXJiaXRyYXJ5IGFzc2V0IGZpbGUgZnJvbSBpbnNpZGUgYSB0d2VhaydzIGRpcmVjdG9yeSBhbmQgcmV0dXJuIGl0XG4gKiBhcyBhIGBkYXRhOmAgVVJMLiBVc2VkIGJ5IHRoZSBzZXR0aW5ncyBpbmplY3RvciB0byByZW5kZXIgbWFuaWZlc3QgaWNvbnNcbiAqICh0aGUgcmVuZGVyZXIgaXMgc2FuZGJveGVkOyBgZmlsZTovL2Agd29uJ3QgbG9hZCkuXG4gKlxuICogU2VjdXJpdHk6IGNhbGxlciBwYXNzZXMgYHR3ZWFrRGlyYCBhbmQgYHJlbFBhdGhgOyB3ZSAoMSkgcmVxdWlyZSB0d2Vha0RpclxuICogdG8gbGl2ZSB1bmRlciBUV0VBS1NfRElSLCAoMikgcmVzb2x2ZSByZWxQYXRoIGFnYWluc3QgaXQgYW5kIHJlLWNoZWNrIHRoZVxuICogcmVzdWx0IHN0aWxsIGxpdmVzIHVuZGVyIFRXRUFLU19ESVIsICgzKSBjYXAgb3V0cHV0IHNpemUgYXQgMSBNaUIuXG4gKi9cbmNvbnN0IEFTU0VUX01BWF9CWVRFUyA9IDEwMjQgKiAxMDI0O1xuY29uc3QgTUlNRV9CWV9FWFQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIFwiLnBuZ1wiOiBcImltYWdlL3BuZ1wiLFxuICBcIi5qcGdcIjogXCJpbWFnZS9qcGVnXCIsXG4gIFwiLmpwZWdcIjogXCJpbWFnZS9qcGVnXCIsXG4gIFwiLmdpZlwiOiBcImltYWdlL2dpZlwiLFxuICBcIi53ZWJwXCI6IFwiaW1hZ2Uvd2VicFwiLFxuICBcIi5zdmdcIjogXCJpbWFnZS9zdmcreG1sXCIsXG4gIFwiLmljb1wiOiBcImltYWdlL3gtaWNvblwiLFxufTtcbmlwY01haW4uaGFuZGxlKFxuICBcImNvZGV4cHA6cmVhZC10d2Vhay1hc3NldFwiLFxuICAoX2UsIHR3ZWFrRGlyOiBzdHJpbmcsIHJlbFBhdGg6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IGZzID0gcmVxdWlyZShcIm5vZGU6ZnNcIikgYXMgdHlwZW9mIGltcG9ydChcIm5vZGU6ZnNcIik7XG4gICAgY29uc3QgZGlyID0gcmVzb2x2ZSh0d2Vha0Rpcik7XG4gICAgaWYgKCFkaXIuc3RhcnRzV2l0aChUV0VBS1NfRElSICsgXCIvXCIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ0d2Vha0RpciBvdXRzaWRlIHR3ZWFrcyBkaXJcIik7XG4gICAgfVxuICAgIGNvbnN0IGZ1bGwgPSByZXNvbHZlKGRpciwgcmVsUGF0aCk7XG4gICAgaWYgKCFmdWxsLnN0YXJ0c1dpdGgoZGlyICsgXCIvXCIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJwYXRoIHRyYXZlcnNhbFwiKTtcbiAgICB9XG4gICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKGZ1bGwpO1xuICAgIGlmIChzdGF0LnNpemUgPiBBU1NFVF9NQVhfQllURVMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgYXNzZXQgdG9vIGxhcmdlICgke3N0YXQuc2l6ZX0gPiAke0FTU0VUX01BWF9CWVRFU30pYCk7XG4gICAgfVxuICAgIGNvbnN0IGV4dCA9IGZ1bGwuc2xpY2UoZnVsbC5sYXN0SW5kZXhPZihcIi5cIikpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgbWltZSA9IE1JTUVfQllfRVhUW2V4dF0gPz8gXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcbiAgICBjb25zdCBidWYgPSBmcy5yZWFkRmlsZVN5bmMoZnVsbCk7XG4gICAgcmV0dXJuIGBkYXRhOiR7bWltZX07YmFzZTY0LCR7YnVmLnRvU3RyaW5nKFwiYmFzZTY0XCIpfWA7XG4gIH0sXG4pO1xuXG4vLyBTYW5kYm94ZWQgcHJlbG9hZCBjYW4ndCB3cml0ZSBsb2dzIHRvIGRpc2s7IGZvcndhcmQgdG8gdXMgdmlhIElQQy5cbmlwY01haW4ub24oXCJjb2RleHBwOnByZWxvYWQtbG9nXCIsIChfZSwgbGV2ZWw6IFwiaW5mb1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIG1zZzogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IGx2bCA9IGxldmVsID09PSBcImVycm9yXCIgfHwgbGV2ZWwgPT09IFwid2FyblwiID8gbGV2ZWwgOiBcImluZm9cIjtcbiAgdHJ5IHtcbiAgICBhcHBlbmRGaWxlU3luYyhcbiAgICAgIGpvaW4oTE9HX0RJUiwgXCJwcmVsb2FkLmxvZ1wiKSxcbiAgICAgIGBbJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XSBbJHtsdmx9XSAke21zZ31cXG5gLFxuICAgICk7XG4gIH0gY2F0Y2gge31cbn0pO1xuXG4vLyBTYW5kYm94LXNhZmUgZmlsZXN5c3RlbSBvcHMgZm9yIHJlbmRlcmVyLXNjb3BlIHR3ZWFrcy4gRWFjaCB0d2VhayBnZXRzXG4vLyBhIHNhbmRib3hlZCBkaXIgdW5kZXIgdXNlclJvb3QvdHdlYWstZGF0YS88aWQ+LiBSZW5kZXJlciBzaWRlIGNhbGxzIHRoZXNlXG4vLyBvdmVyIElQQyBpbnN0ZWFkIG9mIHVzaW5nIE5vZGUgZnMgZGlyZWN0bHkuXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6dHdlYWstZnNcIiwgKF9lLCBvcDogc3RyaW5nLCBpZDogc3RyaW5nLCBwOiBzdHJpbmcsIGM/OiBzdHJpbmcpID0+IHtcbiAgaWYgKCEvXlthLXpBLVowLTkuXy1dKyQvLnRlc3QoaWQpKSB0aHJvdyBuZXcgRXJyb3IoXCJiYWQgdHdlYWsgaWRcIik7XG4gIGlmIChwLmluY2x1ZGVzKFwiLi5cIikpIHRocm93IG5ldyBFcnJvcihcInBhdGggdHJhdmVyc2FsXCIpO1xuICBjb25zdCBkaXIgPSBqb2luKHVzZXJSb290ISwgXCJ0d2Vhay1kYXRhXCIsIGlkKTtcbiAgbWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIGNvbnN0IGZ1bGwgPSBqb2luKGRpciwgcCk7XG4gIGNvbnN0IGZzID0gcmVxdWlyZShcIm5vZGU6ZnNcIikgYXMgdHlwZW9mIGltcG9ydChcIm5vZGU6ZnNcIik7XG4gIHN3aXRjaCAob3ApIHtcbiAgICBjYXNlIFwicmVhZFwiOiByZXR1cm4gZnMucmVhZEZpbGVTeW5jKGZ1bGwsIFwidXRmOFwiKTtcbiAgICBjYXNlIFwid3JpdGVcIjogcmV0dXJuIGZzLndyaXRlRmlsZVN5bmMoZnVsbCwgYyA/PyBcIlwiLCBcInV0ZjhcIik7XG4gICAgY2FzZSBcImV4aXN0c1wiOiByZXR1cm4gZnMuZXhpc3RzU3luYyhmdWxsKTtcbiAgICBjYXNlIFwiZGF0YURpclwiOiByZXR1cm4gZGlyO1xuICAgIGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcihgdW5rbm93biBvcDogJHtvcH1gKTtcbiAgfVxufSk7XG5cbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDp1c2VyLXBhdGhzXCIsICgpID0+ICh7XG4gIHVzZXJSb290LFxuICBydW50aW1lRGlyLFxuICB0d2Vha3NEaXI6IFRXRUFLU19ESVIsXG4gIGxvZ0RpcjogTE9HX0RJUixcbn0pKTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnJldmVhbFwiLCAoX2UsIHA6IHN0cmluZykgPT4ge1xuICBzaGVsbC5vcGVuUGF0aChwKS5jYXRjaCgoKSA9PiB7fSk7XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOm9wZW4tZXh0ZXJuYWxcIiwgKF9lLCB1cmw6IHN0cmluZykgPT4ge1xuICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gIGlmIChwYXJzZWQucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIgfHwgcGFyc2VkLmhvc3RuYW1lICE9PSBcImdpdGh1Yi5jb21cIikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIm9ubHkgZ2l0aHViLmNvbSBsaW5rcyBjYW4gYmUgb3BlbmVkIGZyb20gdHdlYWsgbWV0YWRhdGFcIik7XG4gIH1cbiAgc2hlbGwub3BlbkV4dGVybmFsKHBhcnNlZC50b1N0cmluZygpKS5jYXRjaCgoKSA9PiB7fSk7XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmNvcHktdGV4dFwiLCAoX2UsIHRleHQ6IHN0cmluZykgPT4ge1xuICBjbGlwYm9hcmQud3JpdGVUZXh0KFN0cmluZyh0ZXh0KSk7XG4gIHJldHVybiB0cnVlO1xufSk7XG5cbi8vIE1hbnVhbCBmb3JjZS1yZWxvYWQgdHJpZ2dlciBmcm9tIHRoZSByZW5kZXJlciAoZS5nLiB0aGUgXCJGb3JjZSBSZWxvYWRcIlxuLy8gYnV0dG9uIG9uIG91ciBpbmplY3RlZCBUd2Vha3MgcGFnZSkuIEJ5cGFzc2VzIHRoZSB3YXRjaGVyIGRlYm91bmNlLlxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnJlbG9hZC10d2Vha3NcIiwgKCkgPT4ge1xuICBsb2coXCJpbmZvXCIsIFwicmVsb2FkaW5nIHR3ZWFrcyAobWFudWFsKVwiKTtcbiAgc3RvcEFsbE1haW5Ud2Vha3MoKTtcbiAgY2xlYXJUd2Vha01vZHVsZUNhY2hlKCk7XG4gIGxvYWRBbGxNYWluVHdlYWtzKCk7XG4gIGJyb2FkY2FzdFJlbG9hZCgpO1xuICByZXR1cm4geyBhdDogRGF0ZS5ub3coKSwgY291bnQ6IHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5sZW5ndGggfTtcbn0pO1xuXG4vLyA0LiBGaWxlc3lzdGVtIHdhdGNoZXIgXHUyMTkyIGRlYm91bmNlZCByZWxvYWQgKyBicm9hZGNhc3QuXG4vLyAgICBXZSB3YXRjaCB0aGUgdHdlYWtzIGRpciBmb3IgYW55IGNoYW5nZS4gT24gdGhlIGZpcnN0IHRpY2sgb2YgaW5hY3Rpdml0eVxuLy8gICAgd2Ugc3RvcCBtYWluLXNpZGUgdHdlYWtzLCBjbGVhciB0aGVpciBjYWNoZWQgbW9kdWxlcywgcmUtZGlzY292ZXIsIHRoZW5cbi8vICAgIHJlc3RhcnQgYW5kIGJyb2FkY2FzdCBgY29kZXhwcDp0d2Vha3MtY2hhbmdlZGAgdG8gZXZlcnkgcmVuZGVyZXIgc28gaXRcbi8vICAgIGNhbiByZS1pbml0IGl0cyBob3N0LlxuY29uc3QgUkVMT0FEX0RFQk9VTkNFX01TID0gMjUwO1xubGV0IHJlbG9hZFRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuZnVuY3Rpb24gc2NoZWR1bGVSZWxvYWQocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKHJlbG9hZFRpbWVyKSBjbGVhclRpbWVvdXQocmVsb2FkVGltZXIpO1xuICByZWxvYWRUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIHJlbG9hZFRpbWVyID0gbnVsbDtcbiAgICBsb2coXCJpbmZvXCIsIGByZWxvYWRpbmcgdHdlYWtzICgke3JlYXNvbn0pYCk7XG4gICAgc3RvcEFsbE1haW5Ud2Vha3MoKTtcbiAgICBjbGVhclR3ZWFrTW9kdWxlQ2FjaGUoKTtcbiAgICBsb2FkQWxsTWFpblR3ZWFrcygpO1xuICAgIGJyb2FkY2FzdFJlbG9hZCgpO1xuICB9LCBSRUxPQURfREVCT1VOQ0VfTVMpO1xufVxuXG50cnkge1xuICBjb25zdCB3YXRjaGVyID0gY2hva2lkYXIud2F0Y2goVFdFQUtTX0RJUiwge1xuICAgIGlnbm9yZUluaXRpYWw6IHRydWUsXG4gICAgLy8gV2FpdCBmb3IgZmlsZXMgdG8gc2V0dGxlIGJlZm9yZSB0cmlnZ2VyaW5nIFx1MjAxNCBndWFyZHMgYWdhaW5zdCBwYXJ0aWFsbHlcbiAgICAvLyB3cml0dGVuIHR3ZWFrIGZpbGVzIGR1cmluZyBlZGl0b3Igc2F2ZXMgLyBnaXQgY2hlY2tvdXRzLlxuICAgIGF3YWl0V3JpdGVGaW5pc2g6IHsgc3RhYmlsaXR5VGhyZXNob2xkOiAxNTAsIHBvbGxJbnRlcnZhbDogNTAgfSxcbiAgICAvLyBBdm9pZCBlYXRpbmcgQ1BVIG9uIGh1Z2Ugbm9kZV9tb2R1bGVzIHRyZWVzIGluc2lkZSB0d2VhayBmb2xkZXJzLlxuICAgIGlnbm9yZWQ6IChwKSA9PiBwLmluY2x1ZGVzKGAke1RXRUFLU19ESVJ9L2ApICYmIC9cXC9ub2RlX21vZHVsZXNcXC8vLnRlc3QocCksXG4gIH0pO1xuICB3YXRjaGVyLm9uKFwiYWxsXCIsIChldmVudCwgcGF0aCkgPT4gc2NoZWR1bGVSZWxvYWQoYCR7ZXZlbnR9ICR7cGF0aH1gKSk7XG4gIHdhdGNoZXIub24oXCJlcnJvclwiLCAoZSkgPT4gbG9nKFwid2FyblwiLCBcIndhdGNoZXIgZXJyb3I6XCIsIGUpKTtcbiAgbG9nKFwiaW5mb1wiLCBcIndhdGNoaW5nXCIsIFRXRUFLU19ESVIpO1xuICBhcHAub24oXCJ3aWxsLXF1aXRcIiwgKCkgPT4gd2F0Y2hlci5jbG9zZSgpLmNhdGNoKCgpID0+IHt9KSk7XG59IGNhdGNoIChlKSB7XG4gIGxvZyhcImVycm9yXCIsIFwiZmFpbGVkIHRvIHN0YXJ0IHdhdGNoZXI6XCIsIGUpO1xufVxuXG4vLyAtLS0gaGVscGVycyAtLS1cblxuZnVuY3Rpb24gbG9hZEFsbE1haW5Ud2Vha3MoKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkID0gZGlzY292ZXJUd2Vha3MoVFdFQUtTX0RJUik7XG4gICAgbG9nKFxuICAgICAgXCJpbmZvXCIsXG4gICAgICBgZGlzY292ZXJlZCAke3R3ZWFrU3RhdGUuZGlzY292ZXJlZC5sZW5ndGh9IHR3ZWFrKHMpOmAsXG4gICAgICB0d2Vha1N0YXRlLmRpc2NvdmVyZWQubWFwKCh0KSA9PiB0Lm1hbmlmZXN0LmlkKS5qb2luKFwiLCBcIiksXG4gICAgKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZyhcImVycm9yXCIsIFwidHdlYWsgZGlzY292ZXJ5IGZhaWxlZDpcIiwgZSk7XG4gICAgdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkID0gW107XG4gIH1cblxuICBmb3IgKGNvbnN0IHQgb2YgdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkKSB7XG4gICAgaWYgKHQubWFuaWZlc3Quc2NvcGUgPT09IFwicmVuZGVyZXJcIikgY29udGludWU7XG4gICAgaWYgKCFpc1R3ZWFrRW5hYmxlZCh0Lm1hbmlmZXN0LmlkKSkge1xuICAgICAgbG9nKFwiaW5mb1wiLCBgc2tpcHBpbmcgZGlzYWJsZWQgbWFpbiB0d2VhazogJHt0Lm1hbmlmZXN0LmlkfWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBtb2QgPSByZXF1aXJlKHQuZW50cnkpO1xuICAgICAgY29uc3QgdHdlYWsgPSBtb2QuZGVmYXVsdCA/PyBtb2Q7XG4gICAgICBpZiAodHlwZW9mIHR3ZWFrPy5zdGFydCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIGNvbnN0IHN0b3JhZ2UgPSBjcmVhdGVEaXNrU3RvcmFnZSh1c2VyUm9vdCEsIHQubWFuaWZlc3QuaWQpO1xuICAgICAgICB0d2Vhay5zdGFydCh7XG4gICAgICAgICAgbWFuaWZlc3Q6IHQubWFuaWZlc3QsXG4gICAgICAgICAgcHJvY2VzczogXCJtYWluXCIsXG4gICAgICAgICAgbG9nOiBtYWtlTG9nZ2VyKHQubWFuaWZlc3QuaWQpLFxuICAgICAgICAgIHN0b3JhZ2UsXG4gICAgICAgICAgaXBjOiBtYWtlTWFpbklwYyh0Lm1hbmlmZXN0LmlkKSxcbiAgICAgICAgICBmczogbWFrZU1haW5Gcyh0Lm1hbmlmZXN0LmlkKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHR3ZWFrU3RhdGUubG9hZGVkTWFpbi5zZXQodC5tYW5pZmVzdC5pZCwge1xuICAgICAgICAgIHN0b3A6IHR3ZWFrLnN0b3AsXG4gICAgICAgICAgc3RvcmFnZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGxvZyhcImluZm9cIiwgYHN0YXJ0ZWQgbWFpbiB0d2VhazogJHt0Lm1hbmlmZXN0LmlkfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZyhcImVycm9yXCIsIGB0d2VhayAke3QubWFuaWZlc3QuaWR9IGZhaWxlZCB0byBzdGFydDpgLCBlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RvcEFsbE1haW5Ud2Vha3MoKTogdm9pZCB7XG4gIGZvciAoY29uc3QgW2lkLCB0XSBvZiB0d2Vha1N0YXRlLmxvYWRlZE1haW4pIHtcbiAgICB0cnkge1xuICAgICAgdC5zdG9wPy4oKTtcbiAgICAgIHQuc3RvcmFnZS5mbHVzaCgpO1xuICAgICAgbG9nKFwiaW5mb1wiLCBgc3RvcHBlZCBtYWluIHR3ZWFrOiAke2lkfWApO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZyhcIndhcm5cIiwgYHN0b3AgZmFpbGVkIGZvciAke2lkfTpgLCBlKTtcbiAgICB9XG4gIH1cbiAgdHdlYWtTdGF0ZS5sb2FkZWRNYWluLmNsZWFyKCk7XG59XG5cbmZ1bmN0aW9uIGNsZWFyVHdlYWtNb2R1bGVDYWNoZSgpOiB2b2lkIHtcbiAgLy8gRHJvcCBhbnkgY2FjaGVkIHJlcXVpcmUoKSBlbnRyaWVzIHRoYXQgbGl2ZSBpbnNpZGUgdGhlIHR3ZWFrcyBkaXIgc28gYVxuICAvLyByZS1yZXF1aXJlIG9uIG5leHQgbG9hZCBwaWNrcyB1cCBmcmVzaCBjb2RlLiBXZSBkbyBwcmVmaXggbWF0Y2hpbmcgb25cbiAgLy8gdGhlIHJlc29sdmVkIHR3ZWFrcyBkaXIuXG4gIGNvbnN0IHByZWZpeCA9IFRXRUFLU19ESVIgKyAoVFdFQUtTX0RJUi5lbmRzV2l0aChcIi9cIikgPyBcIlwiIDogXCIvXCIpO1xuICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhyZXF1aXJlLmNhY2hlKSkge1xuICAgIGlmIChrZXkuc3RhcnRzV2l0aChwcmVmaXgpKSBkZWxldGUgcmVxdWlyZS5jYWNoZVtrZXldO1xuICB9XG59XG5cbmNvbnN0IFVQREFURV9DSEVDS19JTlRFUlZBTF9NUyA9IDI0ICogNjAgKiA2MCAqIDEwMDA7XG5jb25zdCBWRVJTSU9OX1JFID0gL152PyhcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlstK10uKik/JC87XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZUNvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayhmb3JjZSA9IGZhbHNlKTogUHJvbWlzZTxDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2s+IHtcbiAgY29uc3Qgc3RhdGUgPSByZWFkU3RhdGUoKTtcbiAgY29uc3QgY2FjaGVkID0gc3RhdGUuY29kZXhQbHVzUGx1cz8udXBkYXRlQ2hlY2s7XG4gIGlmIChcbiAgICAhZm9yY2UgJiZcbiAgICBjYWNoZWQgJiZcbiAgICBjYWNoZWQuY3VycmVudFZlcnNpb24gPT09IENPREVYX1BMVVNQTFVTX1ZFUlNJT04gJiZcbiAgICBEYXRlLm5vdygpIC0gRGF0ZS5wYXJzZShjYWNoZWQuY2hlY2tlZEF0KSA8IFVQREFURV9DSEVDS19JTlRFUlZBTF9NU1xuICApIHtcbiAgICByZXR1cm4gY2FjaGVkO1xuICB9XG5cbiAgY29uc3QgcmVsZWFzZSA9IGF3YWl0IGZldGNoTGF0ZXN0UmVsZWFzZShDT0RFWF9QTFVTUExVU19SRVBPLCBDT0RFWF9QTFVTUExVU19WRVJTSU9OKTtcbiAgY29uc3QgbGF0ZXN0VmVyc2lvbiA9IHJlbGVhc2UubGF0ZXN0VGFnID8gbm9ybWFsaXplVmVyc2lvbihyZWxlYXNlLmxhdGVzdFRhZykgOiBudWxsO1xuICBjb25zdCBjaGVjazogQ29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrID0ge1xuICAgIGNoZWNrZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIGN1cnJlbnRWZXJzaW9uOiBDT0RFWF9QTFVTUExVU19WRVJTSU9OLFxuICAgIGxhdGVzdFZlcnNpb24sXG4gICAgcmVsZWFzZVVybDogcmVsZWFzZS5yZWxlYXNlVXJsID8/IGBodHRwczovL2dpdGh1Yi5jb20vJHtDT0RFWF9QTFVTUExVU19SRVBPfS9yZWxlYXNlc2AsXG4gICAgcmVsZWFzZU5vdGVzOiByZWxlYXNlLnJlbGVhc2VOb3RlcyxcbiAgICB1cGRhdGVBdmFpbGFibGU6IGxhdGVzdFZlcnNpb25cbiAgICAgID8gY29tcGFyZVZlcnNpb25zKG5vcm1hbGl6ZVZlcnNpb24obGF0ZXN0VmVyc2lvbiksIENPREVYX1BMVVNQTFVTX1ZFUlNJT04pID4gMFxuICAgICAgOiBmYWxzZSxcbiAgICAuLi4ocmVsZWFzZS5lcnJvciA/IHsgZXJyb3I6IHJlbGVhc2UuZXJyb3IgfSA6IHt9KSxcbiAgfTtcbiAgc3RhdGUuY29kZXhQbHVzUGx1cyA/Pz0ge307XG4gIHN0YXRlLmNvZGV4UGx1c1BsdXMudXBkYXRlQ2hlY2sgPSBjaGVjaztcbiAgd3JpdGVTdGF0ZShzdGF0ZSk7XG4gIHJldHVybiBjaGVjaztcbn1cblxuYXN5bmMgZnVuY3Rpb24gZW5zdXJlVHdlYWtVcGRhdGVDaGVjayh0OiBEaXNjb3ZlcmVkVHdlYWspOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgaWQgPSB0Lm1hbmlmZXN0LmlkO1xuICBjb25zdCByZXBvID0gdC5tYW5pZmVzdC5naXRodWJSZXBvO1xuICBjb25zdCBzdGF0ZSA9IHJlYWRTdGF0ZSgpO1xuICBjb25zdCBjYWNoZWQgPSBzdGF0ZS50d2Vha1VwZGF0ZUNoZWNrcz8uW2lkXTtcbiAgaWYgKFxuICAgIGNhY2hlZCAmJlxuICAgIGNhY2hlZC5yZXBvID09PSByZXBvICYmXG4gICAgY2FjaGVkLmN1cnJlbnRWZXJzaW9uID09PSB0Lm1hbmlmZXN0LnZlcnNpb24gJiZcbiAgICBEYXRlLm5vdygpIC0gRGF0ZS5wYXJzZShjYWNoZWQuY2hlY2tlZEF0KSA8IFVQREFURV9DSEVDS19JTlRFUlZBTF9NU1xuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBuZXh0ID0gYXdhaXQgZmV0Y2hMYXRlc3RSZWxlYXNlKHJlcG8sIHQubWFuaWZlc3QudmVyc2lvbik7XG4gIGNvbnN0IGxhdGVzdFZlcnNpb24gPSBuZXh0LmxhdGVzdFRhZyA/IG5vcm1hbGl6ZVZlcnNpb24obmV4dC5sYXRlc3RUYWcpIDogbnVsbDtcbiAgY29uc3QgY2hlY2s6IFR3ZWFrVXBkYXRlQ2hlY2sgPSB7XG4gICAgY2hlY2tlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgcmVwbyxcbiAgICBjdXJyZW50VmVyc2lvbjogdC5tYW5pZmVzdC52ZXJzaW9uLFxuICAgIGxhdGVzdFZlcnNpb24sXG4gICAgbGF0ZXN0VGFnOiBuZXh0LmxhdGVzdFRhZyxcbiAgICByZWxlYXNlVXJsOiBuZXh0LnJlbGVhc2VVcmwsXG4gICAgdXBkYXRlQXZhaWxhYmxlOiBsYXRlc3RWZXJzaW9uXG4gICAgICA/IGNvbXBhcmVWZXJzaW9ucyhsYXRlc3RWZXJzaW9uLCBub3JtYWxpemVWZXJzaW9uKHQubWFuaWZlc3QudmVyc2lvbikpID4gMFxuICAgICAgOiBmYWxzZSxcbiAgICAuLi4obmV4dC5lcnJvciA/IHsgZXJyb3I6IG5leHQuZXJyb3IgfSA6IHt9KSxcbiAgfTtcbiAgc3RhdGUudHdlYWtVcGRhdGVDaGVja3MgPz89IHt9O1xuICBzdGF0ZS50d2Vha1VwZGF0ZUNoZWNrc1tpZF0gPSBjaGVjaztcbiAgd3JpdGVTdGF0ZShzdGF0ZSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoTGF0ZXN0UmVsZWFzZShcbiAgcmVwbzogc3RyaW5nLFxuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nLFxuKTogUHJvbWlzZTx7IGxhdGVzdFRhZzogc3RyaW5nIHwgbnVsbDsgcmVsZWFzZVVybDogc3RyaW5nIHwgbnVsbDsgcmVsZWFzZU5vdGVzOiBzdHJpbmcgfCBudWxsOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIDgwMDApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy8ke3JlcG99L3JlbGVhc2VzL2xhdGVzdGAsIHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwiQWNjZXB0XCI6IFwiYXBwbGljYXRpb24vdm5kLmdpdGh1Yitqc29uXCIsXG4gICAgICAgICAgXCJVc2VyLUFnZW50XCI6IGBjb2RleC1wbHVzcGx1cy8ke2N1cnJlbnRWZXJzaW9ufWAsXG4gICAgICAgIH0sXG4gICAgICAgIHNpZ25hbDogY29udHJvbGxlci5zaWduYWwsXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXMuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgICAgcmV0dXJuIHsgbGF0ZXN0VGFnOiBudWxsLCByZWxlYXNlVXJsOiBudWxsLCByZWxlYXNlTm90ZXM6IG51bGwsIGVycm9yOiBcIm5vIEdpdEh1YiByZWxlYXNlIGZvdW5kXCIgfTtcbiAgICAgIH1cbiAgICAgIGlmICghcmVzLm9rKSB7XG4gICAgICAgIHJldHVybiB7IGxhdGVzdFRhZzogbnVsbCwgcmVsZWFzZVVybDogbnVsbCwgcmVsZWFzZU5vdGVzOiBudWxsLCBlcnJvcjogYEdpdEh1YiByZXR1cm5lZCAke3Jlcy5zdGF0dXN9YCB9O1xuICAgICAgfVxuICAgICAgY29uc3QgYm9keSA9IGF3YWl0IHJlcy5qc29uKCkgYXMgeyB0YWdfbmFtZT86IHN0cmluZzsgaHRtbF91cmw/OiBzdHJpbmc7IGJvZHk/OiBzdHJpbmcgfTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGxhdGVzdFRhZzogYm9keS50YWdfbmFtZSA/PyBudWxsLFxuICAgICAgICByZWxlYXNlVXJsOiBib2R5Lmh0bWxfdXJsID8/IGBodHRwczovL2dpdGh1Yi5jb20vJHtyZXBvfS9yZWxlYXNlc2AsXG4gICAgICAgIHJlbGVhc2VOb3RlczogYm9keS5ib2R5ID8/IG51bGwsXG4gICAgICB9O1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgfVxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGxhdGVzdFRhZzogbnVsbCxcbiAgICAgIHJlbGVhc2VVcmw6IG51bGwsXG4gICAgICByZWxlYXNlTm90ZXM6IG51bGwsXG4gICAgICBlcnJvcjogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpLFxuICAgIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplVmVyc2lvbih2OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdi50cmltKCkucmVwbGFjZSgvXnYvaSwgXCJcIik7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVWZXJzaW9ucyhhOiBzdHJpbmcsIGI6IHN0cmluZyk6IG51bWJlciB7XG4gIGNvbnN0IGF2ID0gVkVSU0lPTl9SRS5leGVjKGEpO1xuICBjb25zdCBidiA9IFZFUlNJT05fUkUuZXhlYyhiKTtcbiAgaWYgKCFhdiB8fCAhYnYpIHJldHVybiAwO1xuICBmb3IgKGxldCBpID0gMTsgaSA8PSAzOyBpKyspIHtcbiAgICBjb25zdCBkaWZmID0gTnVtYmVyKGF2W2ldKSAtIE51bWJlcihidltpXSk7XG4gICAgaWYgKGRpZmYgIT09IDApIHJldHVybiBkaWZmO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBicm9hZGNhc3RSZWxvYWQoKTogdm9pZCB7XG4gIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgYXQ6IERhdGUubm93KCksXG4gICAgdHdlYWtzOiB0d2Vha1N0YXRlLmRpc2NvdmVyZWQubWFwKCh0KSA9PiB0Lm1hbmlmZXN0LmlkKSxcbiAgfTtcbiAgZm9yIChjb25zdCB3YyBvZiB3ZWJDb250ZW50cy5nZXRBbGxXZWJDb250ZW50cygpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHdjLnNlbmQoXCJjb2RleHBwOnR3ZWFrcy1jaGFuZ2VkXCIsIHBheWxvYWQpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZyhcIndhcm5cIiwgXCJicm9hZGNhc3Qgc2VuZCBmYWlsZWQ6XCIsIGUpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBtYWtlTG9nZ2VyKHNjb3BlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHtcbiAgICBkZWJ1ZzogKC4uLmE6IHVua25vd25bXSkgPT4gbG9nKFwiaW5mb1wiLCBgWyR7c2NvcGV9XWAsIC4uLmEpLFxuICAgIGluZm86ICguLi5hOiB1bmtub3duW10pID0+IGxvZyhcImluZm9cIiwgYFske3Njb3BlfV1gLCAuLi5hKSxcbiAgICB3YXJuOiAoLi4uYTogdW5rbm93bltdKSA9PiBsb2coXCJ3YXJuXCIsIGBbJHtzY29wZX1dYCwgLi4uYSksXG4gICAgZXJyb3I6ICguLi5hOiB1bmtub3duW10pID0+IGxvZyhcImVycm9yXCIsIGBbJHtzY29wZX1dYCwgLi4uYSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VNYWluSXBjKGlkOiBzdHJpbmcpIHtcbiAgY29uc3QgY2ggPSAoYzogc3RyaW5nKSA9PiBgY29kZXhwcDoke2lkfToke2N9YDtcbiAgcmV0dXJuIHtcbiAgICBvbjogKGM6IHN0cmluZywgaDogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkgPT4ge1xuICAgICAgY29uc3Qgd3JhcHBlZCA9IChfZTogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiBoKC4uLmFyZ3MpO1xuICAgICAgaXBjTWFpbi5vbihjaChjKSwgd3JhcHBlZCk7XG4gICAgICByZXR1cm4gKCkgPT4gaXBjTWFpbi5yZW1vdmVMaXN0ZW5lcihjaChjKSwgd3JhcHBlZCBhcyBuZXZlcik7XG4gICAgfSxcbiAgICBzZW5kOiAoX2M6IHN0cmluZykgPT4ge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaXBjLnNlbmQgaXMgcmVuZGVyZXJcdTIxOTJtYWluOyBtYWluIHNpZGUgdXNlcyBoYW5kbGUvb25cIik7XG4gICAgfSxcbiAgICBpbnZva2U6IChfYzogc3RyaW5nKSA9PiB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpcGMuaW52b2tlIGlzIHJlbmRlcmVyXHUyMTkybWFpbjsgbWFpbiBzaWRlIHVzZXMgaGFuZGxlXCIpO1xuICAgIH0sXG4gICAgaGFuZGxlOiAoYzogc3RyaW5nLCBoYW5kbGVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB1bmtub3duKSA9PiB7XG4gICAgICBpcGNNYWluLmhhbmRsZShjaChjKSwgKF9lOiB1bmtub3duLCAuLi5hcmdzOiB1bmtub3duW10pID0+IGhhbmRsZXIoLi4uYXJncykpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VNYWluRnMoaWQ6IHN0cmluZykge1xuICBjb25zdCBkaXIgPSBqb2luKHVzZXJSb290ISwgXCJ0d2Vhay1kYXRhXCIsIGlkKTtcbiAgbWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIGNvbnN0IGZzID0gcmVxdWlyZShcIm5vZGU6ZnMvcHJvbWlzZXNcIikgYXMgdHlwZW9mIGltcG9ydChcIm5vZGU6ZnMvcHJvbWlzZXNcIik7XG4gIHJldHVybiB7XG4gICAgZGF0YURpcjogZGlyLFxuICAgIHJlYWQ6IChwOiBzdHJpbmcpID0+IGZzLnJlYWRGaWxlKGpvaW4oZGlyLCBwKSwgXCJ1dGY4XCIpLFxuICAgIHdyaXRlOiAocDogc3RyaW5nLCBjOiBzdHJpbmcpID0+IGZzLndyaXRlRmlsZShqb2luKGRpciwgcCksIGMsIFwidXRmOFwiKSxcbiAgICBleGlzdHM6IGFzeW5jIChwOiBzdHJpbmcpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGZzLmFjY2Vzcyhqb2luKGRpciwgcCkpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn1cblxuLy8gVG91Y2ggQnJvd3NlcldpbmRvdyB0byBrZWVwIGl0cyBpbXBvcnQgXHUyMDE0IG9sZGVyIEVsZWN0cm9uIGxpbnQgcnVsZXMuXG52b2lkIEJyb3dzZXJXaW5kb3c7XG4iLCAiLyohIGNob2tpZGFyIC0gTUlUIExpY2Vuc2UgKGMpIDIwMTIgUGF1bCBNaWxsZXIgKHBhdWxtaWxsci5jb20pICovXG5pbXBvcnQgeyBzdGF0IGFzIHN0YXRjYiB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHN0YXQsIHJlYWRkaXIgfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tICdldmVudHMnO1xuaW1wb3J0ICogYXMgc3lzUGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHJlYWRkaXJwIH0gZnJvbSAncmVhZGRpcnAnO1xuaW1wb3J0IHsgTm9kZUZzSGFuZGxlciwgRVZFTlRTIGFzIEVWLCBpc1dpbmRvd3MsIGlzSUJNaSwgRU1QVFlfRk4sIFNUUl9DTE9TRSwgU1RSX0VORCwgfSBmcm9tICcuL2hhbmRsZXIuanMnO1xuY29uc3QgU0xBU0ggPSAnLyc7XG5jb25zdCBTTEFTSF9TTEFTSCA9ICcvLyc7XG5jb25zdCBPTkVfRE9UID0gJy4nO1xuY29uc3QgVFdPX0RPVFMgPSAnLi4nO1xuY29uc3QgU1RSSU5HX1RZUEUgPSAnc3RyaW5nJztcbmNvbnN0IEJBQ0tfU0xBU0hfUkUgPSAvXFxcXC9nO1xuY29uc3QgRE9VQkxFX1NMQVNIX1JFID0gL1xcL1xcLy87XG5jb25zdCBET1RfUkUgPSAvXFwuLipcXC4oc3dbcHhdKSR8fiR8XFwuc3VibC4qXFwudG1wLztcbmNvbnN0IFJFUExBQ0VSX1JFID0gL15cXC5bL1xcXFxdLztcbmZ1bmN0aW9uIGFycmlmeShpdGVtKSB7XG4gICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoaXRlbSkgPyBpdGVtIDogW2l0ZW1dO1xufVxuY29uc3QgaXNNYXRjaGVyT2JqZWN0ID0gKG1hdGNoZXIpID0+IHR5cGVvZiBtYXRjaGVyID09PSAnb2JqZWN0JyAmJiBtYXRjaGVyICE9PSBudWxsICYmICEobWF0Y2hlciBpbnN0YW5jZW9mIFJlZ0V4cCk7XG5mdW5jdGlvbiBjcmVhdGVQYXR0ZXJuKG1hdGNoZXIpIHtcbiAgICBpZiAodHlwZW9mIG1hdGNoZXIgPT09ICdmdW5jdGlvbicpXG4gICAgICAgIHJldHVybiBtYXRjaGVyO1xuICAgIGlmICh0eXBlb2YgbWF0Y2hlciA9PT0gJ3N0cmluZycpXG4gICAgICAgIHJldHVybiAoc3RyaW5nKSA9PiBtYXRjaGVyID09PSBzdHJpbmc7XG4gICAgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBSZWdFeHApXG4gICAgICAgIHJldHVybiAoc3RyaW5nKSA9PiBtYXRjaGVyLnRlc3Qoc3RyaW5nKTtcbiAgICBpZiAodHlwZW9mIG1hdGNoZXIgPT09ICdvYmplY3QnICYmIG1hdGNoZXIgIT09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIChzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGlmIChtYXRjaGVyLnBhdGggPT09IHN0cmluZylcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVyLnJlY3Vyc2l2ZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlbGF0aXZlID0gc3lzUGF0aC5yZWxhdGl2ZShtYXRjaGVyLnBhdGgsIHN0cmluZyk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZWxhdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiAhcmVsYXRpdmUuc3RhcnRzV2l0aCgnLi4nKSAmJiAhc3lzUGF0aC5pc0Fic29sdXRlKHJlbGF0aXZlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuICgpID0+IGZhbHNlO1xufVxuZnVuY3Rpb24gbm9ybWFsaXplUGF0aChwYXRoKSB7XG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJylcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdzdHJpbmcgZXhwZWN0ZWQnKTtcbiAgICBwYXRoID0gc3lzUGF0aC5ub3JtYWxpemUocGF0aCk7XG4gICAgcGF0aCA9IHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuICAgIGxldCBwcmVwZW5kID0gZmFsc2U7XG4gICAgaWYgKHBhdGguc3RhcnRzV2l0aCgnLy8nKSlcbiAgICAgICAgcHJlcGVuZCA9IHRydWU7XG4gICAgY29uc3QgRE9VQkxFX1NMQVNIX1JFID0gL1xcL1xcLy87XG4gICAgd2hpbGUgKHBhdGgubWF0Y2goRE9VQkxFX1NMQVNIX1JFKSlcbiAgICAgICAgcGF0aCA9IHBhdGgucmVwbGFjZShET1VCTEVfU0xBU0hfUkUsICcvJyk7XG4gICAgaWYgKHByZXBlbmQpXG4gICAgICAgIHBhdGggPSAnLycgKyBwYXRoO1xuICAgIHJldHVybiBwYXRoO1xufVxuZnVuY3Rpb24gbWF0Y2hQYXR0ZXJucyhwYXR0ZXJucywgdGVzdFN0cmluZywgc3RhdHMpIHtcbiAgICBjb25zdCBwYXRoID0gbm9ybWFsaXplUGF0aCh0ZXN0U3RyaW5nKTtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcGF0dGVybnMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm4gPSBwYXR0ZXJuc1tpbmRleF07XG4gICAgICAgIGlmIChwYXR0ZXJuKHBhdGgsIHN0YXRzKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuZnVuY3Rpb24gYW55bWF0Y2gobWF0Y2hlcnMsIHRlc3RTdHJpbmcpIHtcbiAgICBpZiAobWF0Y2hlcnMgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhbnltYXRjaDogc3BlY2lmeSBmaXJzdCBhcmd1bWVudCcpO1xuICAgIH1cbiAgICAvLyBFYXJseSBjYWNoZSBmb3IgbWF0Y2hlcnMuXG4gICAgY29uc3QgbWF0Y2hlcnNBcnJheSA9IGFycmlmeShtYXRjaGVycyk7XG4gICAgY29uc3QgcGF0dGVybnMgPSBtYXRjaGVyc0FycmF5Lm1hcCgobWF0Y2hlcikgPT4gY3JlYXRlUGF0dGVybihtYXRjaGVyKSk7XG4gICAgaWYgKHRlc3RTdHJpbmcgPT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gKHRlc3RTdHJpbmcsIHN0YXRzKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hQYXR0ZXJucyhwYXR0ZXJucywgdGVzdFN0cmluZywgc3RhdHMpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hQYXR0ZXJucyhwYXR0ZXJucywgdGVzdFN0cmluZyk7XG59XG5jb25zdCB1bmlmeVBhdGhzID0gKHBhdGhzXykgPT4ge1xuICAgIGNvbnN0IHBhdGhzID0gYXJyaWZ5KHBhdGhzXykuZmxhdCgpO1xuICAgIGlmICghcGF0aHMuZXZlcnkoKHApID0+IHR5cGVvZiBwID09PSBTVFJJTkdfVFlQRSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgTm9uLXN0cmluZyBwcm92aWRlZCBhcyB3YXRjaCBwYXRoOiAke3BhdGhzfWApO1xuICAgIH1cbiAgICByZXR1cm4gcGF0aHMubWFwKG5vcm1hbGl6ZVBhdGhUb1VuaXgpO1xufTtcbi8vIElmIFNMQVNIX1NMQVNIIG9jY3VycyBhdCB0aGUgYmVnaW5uaW5nIG9mIHBhdGgsIGl0IGlzIG5vdCByZXBsYWNlZFxuLy8gICAgIGJlY2F1c2UgXCIvL1N0b3JhZ2VQQy9Ecml2ZVBvb2wvTW92aWVzXCIgaXMgYSB2YWxpZCBuZXR3b3JrIHBhdGhcbmNvbnN0IHRvVW5peCA9IChzdHJpbmcpID0+IHtcbiAgICBsZXQgc3RyID0gc3RyaW5nLnJlcGxhY2UoQkFDS19TTEFTSF9SRSwgU0xBU0gpO1xuICAgIGxldCBwcmVwZW5kID0gZmFsc2U7XG4gICAgaWYgKHN0ci5zdGFydHNXaXRoKFNMQVNIX1NMQVNIKSkge1xuICAgICAgICBwcmVwZW5kID0gdHJ1ZTtcbiAgICB9XG4gICAgd2hpbGUgKHN0ci5tYXRjaChET1VCTEVfU0xBU0hfUkUpKSB7XG4gICAgICAgIHN0ciA9IHN0ci5yZXBsYWNlKERPVUJMRV9TTEFTSF9SRSwgU0xBU0gpO1xuICAgIH1cbiAgICBpZiAocHJlcGVuZCkge1xuICAgICAgICBzdHIgPSBTTEFTSCArIHN0cjtcbiAgICB9XG4gICAgcmV0dXJuIHN0cjtcbn07XG4vLyBPdXIgdmVyc2lvbiBvZiB1cGF0aC5ub3JtYWxpemVcbi8vIFRPRE86IHRoaXMgaXMgbm90IGVxdWFsIHRvIHBhdGgtbm9ybWFsaXplIG1vZHVsZSAtIGludmVzdGlnYXRlIHdoeVxuY29uc3Qgbm9ybWFsaXplUGF0aFRvVW5peCA9IChwYXRoKSA9PiB0b1VuaXgoc3lzUGF0aC5ub3JtYWxpemUodG9Vbml4KHBhdGgpKSk7XG4vLyBUT0RPOiByZWZhY3RvclxuY29uc3Qgbm9ybWFsaXplSWdub3JlZCA9IChjd2QgPSAnJykgPT4gKHBhdGgpID0+IHtcbiAgICBpZiAodHlwZW9mIHBhdGggPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBub3JtYWxpemVQYXRoVG9Vbml4KHN5c1BhdGguaXNBYnNvbHV0ZShwYXRoKSA/IHBhdGggOiBzeXNQYXRoLmpvaW4oY3dkLCBwYXRoKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gcGF0aDtcbiAgICB9XG59O1xuY29uc3QgZ2V0QWJzb2x1dGVQYXRoID0gKHBhdGgsIGN3ZCkgPT4ge1xuICAgIGlmIChzeXNQYXRoLmlzQWJzb2x1dGUocGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgfVxuICAgIHJldHVybiBzeXNQYXRoLmpvaW4oY3dkLCBwYXRoKTtcbn07XG5jb25zdCBFTVBUWV9TRVQgPSBPYmplY3QuZnJlZXplKG5ldyBTZXQoKSk7XG4vKipcbiAqIERpcmVjdG9yeSBlbnRyeS5cbiAqL1xuY2xhc3MgRGlyRW50cnkge1xuICAgIGNvbnN0cnVjdG9yKGRpciwgcmVtb3ZlV2F0Y2hlcikge1xuICAgICAgICB0aGlzLnBhdGggPSBkaXI7XG4gICAgICAgIHRoaXMuX3JlbW92ZVdhdGNoZXIgPSByZW1vdmVXYXRjaGVyO1xuICAgICAgICB0aGlzLml0ZW1zID0gbmV3IFNldCgpO1xuICAgIH1cbiAgICBhZGQoaXRlbSkge1xuICAgICAgICBjb25zdCB7IGl0ZW1zIH0gPSB0aGlzO1xuICAgICAgICBpZiAoIWl0ZW1zKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBpZiAoaXRlbSAhPT0gT05FX0RPVCAmJiBpdGVtICE9PSBUV09fRE9UUylcbiAgICAgICAgICAgIGl0ZW1zLmFkZChpdGVtKTtcbiAgICB9XG4gICAgYXN5bmMgcmVtb3ZlKGl0ZW0pIHtcbiAgICAgICAgY29uc3QgeyBpdGVtcyB9ID0gdGhpcztcbiAgICAgICAgaWYgKCFpdGVtcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaXRlbXMuZGVsZXRlKGl0ZW0pO1xuICAgICAgICBpZiAoaXRlbXMuc2l6ZSA+IDApXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNvbnN0IGRpciA9IHRoaXMucGF0aDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHJlYWRkaXIoZGlyKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5fcmVtb3ZlV2F0Y2hlcikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3JlbW92ZVdhdGNoZXIoc3lzUGF0aC5kaXJuYW1lKGRpciksIHN5c1BhdGguYmFzZW5hbWUoZGlyKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgaGFzKGl0ZW0pIHtcbiAgICAgICAgY29uc3QgeyBpdGVtcyB9ID0gdGhpcztcbiAgICAgICAgaWYgKCFpdGVtcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgcmV0dXJuIGl0ZW1zLmhhcyhpdGVtKTtcbiAgICB9XG4gICAgZ2V0Q2hpbGRyZW4oKSB7XG4gICAgICAgIGNvbnN0IHsgaXRlbXMgfSA9IHRoaXM7XG4gICAgICAgIGlmICghaXRlbXMpXG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIHJldHVybiBbLi4uaXRlbXMudmFsdWVzKCldO1xuICAgIH1cbiAgICBkaXNwb3NlKCkge1xuICAgICAgICB0aGlzLml0ZW1zLmNsZWFyKCk7XG4gICAgICAgIHRoaXMucGF0aCA9ICcnO1xuICAgICAgICB0aGlzLl9yZW1vdmVXYXRjaGVyID0gRU1QVFlfRk47XG4gICAgICAgIHRoaXMuaXRlbXMgPSBFTVBUWV9TRVQ7XG4gICAgICAgIE9iamVjdC5mcmVlemUodGhpcyk7XG4gICAgfVxufVxuY29uc3QgU1RBVF9NRVRIT0RfRiA9ICdzdGF0JztcbmNvbnN0IFNUQVRfTUVUSE9EX0wgPSAnbHN0YXQnO1xuZXhwb3J0IGNsYXNzIFdhdGNoSGVscGVyIHtcbiAgICBjb25zdHJ1Y3RvcihwYXRoLCBmb2xsb3csIGZzdykge1xuICAgICAgICB0aGlzLmZzdyA9IGZzdztcbiAgICAgICAgY29uc3Qgd2F0Y2hQYXRoID0gcGF0aDtcbiAgICAgICAgdGhpcy5wYXRoID0gcGF0aCA9IHBhdGgucmVwbGFjZShSRVBMQUNFUl9SRSwgJycpO1xuICAgICAgICB0aGlzLndhdGNoUGF0aCA9IHdhdGNoUGF0aDtcbiAgICAgICAgdGhpcy5mdWxsV2F0Y2hQYXRoID0gc3lzUGF0aC5yZXNvbHZlKHdhdGNoUGF0aCk7XG4gICAgICAgIHRoaXMuZGlyUGFydHMgPSBbXTtcbiAgICAgICAgdGhpcy5kaXJQYXJ0cy5mb3JFYWNoKChwYXJ0cykgPT4ge1xuICAgICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDEpXG4gICAgICAgICAgICAgICAgcGFydHMucG9wKCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmZvbGxvd1N5bWxpbmtzID0gZm9sbG93O1xuICAgICAgICB0aGlzLnN0YXRNZXRob2QgPSBmb2xsb3cgPyBTVEFUX01FVEhPRF9GIDogU1RBVF9NRVRIT0RfTDtcbiAgICB9XG4gICAgZW50cnlQYXRoKGVudHJ5KSB7XG4gICAgICAgIHJldHVybiBzeXNQYXRoLmpvaW4odGhpcy53YXRjaFBhdGgsIHN5c1BhdGgucmVsYXRpdmUodGhpcy53YXRjaFBhdGgsIGVudHJ5LmZ1bGxQYXRoKSk7XG4gICAgfVxuICAgIGZpbHRlclBhdGgoZW50cnkpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0cyB9ID0gZW50cnk7XG4gICAgICAgIGlmIChzdGF0cyAmJiBzdGF0cy5pc1N5bWJvbGljTGluaygpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZmlsdGVyRGlyKGVudHJ5KTtcbiAgICAgICAgY29uc3QgcmVzb2x2ZWRQYXRoID0gdGhpcy5lbnRyeVBhdGgoZW50cnkpO1xuICAgICAgICAvLyBUT0RPOiB3aGF0IGlmIHN0YXRzIGlzIHVuZGVmaW5lZD8gcmVtb3ZlICFcbiAgICAgICAgcmV0dXJuIHRoaXMuZnN3Ll9pc250SWdub3JlZChyZXNvbHZlZFBhdGgsIHN0YXRzKSAmJiB0aGlzLmZzdy5faGFzUmVhZFBlcm1pc3Npb25zKHN0YXRzKTtcbiAgICB9XG4gICAgZmlsdGVyRGlyKGVudHJ5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZzdy5faXNudElnbm9yZWQodGhpcy5lbnRyeVBhdGgoZW50cnkpLCBlbnRyeS5zdGF0cyk7XG4gICAgfVxufVxuLyoqXG4gKiBXYXRjaGVzIGZpbGVzICYgZGlyZWN0b3JpZXMgZm9yIGNoYW5nZXMuIEVtaXR0ZWQgZXZlbnRzOlxuICogYGFkZGAsIGBhZGREaXJgLCBgY2hhbmdlYCwgYHVubGlua2AsIGB1bmxpbmtEaXJgLCBgYWxsYCwgYGVycm9yYFxuICpcbiAqICAgICBuZXcgRlNXYXRjaGVyKClcbiAqICAgICAgIC5hZGQoZGlyZWN0b3JpZXMpXG4gKiAgICAgICAub24oJ2FkZCcsIHBhdGggPT4gbG9nKCdGaWxlJywgcGF0aCwgJ3dhcyBhZGRlZCcpKVxuICovXG5leHBvcnQgY2xhc3MgRlNXYXRjaGVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcbiAgICAvLyBOb3QgaW5kZW50aW5nIG1ldGhvZHMgZm9yIGhpc3Rvcnkgc2FrZTsgZm9yIG5vdy5cbiAgICBjb25zdHJ1Y3Rvcihfb3B0cyA9IHt9KSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuY2xvc2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2Nsb3NlcnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuX2lnbm9yZWRQYXRocyA9IG5ldyBTZXQoKTtcbiAgICAgICAgdGhpcy5fdGhyb3R0bGVkID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLl9zdHJlYW1zID0gbmV3IFNldCgpO1xuICAgICAgICB0aGlzLl9zeW1saW5rUGF0aHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuX3dhdGNoZWQgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuX3BlbmRpbmdXcml0ZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuX3BlbmRpbmdVbmxpbmtzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLl9yZWFkeUNvdW50ID0gMDtcbiAgICAgICAgdGhpcy5fcmVhZHlFbWl0dGVkID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IGF3ZiA9IF9vcHRzLmF3YWl0V3JpdGVGaW5pc2g7XG4gICAgICAgIGNvbnN0IERFRl9BV0YgPSB7IHN0YWJpbGl0eVRocmVzaG9sZDogMjAwMCwgcG9sbEludGVydmFsOiAxMDAgfTtcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcbiAgICAgICAgICAgIC8vIERlZmF1bHRzXG4gICAgICAgICAgICBwZXJzaXN0ZW50OiB0cnVlLFxuICAgICAgICAgICAgaWdub3JlSW5pdGlhbDogZmFsc2UsXG4gICAgICAgICAgICBpZ25vcmVQZXJtaXNzaW9uRXJyb3JzOiBmYWxzZSxcbiAgICAgICAgICAgIGludGVydmFsOiAxMDAsXG4gICAgICAgICAgICBiaW5hcnlJbnRlcnZhbDogMzAwLFxuICAgICAgICAgICAgZm9sbG93U3ltbGlua3M6IHRydWUsXG4gICAgICAgICAgICB1c2VQb2xsaW5nOiBmYWxzZSxcbiAgICAgICAgICAgIC8vIHVzZUFzeW5jOiBmYWxzZSxcbiAgICAgICAgICAgIGF0b21pYzogdHJ1ZSwgLy8gTk9URTogb3ZlcndyaXR0ZW4gbGF0ZXIgKGRlcGVuZHMgb24gdXNlUG9sbGluZylcbiAgICAgICAgICAgIC4uLl9vcHRzLFxuICAgICAgICAgICAgLy8gQ2hhbmdlIGZvcm1hdFxuICAgICAgICAgICAgaWdub3JlZDogX29wdHMuaWdub3JlZCA/IGFycmlmeShfb3B0cy5pZ25vcmVkKSA6IGFycmlmeShbXSksXG4gICAgICAgICAgICBhd2FpdFdyaXRlRmluaXNoOiBhd2YgPT09IHRydWUgPyBERUZfQVdGIDogdHlwZW9mIGF3ZiA9PT0gJ29iamVjdCcgPyB7IC4uLkRFRl9BV0YsIC4uLmF3ZiB9IDogZmFsc2UsXG4gICAgICAgIH07XG4gICAgICAgIC8vIEFsd2F5cyBkZWZhdWx0IHRvIHBvbGxpbmcgb24gSUJNIGkgYmVjYXVzZSBmcy53YXRjaCgpIGlzIG5vdCBhdmFpbGFibGUgb24gSUJNIGkuXG4gICAgICAgIGlmIChpc0lCTWkpXG4gICAgICAgICAgICBvcHRzLnVzZVBvbGxpbmcgPSB0cnVlO1xuICAgICAgICAvLyBFZGl0b3IgYXRvbWljIHdyaXRlIG5vcm1hbGl6YXRpb24gZW5hYmxlZCBieSBkZWZhdWx0IHdpdGggZnMud2F0Y2hcbiAgICAgICAgaWYgKG9wdHMuYXRvbWljID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBvcHRzLmF0b21pYyA9ICFvcHRzLnVzZVBvbGxpbmc7XG4gICAgICAgIC8vIG9wdHMuYXRvbWljID0gdHlwZW9mIF9vcHRzLmF0b21pYyA9PT0gJ251bWJlcicgPyBfb3B0cy5hdG9taWMgOiAxMDA7XG4gICAgICAgIC8vIEdsb2JhbCBvdmVycmlkZS4gVXNlZnVsIGZvciBkZXZlbG9wZXJzLCB3aG8gbmVlZCB0byBmb3JjZSBwb2xsaW5nIGZvciBhbGxcbiAgICAgICAgLy8gaW5zdGFuY2VzIG9mIGNob2tpZGFyLCByZWdhcmRsZXNzIG9mIHVzYWdlIC8gZGVwZW5kZW5jeSBkZXB0aFxuICAgICAgICBjb25zdCBlbnZQb2xsID0gcHJvY2Vzcy5lbnYuQ0hPS0lEQVJfVVNFUE9MTElORztcbiAgICAgICAgaWYgKGVudlBvbGwgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc3QgZW52TG93ZXIgPSBlbnZQb2xsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAoZW52TG93ZXIgPT09ICdmYWxzZScgfHwgZW52TG93ZXIgPT09ICcwJylcbiAgICAgICAgICAgICAgICBvcHRzLnVzZVBvbGxpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKGVudkxvd2VyID09PSAndHJ1ZScgfHwgZW52TG93ZXIgPT09ICcxJylcbiAgICAgICAgICAgICAgICBvcHRzLnVzZVBvbGxpbmcgPSB0cnVlO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG9wdHMudXNlUG9sbGluZyA9ICEhZW52TG93ZXI7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZW52SW50ZXJ2YWwgPSBwcm9jZXNzLmVudi5DSE9LSURBUl9JTlRFUlZBTDtcbiAgICAgICAgaWYgKGVudkludGVydmFsKVxuICAgICAgICAgICAgb3B0cy5pbnRlcnZhbCA9IE51bWJlci5wYXJzZUludChlbnZJbnRlcnZhbCwgMTApO1xuICAgICAgICAvLyBUaGlzIGlzIGRvbmUgdG8gZW1pdCByZWFkeSBvbmx5IG9uY2UsIGJ1dCBlYWNoICdhZGQnIHdpbGwgaW5jcmVhc2UgdGhhdD9cbiAgICAgICAgbGV0IHJlYWR5Q2FsbHMgPSAwO1xuICAgICAgICB0aGlzLl9lbWl0UmVhZHkgPSAoKSA9PiB7XG4gICAgICAgICAgICByZWFkeUNhbGxzKys7XG4gICAgICAgICAgICBpZiAocmVhZHlDYWxscyA+PSB0aGlzLl9yZWFkeUNvdW50KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fZW1pdFJlYWR5ID0gRU1QVFlfRk47XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZHlFbWl0dGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAvLyB1c2UgcHJvY2Vzcy5uZXh0VGljayB0byBhbGxvdyB0aW1lIGZvciBsaXN0ZW5lciB0byBiZSBib3VuZFxuICAgICAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4gdGhpcy5lbWl0KEVWLlJFQURZKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuX2VtaXRSYXcgPSAoLi4uYXJncykgPT4gdGhpcy5lbWl0KEVWLlJBVywgLi4uYXJncyk7XG4gICAgICAgIHRoaXMuX2JvdW5kUmVtb3ZlID0gdGhpcy5fcmVtb3ZlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub3B0aW9ucyA9IG9wdHM7XG4gICAgICAgIHRoaXMuX25vZGVGc0hhbmRsZXIgPSBuZXcgTm9kZUZzSGFuZGxlcih0aGlzKTtcbiAgICAgICAgLy8gWW91XHUyMDE5cmUgZnJvemVuIHdoZW4geW91ciBoZWFydFx1MjAxOXMgbm90IG9wZW4uXG4gICAgICAgIE9iamVjdC5mcmVlemUob3B0cyk7XG4gICAgfVxuICAgIF9hZGRJZ25vcmVkUGF0aChtYXRjaGVyKSB7XG4gICAgICAgIGlmIChpc01hdGNoZXJPYmplY3QobWF0Y2hlcikpIHtcbiAgICAgICAgICAgIC8vIHJldHVybiBlYXJseSBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBkZWVwbHkgZXF1YWwgbWF0Y2hlciBvYmplY3RcbiAgICAgICAgICAgIGZvciAoY29uc3QgaWdub3JlZCBvZiB0aGlzLl9pZ25vcmVkUGF0aHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNNYXRjaGVyT2JqZWN0KGlnbm9yZWQpICYmXG4gICAgICAgICAgICAgICAgICAgIGlnbm9yZWQucGF0aCA9PT0gbWF0Y2hlci5wYXRoICYmXG4gICAgICAgICAgICAgICAgICAgIGlnbm9yZWQucmVjdXJzaXZlID09PSBtYXRjaGVyLnJlY3Vyc2l2ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2lnbm9yZWRQYXRocy5hZGQobWF0Y2hlcik7XG4gICAgfVxuICAgIF9yZW1vdmVJZ25vcmVkUGF0aChtYXRjaGVyKSB7XG4gICAgICAgIHRoaXMuX2lnbm9yZWRQYXRocy5kZWxldGUobWF0Y2hlcik7XG4gICAgICAgIC8vIG5vdyBmaW5kIGFueSBtYXRjaGVyIG9iamVjdHMgd2l0aCB0aGUgbWF0Y2hlciBhcyBwYXRoXG4gICAgICAgIGlmICh0eXBlb2YgbWF0Y2hlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaWdub3JlZCBvZiB0aGlzLl9pZ25vcmVkUGF0aHMpIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPICg0MzA4MWopOiBtYWtlIHRoaXMgbW9yZSBlZmZpY2llbnQuXG4gICAgICAgICAgICAgICAgLy8gcHJvYmFibHkganVzdCBtYWtlIGEgYHRoaXMuX2lnbm9yZWREaXJlY3Rvcmllc2Agb3Igc29tZVxuICAgICAgICAgICAgICAgIC8vIHN1Y2ggdGhpbmcuXG4gICAgICAgICAgICAgICAgaWYgKGlzTWF0Y2hlck9iamVjdChpZ25vcmVkKSAmJiBpZ25vcmVkLnBhdGggPT09IG1hdGNoZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faWdub3JlZFBhdGhzLmRlbGV0ZShpZ25vcmVkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gUHVibGljIG1ldGhvZHNcbiAgICAvKipcbiAgICAgKiBBZGRzIHBhdGhzIHRvIGJlIHdhdGNoZWQgb24gYW4gZXhpc3RpbmcgRlNXYXRjaGVyIGluc3RhbmNlLlxuICAgICAqIEBwYXJhbSBwYXRoc18gZmlsZSBvciBmaWxlIGxpc3QuIE90aGVyIGFyZ3VtZW50cyBhcmUgdW51c2VkXG4gICAgICovXG4gICAgYWRkKHBhdGhzXywgX29yaWdBZGQsIF9pbnRlcm5hbCkge1xuICAgICAgICBjb25zdCB7IGN3ZCB9ID0gdGhpcy5vcHRpb25zO1xuICAgICAgICB0aGlzLmNsb3NlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jbG9zZVByb21pc2UgPSB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBwYXRocyA9IHVuaWZ5UGF0aHMocGF0aHNfKTtcbiAgICAgICAgaWYgKGN3ZCkge1xuICAgICAgICAgICAgcGF0aHMgPSBwYXRocy5tYXAoKHBhdGgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhYnNQYXRoID0gZ2V0QWJzb2x1dGVQYXRoKHBhdGgsIGN3ZCk7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgYHBhdGhgIGluc3RlYWQgb2YgYGFic1BhdGhgIGJlY2F1c2UgdGhlIGN3ZCBwb3J0aW9uIGNhbid0IGJlIGEgZ2xvYlxuICAgICAgICAgICAgICAgIHJldHVybiBhYnNQYXRoO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcGF0aHMuZm9yRWFjaCgocGF0aCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fcmVtb3ZlSWdub3JlZFBhdGgocGF0aCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLl91c2VySWdub3JlZCA9IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKCF0aGlzLl9yZWFkeUNvdW50KVxuICAgICAgICAgICAgdGhpcy5fcmVhZHlDb3VudCA9IDA7XG4gICAgICAgIHRoaXMuX3JlYWR5Q291bnQgKz0gcGF0aHMubGVuZ3RoO1xuICAgICAgICBQcm9taXNlLmFsbChwYXRocy5tYXAoYXN5bmMgKHBhdGgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuX25vZGVGc0hhbmRsZXIuX2FkZFRvTm9kZUZzKHBhdGgsICFfaW50ZXJuYWwsIHVuZGVmaW5lZCwgMCwgX29yaWdBZGQpO1xuICAgICAgICAgICAgaWYgKHJlcylcbiAgICAgICAgICAgICAgICB0aGlzLl9lbWl0UmVhZHkoKTtcbiAgICAgICAgICAgIHJldHVybiByZXM7XG4gICAgICAgIH0pKS50aGVuKChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICBpZiAodGhpcy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgcmVzdWx0cy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0pXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkKHN5c1BhdGguZGlybmFtZShpdGVtKSwgc3lzUGF0aC5iYXNlbmFtZShfb3JpZ0FkZCB8fCBpdGVtKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDbG9zZSB3YXRjaGVycyBvciBzdGFydCBpZ25vcmluZyBldmVudHMgZnJvbSBzcGVjaWZpZWQgcGF0aHMuXG4gICAgICovXG4gICAgdW53YXRjaChwYXRoc18pIHtcbiAgICAgICAgaWYgKHRoaXMuY2xvc2VkKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIGNvbnN0IHBhdGhzID0gdW5pZnlQYXRocyhwYXRoc18pO1xuICAgICAgICBjb25zdCB7IGN3ZCB9ID0gdGhpcy5vcHRpb25zO1xuICAgICAgICBwYXRocy5mb3JFYWNoKChwYXRoKSA9PiB7XG4gICAgICAgICAgICAvLyBjb252ZXJ0IHRvIGFic29sdXRlIHBhdGggdW5sZXNzIHJlbGF0aXZlIHBhdGggYWxyZWFkeSBtYXRjaGVzXG4gICAgICAgICAgICBpZiAoIXN5c1BhdGguaXNBYnNvbHV0ZShwYXRoKSAmJiAhdGhpcy5fY2xvc2Vycy5oYXMocGF0aCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoY3dkKVxuICAgICAgICAgICAgICAgICAgICBwYXRoID0gc3lzUGF0aC5qb2luKGN3ZCwgcGF0aCk7XG4gICAgICAgICAgICAgICAgcGF0aCA9IHN5c1BhdGgucmVzb2x2ZShwYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2Nsb3NlUGF0aChwYXRoKTtcbiAgICAgICAgICAgIHRoaXMuX2FkZElnbm9yZWRQYXRoKHBhdGgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuX3dhdGNoZWQuaGFzKHBhdGgpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRkSWdub3JlZFBhdGgoe1xuICAgICAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgICAgICAgICByZWN1cnNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXNldCB0aGUgY2FjaGVkIHVzZXJJZ25vcmVkIGFueW1hdGNoIGZuXG4gICAgICAgICAgICAvLyB0byBtYWtlIGlnbm9yZWRQYXRocyBjaGFuZ2VzIGVmZmVjdGl2ZVxuICAgICAgICAgICAgdGhpcy5fdXNlcklnbm9yZWQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2xvc2Ugd2F0Y2hlcnMgYW5kIHJlbW92ZSBhbGwgbGlzdGVuZXJzIGZyb20gd2F0Y2hlZCBwYXRocy5cbiAgICAgKi9cbiAgICBjbG9zZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2Nsb3NlUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2Nsb3NlUHJvbWlzZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsb3NlZCA9IHRydWU7XG4gICAgICAgIC8vIE1lbW9yeSBtYW5hZ2VtZW50LlxuICAgICAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycygpO1xuICAgICAgICBjb25zdCBjbG9zZXJzID0gW107XG4gICAgICAgIHRoaXMuX2Nsb3NlcnMuZm9yRWFjaCgoY2xvc2VyTGlzdCkgPT4gY2xvc2VyTGlzdC5mb3JFYWNoKChjbG9zZXIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByb21pc2UgPSBjbG9zZXIoKTtcbiAgICAgICAgICAgIGlmIChwcm9taXNlIGluc3RhbmNlb2YgUHJvbWlzZSlcbiAgICAgICAgICAgICAgICBjbG9zZXJzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIH0pKTtcbiAgICAgICAgdGhpcy5fc3RyZWFtcy5mb3JFYWNoKChzdHJlYW0pID0+IHN0cmVhbS5kZXN0cm95KCkpO1xuICAgICAgICB0aGlzLl91c2VySWdub3JlZCA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5fcmVhZHlDb3VudCA9IDA7XG4gICAgICAgIHRoaXMuX3JlYWR5RW1pdHRlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl93YXRjaGVkLmZvckVhY2goKGRpcmVudCkgPT4gZGlyZW50LmRpc3Bvc2UoKSk7XG4gICAgICAgIHRoaXMuX2Nsb3NlcnMuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5fd2F0Y2hlZC5jbGVhcigpO1xuICAgICAgICB0aGlzLl9zdHJlYW1zLmNsZWFyKCk7XG4gICAgICAgIHRoaXMuX3N5bWxpbmtQYXRocy5jbGVhcigpO1xuICAgICAgICB0aGlzLl90aHJvdHRsZWQuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5fY2xvc2VQcm9taXNlID0gY2xvc2Vycy5sZW5ndGhcbiAgICAgICAgICAgID8gUHJvbWlzZS5hbGwoY2xvc2VycykudGhlbigoKSA9PiB1bmRlZmluZWQpXG4gICAgICAgICAgICA6IFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xvc2VQcm9taXNlO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBFeHBvc2UgbGlzdCBvZiB3YXRjaGVkIHBhdGhzXG4gICAgICogQHJldHVybnMgZm9yIGNoYWluaW5nXG4gICAgICovXG4gICAgZ2V0V2F0Y2hlZCgpIHtcbiAgICAgICAgY29uc3Qgd2F0Y2hMaXN0ID0ge307XG4gICAgICAgIHRoaXMuX3dhdGNoZWQuZm9yRWFjaCgoZW50cnksIGRpcikgPT4ge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gdGhpcy5vcHRpb25zLmN3ZCA/IHN5c1BhdGgucmVsYXRpdmUodGhpcy5vcHRpb25zLmN3ZCwgZGlyKSA6IGRpcjtcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0ga2V5IHx8IE9ORV9ET1Q7XG4gICAgICAgICAgICB3YXRjaExpc3RbaW5kZXhdID0gZW50cnkuZ2V0Q2hpbGRyZW4oKS5zb3J0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gd2F0Y2hMaXN0O1xuICAgIH1cbiAgICBlbWl0V2l0aEFsbChldmVudCwgYXJncykge1xuICAgICAgICB0aGlzLmVtaXQoZXZlbnQsIC4uLmFyZ3MpO1xuICAgICAgICBpZiAoZXZlbnQgIT09IEVWLkVSUk9SKVxuICAgICAgICAgICAgdGhpcy5lbWl0KEVWLkFMTCwgZXZlbnQsIC4uLmFyZ3MpO1xuICAgIH1cbiAgICAvLyBDb21tb24gaGVscGVyc1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tXG4gICAgLyoqXG4gICAgICogTm9ybWFsaXplIGFuZCBlbWl0IGV2ZW50cy5cbiAgICAgKiBDYWxsaW5nIF9lbWl0IERPRVMgTk9UIE1FQU4gZW1pdCgpIHdvdWxkIGJlIGNhbGxlZCFcbiAgICAgKiBAcGFyYW0gZXZlbnQgVHlwZSBvZiBldmVudFxuICAgICAqIEBwYXJhbSBwYXRoIEZpbGUgb3IgZGlyZWN0b3J5IHBhdGhcbiAgICAgKiBAcGFyYW0gc3RhdHMgYXJndW1lbnRzIHRvIGJlIHBhc3NlZCB3aXRoIGV2ZW50XG4gICAgICogQHJldHVybnMgdGhlIGVycm9yIGlmIGRlZmluZWQsIG90aGVyd2lzZSB0aGUgdmFsdWUgb2YgdGhlIEZTV2F0Y2hlciBpbnN0YW5jZSdzIGBjbG9zZWRgIGZsYWdcbiAgICAgKi9cbiAgICBhc3luYyBfZW1pdChldmVudCwgcGF0aCwgc3RhdHMpIHtcbiAgICAgICAgaWYgKHRoaXMuY2xvc2VkKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBvcHRzID0gdGhpcy5vcHRpb25zO1xuICAgICAgICBpZiAoaXNXaW5kb3dzKVxuICAgICAgICAgICAgcGF0aCA9IHN5c1BhdGgubm9ybWFsaXplKHBhdGgpO1xuICAgICAgICBpZiAob3B0cy5jd2QpXG4gICAgICAgICAgICBwYXRoID0gc3lzUGF0aC5yZWxhdGl2ZShvcHRzLmN3ZCwgcGF0aCk7XG4gICAgICAgIGNvbnN0IGFyZ3MgPSBbcGF0aF07XG4gICAgICAgIGlmIChzdGF0cyAhPSBudWxsKVxuICAgICAgICAgICAgYXJncy5wdXNoKHN0YXRzKTtcbiAgICAgICAgY29uc3QgYXdmID0gb3B0cy5hd2FpdFdyaXRlRmluaXNoO1xuICAgICAgICBsZXQgcHc7XG4gICAgICAgIGlmIChhd2YgJiYgKHB3ID0gdGhpcy5fcGVuZGluZ1dyaXRlcy5nZXQocGF0aCkpKSB7XG4gICAgICAgICAgICBwdy5sYXN0Q2hhbmdlID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmF0b21pYykge1xuICAgICAgICAgICAgaWYgKGV2ZW50ID09PSBFVi5VTkxJTkspIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wZW5kaW5nVW5saW5rcy5zZXQocGF0aCwgW2V2ZW50LCAuLi5hcmdzXSk7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3BlbmRpbmdVbmxpbmtzLmZvckVhY2goKGVudHJ5LCBwYXRoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQoLi4uZW50cnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KEVWLkFMTCwgLi4uZW50cnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcGVuZGluZ1VubGlua3MuZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9LCB0eXBlb2Ygb3B0cy5hdG9taWMgPT09ICdudW1iZXInID8gb3B0cy5hdG9taWMgOiAxMDApO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGV2ZW50ID09PSBFVi5BREQgJiYgdGhpcy5fcGVuZGluZ1VubGlua3MuaGFzKHBhdGgpKSB7XG4gICAgICAgICAgICAgICAgZXZlbnQgPSBFVi5DSEFOR0U7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGVuZGluZ1VubGlua3MuZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChhd2YgJiYgKGV2ZW50ID09PSBFVi5BREQgfHwgZXZlbnQgPT09IEVWLkNIQU5HRSkgJiYgdGhpcy5fcmVhZHlFbWl0dGVkKSB7XG4gICAgICAgICAgICBjb25zdCBhd2ZFbWl0ID0gKGVyciwgc3RhdHMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50ID0gRVYuRVJST1I7XG4gICAgICAgICAgICAgICAgICAgIGFyZ3NbMF0gPSBlcnI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdFdpdGhBbGwoZXZlbnQsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzdGF0cykge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBzdGF0cyBkb2Vzbid0IGV4aXN0IHRoZSBmaWxlIG11c3QgaGF2ZSBiZWVuIGRlbGV0ZWRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJnc1sxXSA9IHN0YXRzO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJncy5wdXNoKHN0YXRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXRXaXRoQWxsKGV2ZW50LCBhcmdzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy5fYXdhaXRXcml0ZUZpbmlzaChwYXRoLCBhd2Yuc3RhYmlsaXR5VGhyZXNob2xkLCBldmVudCwgYXdmRW1pdCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXZlbnQgPT09IEVWLkNIQU5HRSkge1xuICAgICAgICAgICAgY29uc3QgaXNUaHJvdHRsZWQgPSAhdGhpcy5fdGhyb3R0bGUoRVYuQ0hBTkdFLCBwYXRoLCA1MCk7XG4gICAgICAgICAgICBpZiAoaXNUaHJvdHRsZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuYWx3YXlzU3RhdCAmJlxuICAgICAgICAgICAgc3RhdHMgPT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKGV2ZW50ID09PSBFVi5BREQgfHwgZXZlbnQgPT09IEVWLkFERF9ESVIgfHwgZXZlbnQgPT09IEVWLkNIQU5HRSkpIHtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gb3B0cy5jd2QgPyBzeXNQYXRoLmpvaW4ob3B0cy5jd2QsIHBhdGgpIDogcGF0aDtcbiAgICAgICAgICAgIGxldCBzdGF0cztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgc3RhdHMgPSBhd2FpdCBzdGF0KGZ1bGxQYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAvLyBkbyBub3RoaW5nXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBTdXBwcmVzcyBldmVudCB3aGVuIGZzX3N0YXQgZmFpbHMsIHRvIGF2b2lkIHNlbmRpbmcgdW5kZWZpbmVkICdzdGF0J1xuICAgICAgICAgICAgaWYgKCFzdGF0cyB8fCB0aGlzLmNsb3NlZClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBhcmdzLnB1c2goc3RhdHMpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZW1pdFdpdGhBbGwoZXZlbnQsIGFyZ3MpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ29tbW9uIGhhbmRsZXIgZm9yIGVycm9yc1xuICAgICAqIEByZXR1cm5zIFRoZSBlcnJvciBpZiBkZWZpbmVkLCBvdGhlcndpc2UgdGhlIHZhbHVlIG9mIHRoZSBGU1dhdGNoZXIgaW5zdGFuY2UncyBgY2xvc2VkYCBmbGFnXG4gICAgICovXG4gICAgX2hhbmRsZUVycm9yKGVycm9yKSB7XG4gICAgICAgIGNvbnN0IGNvZGUgPSBlcnJvciAmJiBlcnJvci5jb2RlO1xuICAgICAgICBpZiAoZXJyb3IgJiZcbiAgICAgICAgICAgIGNvZGUgIT09ICdFTk9FTlQnICYmXG4gICAgICAgICAgICBjb2RlICE9PSAnRU5PVERJUicgJiZcbiAgICAgICAgICAgICghdGhpcy5vcHRpb25zLmlnbm9yZVBlcm1pc3Npb25FcnJvcnMgfHwgKGNvZGUgIT09ICdFUEVSTScgJiYgY29kZSAhPT0gJ0VBQ0NFUycpKSkge1xuICAgICAgICAgICAgdGhpcy5lbWl0KEVWLkVSUk9SLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGVycm9yIHx8IHRoaXMuY2xvc2VkO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBIZWxwZXIgdXRpbGl0eSBmb3IgdGhyb3R0bGluZ1xuICAgICAqIEBwYXJhbSBhY3Rpb25UeXBlIHR5cGUgYmVpbmcgdGhyb3R0bGVkXG4gICAgICogQHBhcmFtIHBhdGggYmVpbmcgYWN0ZWQgdXBvblxuICAgICAqIEBwYXJhbSB0aW1lb3V0IGR1cmF0aW9uIG9mIHRpbWUgdG8gc3VwcHJlc3MgZHVwbGljYXRlIGFjdGlvbnNcbiAgICAgKiBAcmV0dXJucyB0cmFja2luZyBvYmplY3Qgb3IgZmFsc2UgaWYgYWN0aW9uIHNob3VsZCBiZSBzdXBwcmVzc2VkXG4gICAgICovXG4gICAgX3Rocm90dGxlKGFjdGlvblR5cGUsIHBhdGgsIHRpbWVvdXQpIHtcbiAgICAgICAgaWYgKCF0aGlzLl90aHJvdHRsZWQuaGFzKGFjdGlvblR5cGUpKSB7XG4gICAgICAgICAgICB0aGlzLl90aHJvdHRsZWQuc2V0KGFjdGlvblR5cGUsIG5ldyBNYXAoKSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYWN0aW9uID0gdGhpcy5fdGhyb3R0bGVkLmdldChhY3Rpb25UeXBlKTtcbiAgICAgICAgaWYgKCFhY3Rpb24pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgdGhyb3R0bGUnKTtcbiAgICAgICAgY29uc3QgYWN0aW9uUGF0aCA9IGFjdGlvbi5nZXQocGF0aCk7XG4gICAgICAgIGlmIChhY3Rpb25QYXRoKSB7XG4gICAgICAgICAgICBhY3Rpb25QYXRoLmNvdW50Kys7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIHByZWZlci1jb25zdFxuICAgICAgICBsZXQgdGltZW91dE9iamVjdDtcbiAgICAgICAgY29uc3QgY2xlYXIgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gYWN0aW9uLmdldChwYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGNvdW50ID0gaXRlbSA/IGl0ZW0uY291bnQgOiAwO1xuICAgICAgICAgICAgYWN0aW9uLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0T2JqZWN0KTtcbiAgICAgICAgICAgIGlmIChpdGVtKVxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChpdGVtLnRpbWVvdXRPYmplY3QpO1xuICAgICAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgICAgICB9O1xuICAgICAgICB0aW1lb3V0T2JqZWN0ID0gc2V0VGltZW91dChjbGVhciwgdGltZW91dCk7XG4gICAgICAgIGNvbnN0IHRociA9IHsgdGltZW91dE9iamVjdCwgY2xlYXIsIGNvdW50OiAwIH07XG4gICAgICAgIGFjdGlvbi5zZXQocGF0aCwgdGhyKTtcbiAgICAgICAgcmV0dXJuIHRocjtcbiAgICB9XG4gICAgX2luY3JSZWFkeUNvdW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVhZHlDb3VudCsrO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBBd2FpdHMgd3JpdGUgb3BlcmF0aW9uIHRvIGZpbmlzaC5cbiAgICAgKiBQb2xscyBhIG5ld2x5IGNyZWF0ZWQgZmlsZSBmb3Igc2l6ZSB2YXJpYXRpb25zLiBXaGVuIGZpbGVzIHNpemUgZG9lcyBub3QgY2hhbmdlIGZvciAndGhyZXNob2xkJyBtaWxsaXNlY29uZHMgY2FsbHMgY2FsbGJhY2suXG4gICAgICogQHBhcmFtIHBhdGggYmVpbmcgYWN0ZWQgdXBvblxuICAgICAqIEBwYXJhbSB0aHJlc2hvbGQgVGltZSBpbiBtaWxsaXNlY29uZHMgYSBmaWxlIHNpemUgbXVzdCBiZSBmaXhlZCBiZWZvcmUgYWNrbm93bGVkZ2luZyB3cml0ZSBPUCBpcyBmaW5pc2hlZFxuICAgICAqIEBwYXJhbSBldmVudFxuICAgICAqIEBwYXJhbSBhd2ZFbWl0IENhbGxiYWNrIHRvIGJlIGNhbGxlZCB3aGVuIHJlYWR5IGZvciBldmVudCB0byBiZSBlbWl0dGVkLlxuICAgICAqL1xuICAgIF9hd2FpdFdyaXRlRmluaXNoKHBhdGgsIHRocmVzaG9sZCwgZXZlbnQsIGF3ZkVtaXQpIHtcbiAgICAgICAgY29uc3QgYXdmID0gdGhpcy5vcHRpb25zLmF3YWl0V3JpdGVGaW5pc2g7XG4gICAgICAgIGlmICh0eXBlb2YgYXdmICE9PSAnb2JqZWN0JylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY29uc3QgcG9sbEludGVydmFsID0gYXdmLnBvbGxJbnRlcnZhbDtcbiAgICAgICAgbGV0IHRpbWVvdXRIYW5kbGVyO1xuICAgICAgICBsZXQgZnVsbFBhdGggPSBwYXRoO1xuICAgICAgICBpZiAodGhpcy5vcHRpb25zLmN3ZCAmJiAhc3lzUGF0aC5pc0Fic29sdXRlKHBhdGgpKSB7XG4gICAgICAgICAgICBmdWxsUGF0aCA9IHN5c1BhdGguam9pbih0aGlzLm9wdGlvbnMuY3dkLCBwYXRoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgICBjb25zdCB3cml0ZXMgPSB0aGlzLl9wZW5kaW5nV3JpdGVzO1xuICAgICAgICBmdW5jdGlvbiBhd2FpdFdyaXRlRmluaXNoRm4ocHJldlN0YXQpIHtcbiAgICAgICAgICAgIHN0YXRjYihmdWxsUGF0aCwgKGVyciwgY3VyU3RhdCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgfHwgIXdyaXRlcy5oYXMocGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVyciAmJiBlcnIuY29kZSAhPT0gJ0VOT0VOVCcpXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2ZFbWl0KGVycik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgbm93ID0gTnVtYmVyKG5ldyBEYXRlKCkpO1xuICAgICAgICAgICAgICAgIGlmIChwcmV2U3RhdCAmJiBjdXJTdGF0LnNpemUgIT09IHByZXZTdGF0LnNpemUpIHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVzLmdldChwYXRoKS5sYXN0Q2hhbmdlID0gbm93O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwdyA9IHdyaXRlcy5nZXQocGF0aCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZGYgPSBub3cgLSBwdy5sYXN0Q2hhbmdlO1xuICAgICAgICAgICAgICAgIGlmIChkZiA+PSB0aHJlc2hvbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgd3JpdGVzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgYXdmRW1pdCh1bmRlZmluZWQsIGN1clN0YXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dEhhbmRsZXIgPSBzZXRUaW1lb3V0KGF3YWl0V3JpdGVGaW5pc2hGbiwgcG9sbEludGVydmFsLCBjdXJTdGF0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXdyaXRlcy5oYXMocGF0aCkpIHtcbiAgICAgICAgICAgIHdyaXRlcy5zZXQocGF0aCwge1xuICAgICAgICAgICAgICAgIGxhc3RDaGFuZ2U6IG5vdyxcbiAgICAgICAgICAgICAgICBjYW5jZWxXYWl0OiAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHdyaXRlcy5kZWxldGUocGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlcik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBldmVudDtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aW1lb3V0SGFuZGxlciA9IHNldFRpbWVvdXQoYXdhaXRXcml0ZUZpbmlzaEZuLCBwb2xsSW50ZXJ2YWwpO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgd2hldGhlciB1c2VyIGhhcyBhc2tlZCB0byBpZ25vcmUgdGhpcyBwYXRoLlxuICAgICAqL1xuICAgIF9pc0lnbm9yZWQocGF0aCwgc3RhdHMpIHtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5hdG9taWMgJiYgRE9UX1JFLnRlc3QocGF0aCkpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgaWYgKCF0aGlzLl91c2VySWdub3JlZCkge1xuICAgICAgICAgICAgY29uc3QgeyBjd2QgfSA9IHRoaXMub3B0aW9ucztcbiAgICAgICAgICAgIGNvbnN0IGlnbiA9IHRoaXMub3B0aW9ucy5pZ25vcmVkO1xuICAgICAgICAgICAgY29uc3QgaWdub3JlZCA9IChpZ24gfHwgW10pLm1hcChub3JtYWxpemVJZ25vcmVkKGN3ZCkpO1xuICAgICAgICAgICAgY29uc3QgaWdub3JlZFBhdGhzID0gWy4uLnRoaXMuX2lnbm9yZWRQYXRoc107XG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gWy4uLmlnbm9yZWRQYXRocy5tYXAobm9ybWFsaXplSWdub3JlZChjd2QpKSwgLi4uaWdub3JlZF07XG4gICAgICAgICAgICB0aGlzLl91c2VySWdub3JlZCA9IGFueW1hdGNoKGxpc3QsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX3VzZXJJZ25vcmVkKHBhdGgsIHN0YXRzKTtcbiAgICB9XG4gICAgX2lzbnRJZ25vcmVkKHBhdGgsIHN0YXQpIHtcbiAgICAgICAgcmV0dXJuICF0aGlzLl9pc0lnbm9yZWQocGF0aCwgc3RhdCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFByb3ZpZGVzIGEgc2V0IG9mIGNvbW1vbiBoZWxwZXJzIGFuZCBwcm9wZXJ0aWVzIHJlbGF0aW5nIHRvIHN5bWxpbmsgaGFuZGxpbmcuXG4gICAgICogQHBhcmFtIHBhdGggZmlsZSBvciBkaXJlY3RvcnkgcGF0dGVybiBiZWluZyB3YXRjaGVkXG4gICAgICovXG4gICAgX2dldFdhdGNoSGVscGVycyhwYXRoKSB7XG4gICAgICAgIHJldHVybiBuZXcgV2F0Y2hIZWxwZXIocGF0aCwgdGhpcy5vcHRpb25zLmZvbGxvd1N5bWxpbmtzLCB0aGlzKTtcbiAgICB9XG4gICAgLy8gRGlyZWN0b3J5IGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8qKlxuICAgICAqIFByb3ZpZGVzIGRpcmVjdG9yeSB0cmFja2luZyBvYmplY3RzXG4gICAgICogQHBhcmFtIGRpcmVjdG9yeSBwYXRoIG9mIHRoZSBkaXJlY3RvcnlcbiAgICAgKi9cbiAgICBfZ2V0V2F0Y2hlZERpcihkaXJlY3RvcnkpIHtcbiAgICAgICAgY29uc3QgZGlyID0gc3lzUGF0aC5yZXNvbHZlKGRpcmVjdG9yeSk7XG4gICAgICAgIGlmICghdGhpcy5fd2F0Y2hlZC5oYXMoZGlyKSlcbiAgICAgICAgICAgIHRoaXMuX3dhdGNoZWQuc2V0KGRpciwgbmV3IERpckVudHJ5KGRpciwgdGhpcy5fYm91bmRSZW1vdmUpKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3dhdGNoZWQuZ2V0KGRpcik7XG4gICAgfVxuICAgIC8vIEZpbGUgaGVscGVyc1xuICAgIC8vIC0tLS0tLS0tLS0tLVxuICAgIC8qKlxuICAgICAqIENoZWNrIGZvciByZWFkIHBlcm1pc3Npb25zOiBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTE3ODE0MDQvMTM1ODQwNVxuICAgICAqL1xuICAgIF9oYXNSZWFkUGVybWlzc2lvbnMoc3RhdHMpIHtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5pZ25vcmVQZXJtaXNzaW9uRXJyb3JzKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIHJldHVybiBCb29sZWFuKE51bWJlcihzdGF0cy5tb2RlKSAmIDBvNDAwKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSGFuZGxlcyBlbWl0dGluZyB1bmxpbmsgZXZlbnRzIGZvclxuICAgICAqIGZpbGVzIGFuZCBkaXJlY3RvcmllcywgYW5kIHZpYSByZWN1cnNpb24sIGZvclxuICAgICAqIGZpbGVzIGFuZCBkaXJlY3RvcmllcyB3aXRoaW4gZGlyZWN0b3JpZXMgdGhhdCBhcmUgdW5saW5rZWRcbiAgICAgKiBAcGFyYW0gZGlyZWN0b3J5IHdpdGhpbiB3aGljaCB0aGUgZm9sbG93aW5nIGl0ZW0gaXMgbG9jYXRlZFxuICAgICAqIEBwYXJhbSBpdGVtICAgICAgYmFzZSBwYXRoIG9mIGl0ZW0vZGlyZWN0b3J5XG4gICAgICovXG4gICAgX3JlbW92ZShkaXJlY3RvcnksIGl0ZW0sIGlzRGlyZWN0b3J5KSB7XG4gICAgICAgIC8vIGlmIHdoYXQgaXMgYmVpbmcgZGVsZXRlZCBpcyBhIGRpcmVjdG9yeSwgZ2V0IHRoYXQgZGlyZWN0b3J5J3MgcGF0aHNcbiAgICAgICAgLy8gZm9yIHJlY3Vyc2l2ZSBkZWxldGluZyBhbmQgY2xlYW5pbmcgb2Ygd2F0Y2hlZCBvYmplY3RcbiAgICAgICAgLy8gaWYgaXQgaXMgbm90IGEgZGlyZWN0b3J5LCBuZXN0ZWREaXJlY3RvcnlDaGlsZHJlbiB3aWxsIGJlIGVtcHR5IGFycmF5XG4gICAgICAgIGNvbnN0IHBhdGggPSBzeXNQYXRoLmpvaW4oZGlyZWN0b3J5LCBpdGVtKTtcbiAgICAgICAgY29uc3QgZnVsbFBhdGggPSBzeXNQYXRoLnJlc29sdmUocGF0aCk7XG4gICAgICAgIGlzRGlyZWN0b3J5ID1cbiAgICAgICAgICAgIGlzRGlyZWN0b3J5ICE9IG51bGwgPyBpc0RpcmVjdG9yeSA6IHRoaXMuX3dhdGNoZWQuaGFzKHBhdGgpIHx8IHRoaXMuX3dhdGNoZWQuaGFzKGZ1bGxQYXRoKTtcbiAgICAgICAgLy8gcHJldmVudCBkdXBsaWNhdGUgaGFuZGxpbmcgaW4gY2FzZSBvZiBhcnJpdmluZyBoZXJlIG5lYXJseSBzaW11bHRhbmVvdXNseVxuICAgICAgICAvLyB2aWEgbXVsdGlwbGUgcGF0aHMgKHN1Y2ggYXMgX2hhbmRsZUZpbGUgYW5kIF9oYW5kbGVEaXIpXG4gICAgICAgIGlmICghdGhpcy5fdGhyb3R0bGUoJ3JlbW92ZScsIHBhdGgsIDEwMCkpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIC8vIGlmIHRoZSBvbmx5IHdhdGNoZWQgZmlsZSBpcyByZW1vdmVkLCB3YXRjaCBmb3IgaXRzIHJldHVyblxuICAgICAgICBpZiAoIWlzRGlyZWN0b3J5ICYmIHRoaXMuX3dhdGNoZWQuc2l6ZSA9PT0gMSkge1xuICAgICAgICAgICAgdGhpcy5hZGQoZGlyZWN0b3J5LCBpdGVtLCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGlzIHdpbGwgY3JlYXRlIGEgbmV3IGVudHJ5IGluIHRoZSB3YXRjaGVkIG9iamVjdCBpbiBlaXRoZXIgY2FzZVxuICAgICAgICAvLyBzbyB3ZSBnb3QgdG8gZG8gdGhlIGRpcmVjdG9yeSBjaGVjayBiZWZvcmVoYW5kXG4gICAgICAgIGNvbnN0IHdwID0gdGhpcy5fZ2V0V2F0Y2hlZERpcihwYXRoKTtcbiAgICAgICAgY29uc3QgbmVzdGVkRGlyZWN0b3J5Q2hpbGRyZW4gPSB3cC5nZXRDaGlsZHJlbigpO1xuICAgICAgICAvLyBSZWN1cnNpdmVseSByZW1vdmUgY2hpbGRyZW4gZGlyZWN0b3JpZXMgLyBmaWxlcy5cbiAgICAgICAgbmVzdGVkRGlyZWN0b3J5Q2hpbGRyZW4uZm9yRWFjaCgobmVzdGVkKSA9PiB0aGlzLl9yZW1vdmUocGF0aCwgbmVzdGVkKSk7XG4gICAgICAgIC8vIENoZWNrIGlmIGl0ZW0gd2FzIG9uIHRoZSB3YXRjaGVkIGxpc3QgYW5kIHJlbW92ZSBpdFxuICAgICAgICBjb25zdCBwYXJlbnQgPSB0aGlzLl9nZXRXYXRjaGVkRGlyKGRpcmVjdG9yeSk7XG4gICAgICAgIGNvbnN0IHdhc1RyYWNrZWQgPSBwYXJlbnQuaGFzKGl0ZW0pO1xuICAgICAgICBwYXJlbnQucmVtb3ZlKGl0ZW0pO1xuICAgICAgICAvLyBGaXhlcyBpc3N1ZSAjMTA0MiAtPiBSZWxhdGl2ZSBwYXRocyB3ZXJlIGRldGVjdGVkIGFuZCBhZGRlZCBhcyBzeW1saW5rc1xuICAgICAgICAvLyAoaHR0cHM6Ly9naXRodWIuY29tL3BhdWxtaWxsci9jaG9raWRhci9ibG9iL2UxNzUzZGRiYzk1NzFiZGMzM2I0YTRhZjE3MmQ1MmNiNmU2MTFjMTAvbGliL25vZGVmcy1oYW5kbGVyLmpzI0w2MTIpLFxuICAgICAgICAvLyBidXQgbmV2ZXIgcmVtb3ZlZCBmcm9tIHRoZSBtYXAgaW4gY2FzZSB0aGUgcGF0aCB3YXMgZGVsZXRlZC5cbiAgICAgICAgLy8gVGhpcyBsZWFkcyB0byBhbiBpbmNvcnJlY3Qgc3RhdGUgaWYgdGhlIHBhdGggd2FzIHJlY3JlYXRlZDpcbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhdWxtaWxsci9jaG9raWRhci9ibG9iL2UxNzUzZGRiYzk1NzFiZGMzM2I0YTRhZjE3MmQ1MmNiNmU2MTFjMTAvbGliL25vZGVmcy1oYW5kbGVyLmpzI0w1NTNcbiAgICAgICAgaWYgKHRoaXMuX3N5bWxpbmtQYXRocy5oYXMoZnVsbFBhdGgpKSB7XG4gICAgICAgICAgICB0aGlzLl9zeW1saW5rUGF0aHMuZGVsZXRlKGZ1bGxQYXRoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB3ZSB3YWl0IGZvciB0aGlzIGZpbGUgdG8gYmUgZnVsbHkgd3JpdHRlbiwgY2FuY2VsIHRoZSB3YWl0LlxuICAgICAgICBsZXQgcmVsUGF0aCA9IHBhdGg7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuY3dkKVxuICAgICAgICAgICAgcmVsUGF0aCA9IHN5c1BhdGgucmVsYXRpdmUodGhpcy5vcHRpb25zLmN3ZCwgcGF0aCk7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuYXdhaXRXcml0ZUZpbmlzaCAmJiB0aGlzLl9wZW5kaW5nV3JpdGVzLmhhcyhyZWxQYXRoKSkge1xuICAgICAgICAgICAgY29uc3QgZXZlbnQgPSB0aGlzLl9wZW5kaW5nV3JpdGVzLmdldChyZWxQYXRoKS5jYW5jZWxXYWl0KCk7XG4gICAgICAgICAgICBpZiAoZXZlbnQgPT09IEVWLkFERClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhlIEVudHJ5IHdpbGwgZWl0aGVyIGJlIGEgZGlyZWN0b3J5IHRoYXQganVzdCBnb3QgcmVtb3ZlZFxuICAgICAgICAvLyBvciBhIGJvZ3VzIGVudHJ5IHRvIGEgZmlsZSwgaW4gZWl0aGVyIGNhc2Ugd2UgaGF2ZSB0byByZW1vdmUgaXRcbiAgICAgICAgdGhpcy5fd2F0Y2hlZC5kZWxldGUocGF0aCk7XG4gICAgICAgIHRoaXMuX3dhdGNoZWQuZGVsZXRlKGZ1bGxQYXRoKTtcbiAgICAgICAgY29uc3QgZXZlbnROYW1lID0gaXNEaXJlY3RvcnkgPyBFVi5VTkxJTktfRElSIDogRVYuVU5MSU5LO1xuICAgICAgICBpZiAod2FzVHJhY2tlZCAmJiAhdGhpcy5faXNJZ25vcmVkKHBhdGgpKVxuICAgICAgICAgICAgdGhpcy5fZW1pdChldmVudE5hbWUsIHBhdGgpO1xuICAgICAgICAvLyBBdm9pZCBjb25mbGljdHMgaWYgd2UgbGF0ZXIgY3JlYXRlIGFub3RoZXIgZmlsZSB3aXRoIHRoZSBzYW1lIG5hbWVcbiAgICAgICAgdGhpcy5fY2xvc2VQYXRoKHBhdGgpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDbG9zZXMgYWxsIHdhdGNoZXJzIGZvciBhIHBhdGhcbiAgICAgKi9cbiAgICBfY2xvc2VQYXRoKHBhdGgpIHtcbiAgICAgICAgdGhpcy5fY2xvc2VGaWxlKHBhdGgpO1xuICAgICAgICBjb25zdCBkaXIgPSBzeXNQYXRoLmRpcm5hbWUocGF0aCk7XG4gICAgICAgIHRoaXMuX2dldFdhdGNoZWREaXIoZGlyKS5yZW1vdmUoc3lzUGF0aC5iYXNlbmFtZShwYXRoKSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENsb3NlcyBvbmx5IGZpbGUtc3BlY2lmaWMgd2F0Y2hlcnNcbiAgICAgKi9cbiAgICBfY2xvc2VGaWxlKHBhdGgpIHtcbiAgICAgICAgY29uc3QgY2xvc2VycyA9IHRoaXMuX2Nsb3NlcnMuZ2V0KHBhdGgpO1xuICAgICAgICBpZiAoIWNsb3NlcnMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNsb3NlcnMuZm9yRWFjaCgoY2xvc2VyKSA9PiBjbG9zZXIoKSk7XG4gICAgICAgIHRoaXMuX2Nsb3NlcnMuZGVsZXRlKHBhdGgpO1xuICAgIH1cbiAgICBfYWRkUGF0aENsb3NlcihwYXRoLCBjbG9zZXIpIHtcbiAgICAgICAgaWYgKCFjbG9zZXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGxldCBsaXN0ID0gdGhpcy5fY2xvc2Vycy5nZXQocGF0aCk7XG4gICAgICAgIGlmICghbGlzdCkge1xuICAgICAgICAgICAgbGlzdCA9IFtdO1xuICAgICAgICAgICAgdGhpcy5fY2xvc2Vycy5zZXQocGF0aCwgbGlzdCk7XG4gICAgICAgIH1cbiAgICAgICAgbGlzdC5wdXNoKGNsb3Nlcik7XG4gICAgfVxuICAgIF9yZWFkZGlycChyb290LCBvcHRzKSB7XG4gICAgICAgIGlmICh0aGlzLmNsb3NlZClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IHsgdHlwZTogRVYuQUxMLCBhbHdheXNTdGF0OiB0cnVlLCBsc3RhdDogdHJ1ZSwgLi4ub3B0cywgZGVwdGg6IDAgfTtcbiAgICAgICAgbGV0IHN0cmVhbSA9IHJlYWRkaXJwKHJvb3QsIG9wdGlvbnMpO1xuICAgICAgICB0aGlzLl9zdHJlYW1zLmFkZChzdHJlYW0pO1xuICAgICAgICBzdHJlYW0ub25jZShTVFJfQ0xPU0UsICgpID0+IHtcbiAgICAgICAgICAgIHN0cmVhbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfSk7XG4gICAgICAgIHN0cmVhbS5vbmNlKFNUUl9FTkQsICgpID0+IHtcbiAgICAgICAgICAgIGlmIChzdHJlYW0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9zdHJlYW1zLmRlbGV0ZShzdHJlYW0pO1xuICAgICAgICAgICAgICAgIHN0cmVhbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBzdHJlYW07XG4gICAgfVxufVxuLyoqXG4gKiBJbnN0YW50aWF0ZXMgd2F0Y2hlciB3aXRoIHBhdGhzIHRvIGJlIHRyYWNrZWQuXG4gKiBAcGFyYW0gcGF0aHMgZmlsZSAvIGRpcmVjdG9yeSBwYXRoc1xuICogQHBhcmFtIG9wdGlvbnMgb3B0cywgc3VjaCBhcyBgYXRvbWljYCwgYGF3YWl0V3JpdGVGaW5pc2hgLCBgaWdub3JlZGAsIGFuZCBvdGhlcnNcbiAqIEByZXR1cm5zIGFuIGluc3RhbmNlIG9mIEZTV2F0Y2hlciBmb3IgY2hhaW5pbmcuXG4gKiBAZXhhbXBsZVxuICogY29uc3Qgd2F0Y2hlciA9IHdhdGNoKCcuJykub24oJ2FsbCcsIChldmVudCwgcGF0aCkgPT4geyBjb25zb2xlLmxvZyhldmVudCwgcGF0aCk7IH0pO1xuICogd2F0Y2goJy4nLCB7IGF0b21pYzogdHJ1ZSwgYXdhaXRXcml0ZUZpbmlzaDogdHJ1ZSwgaWdub3JlZDogKGYsIHN0YXRzKSA9PiBzdGF0cz8uaXNGaWxlKCkgJiYgIWYuZW5kc1dpdGgoJy5qcycpIH0pXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YXRjaChwYXRocywgb3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3Qgd2F0Y2hlciA9IG5ldyBGU1dhdGNoZXIob3B0aW9ucyk7XG4gICAgd2F0Y2hlci5hZGQocGF0aHMpO1xuICAgIHJldHVybiB3YXRjaGVyO1xufVxuZXhwb3J0IGRlZmF1bHQgeyB3YXRjaCwgRlNXYXRjaGVyIH07XG4iLCAiaW1wb3J0IHsgc3RhdCwgbHN0YXQsIHJlYWRkaXIsIHJlYWxwYXRoIH0gZnJvbSAnbm9kZTpmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyBSZWFkYWJsZSB9IGZyb20gJ25vZGU6c3RyZWFtJztcbmltcG9ydCB7IHJlc29sdmUgYXMgcHJlc29sdmUsIHJlbGF0aXZlIGFzIHByZWxhdGl2ZSwgam9pbiBhcyBwam9pbiwgc2VwIGFzIHBzZXAgfSBmcm9tICdub2RlOnBhdGgnO1xuZXhwb3J0IGNvbnN0IEVudHJ5VHlwZXMgPSB7XG4gICAgRklMRV9UWVBFOiAnZmlsZXMnLFxuICAgIERJUl9UWVBFOiAnZGlyZWN0b3JpZXMnLFxuICAgIEZJTEVfRElSX1RZUEU6ICdmaWxlc19kaXJlY3RvcmllcycsXG4gICAgRVZFUllUSElOR19UWVBFOiAnYWxsJyxcbn07XG5jb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICByb290OiAnLicsXG4gICAgZmlsZUZpbHRlcjogKF9lbnRyeUluZm8pID0+IHRydWUsXG4gICAgZGlyZWN0b3J5RmlsdGVyOiAoX2VudHJ5SW5mbykgPT4gdHJ1ZSxcbiAgICB0eXBlOiBFbnRyeVR5cGVzLkZJTEVfVFlQRSxcbiAgICBsc3RhdDogZmFsc2UsXG4gICAgZGVwdGg6IDIxNDc0ODM2NDgsXG4gICAgYWx3YXlzU3RhdDogZmFsc2UsXG4gICAgaGlnaFdhdGVyTWFyazogNDA5Nixcbn07XG5PYmplY3QuZnJlZXplKGRlZmF1bHRPcHRpb25zKTtcbmNvbnN0IFJFQ1VSU0lWRV9FUlJPUl9DT0RFID0gJ1JFQURESVJQX1JFQ1VSU0lWRV9FUlJPUic7XG5jb25zdCBOT1JNQUxfRkxPV19FUlJPUlMgPSBuZXcgU2V0KFsnRU5PRU5UJywgJ0VQRVJNJywgJ0VBQ0NFUycsICdFTE9PUCcsIFJFQ1VSU0lWRV9FUlJPUl9DT0RFXSk7XG5jb25zdCBBTExfVFlQRVMgPSBbXG4gICAgRW50cnlUeXBlcy5ESVJfVFlQRSxcbiAgICBFbnRyeVR5cGVzLkVWRVJZVEhJTkdfVFlQRSxcbiAgICBFbnRyeVR5cGVzLkZJTEVfRElSX1RZUEUsXG4gICAgRW50cnlUeXBlcy5GSUxFX1RZUEUsXG5dO1xuY29uc3QgRElSX1RZUEVTID0gbmV3IFNldChbXG4gICAgRW50cnlUeXBlcy5ESVJfVFlQRSxcbiAgICBFbnRyeVR5cGVzLkVWRVJZVEhJTkdfVFlQRSxcbiAgICBFbnRyeVR5cGVzLkZJTEVfRElSX1RZUEUsXG5dKTtcbmNvbnN0IEZJTEVfVFlQRVMgPSBuZXcgU2V0KFtcbiAgICBFbnRyeVR5cGVzLkVWRVJZVEhJTkdfVFlQRSxcbiAgICBFbnRyeVR5cGVzLkZJTEVfRElSX1RZUEUsXG4gICAgRW50cnlUeXBlcy5GSUxFX1RZUEUsXG5dKTtcbmNvbnN0IGlzTm9ybWFsRmxvd0Vycm9yID0gKGVycm9yKSA9PiBOT1JNQUxfRkxPV19FUlJPUlMuaGFzKGVycm9yLmNvZGUpO1xuY29uc3Qgd2FudEJpZ2ludEZzU3RhdHMgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInO1xuY29uc3QgZW1wdHlGbiA9IChfZW50cnlJbmZvKSA9PiB0cnVlO1xuY29uc3Qgbm9ybWFsaXplRmlsdGVyID0gKGZpbHRlcikgPT4ge1xuICAgIGlmIChmaWx0ZXIgPT09IHVuZGVmaW5lZClcbiAgICAgICAgcmV0dXJuIGVtcHR5Rm47XG4gICAgaWYgKHR5cGVvZiBmaWx0ZXIgPT09ICdmdW5jdGlvbicpXG4gICAgICAgIHJldHVybiBmaWx0ZXI7XG4gICAgaWYgKHR5cGVvZiBmaWx0ZXIgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IGZsID0gZmlsdGVyLnRyaW0oKTtcbiAgICAgICAgcmV0dXJuIChlbnRyeSkgPT4gZW50cnkuYmFzZW5hbWUgPT09IGZsO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWx0ZXIpKSB7XG4gICAgICAgIGNvbnN0IHRySXRlbXMgPSBmaWx0ZXIubWFwKChpdGVtKSA9PiBpdGVtLnRyaW0oKSk7XG4gICAgICAgIHJldHVybiAoZW50cnkpID0+IHRySXRlbXMuc29tZSgoZikgPT4gZW50cnkuYmFzZW5hbWUgPT09IGYpO1xuICAgIH1cbiAgICByZXR1cm4gZW1wdHlGbjtcbn07XG4vKiogUmVhZGFibGUgcmVhZGRpciBzdHJlYW0sIGVtaXR0aW5nIG5ldyBmaWxlcyBhcyB0aGV5J3JlIGJlaW5nIGxpc3RlZC4gKi9cbmV4cG9ydCBjbGFzcyBSZWFkZGlycFN0cmVhbSBleHRlbmRzIFJlYWRhYmxlIHtcbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zID0ge30pIHtcbiAgICAgICAgc3VwZXIoe1xuICAgICAgICAgICAgb2JqZWN0TW9kZTogdHJ1ZSxcbiAgICAgICAgICAgIGF1dG9EZXN0cm95OiB0cnVlLFxuICAgICAgICAgICAgaGlnaFdhdGVyTWFyazogb3B0aW9ucy5oaWdoV2F0ZXJNYXJrLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3Qgb3B0cyA9IHsgLi4uZGVmYXVsdE9wdGlvbnMsIC4uLm9wdGlvbnMgfTtcbiAgICAgICAgY29uc3QgeyByb290LCB0eXBlIH0gPSBvcHRzO1xuICAgICAgICB0aGlzLl9maWxlRmlsdGVyID0gbm9ybWFsaXplRmlsdGVyKG9wdHMuZmlsZUZpbHRlcik7XG4gICAgICAgIHRoaXMuX2RpcmVjdG9yeUZpbHRlciA9IG5vcm1hbGl6ZUZpbHRlcihvcHRzLmRpcmVjdG9yeUZpbHRlcik7XG4gICAgICAgIGNvbnN0IHN0YXRNZXRob2QgPSBvcHRzLmxzdGF0ID8gbHN0YXQgOiBzdGF0O1xuICAgICAgICAvLyBVc2UgYmlnaW50IHN0YXRzIGlmIGl0J3Mgd2luZG93cyBhbmQgc3RhdCgpIHN1cHBvcnRzIG9wdGlvbnMgKG5vZGUgMTArKS5cbiAgICAgICAgaWYgKHdhbnRCaWdpbnRGc1N0YXRzKSB7XG4gICAgICAgICAgICB0aGlzLl9zdGF0ID0gKHBhdGgpID0+IHN0YXRNZXRob2QocGF0aCwgeyBiaWdpbnQ6IHRydWUgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9zdGF0ID0gc3RhdE1ldGhvZDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9tYXhEZXB0aCA9IG9wdHMuZGVwdGggPz8gZGVmYXVsdE9wdGlvbnMuZGVwdGg7XG4gICAgICAgIHRoaXMuX3dhbnRzRGlyID0gdHlwZSA/IERJUl9UWVBFUy5oYXModHlwZSkgOiBmYWxzZTtcbiAgICAgICAgdGhpcy5fd2FudHNGaWxlID0gdHlwZSA/IEZJTEVfVFlQRVMuaGFzKHR5cGUpIDogZmFsc2U7XG4gICAgICAgIHRoaXMuX3dhbnRzRXZlcnl0aGluZyA9IHR5cGUgPT09IEVudHJ5VHlwZXMuRVZFUllUSElOR19UWVBFO1xuICAgICAgICB0aGlzLl9yb290ID0gcHJlc29sdmUocm9vdCk7XG4gICAgICAgIHRoaXMuX2lzRGlyZW50ID0gIW9wdHMuYWx3YXlzU3RhdDtcbiAgICAgICAgdGhpcy5fc3RhdHNQcm9wID0gdGhpcy5faXNEaXJlbnQgPyAnZGlyZW50JyA6ICdzdGF0cyc7XG4gICAgICAgIHRoaXMuX3JkT3B0aW9ucyA9IHsgZW5jb2Rpbmc6ICd1dGY4Jywgd2l0aEZpbGVUeXBlczogdGhpcy5faXNEaXJlbnQgfTtcbiAgICAgICAgLy8gTGF1bmNoIHN0cmVhbSB3aXRoIG9uZSBwYXJlbnQsIHRoZSByb290IGRpci5cbiAgICAgICAgdGhpcy5wYXJlbnRzID0gW3RoaXMuX2V4cGxvcmVEaXIocm9vdCwgMSldO1xuICAgICAgICB0aGlzLnJlYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5wYXJlbnQgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGFzeW5jIF9yZWFkKGJhdGNoKSB7XG4gICAgICAgIGlmICh0aGlzLnJlYWRpbmcpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRoaXMucmVhZGluZyA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB3aGlsZSAoIXRoaXMuZGVzdHJveWVkICYmIGJhdGNoID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhciA9IHRoaXMucGFyZW50O1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbCA9IHBhciAmJiBwYXIuZmlsZXM7XG4gICAgICAgICAgICAgICAgaWYgKGZpbCAmJiBmaWwubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7IHBhdGgsIGRlcHRoIH0gPSBwYXI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNsaWNlID0gZmlsLnNwbGljZSgwLCBiYXRjaCkubWFwKChkaXJlbnQpID0+IHRoaXMuX2Zvcm1hdEVudHJ5KGRpcmVudCwgcGF0aCkpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhd2FpdGVkID0gYXdhaXQgUHJvbWlzZS5hbGwoc2xpY2UpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGF3YWl0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZW50cnkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kZXN0cm95ZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZW50cnlUeXBlID0gYXdhaXQgdGhpcy5fZ2V0RW50cnlUeXBlKGVudHJ5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbnRyeVR5cGUgPT09ICdkaXJlY3RvcnknICYmIHRoaXMuX2RpcmVjdG9yeUZpbHRlcihlbnRyeSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGggPD0gdGhpcy5fbWF4RGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXJlbnRzLnB1c2godGhpcy5fZXhwbG9yZURpcihlbnRyeS5mdWxsUGF0aCwgZGVwdGggKyAxKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl93YW50c0Rpcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1c2goZW50cnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXRjaC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKChlbnRyeVR5cGUgPT09ICdmaWxlJyB8fCB0aGlzLl9pbmNsdWRlQXNGaWxlKGVudHJ5KSkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9maWxlRmlsdGVyKGVudHJ5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLl93YW50c0ZpbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdXNoKGVudHJ5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2gtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMucGFyZW50cy5wb3AoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVzaChudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGFyZW50ID0gYXdhaXQgcGFyZW50O1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5kZXN0cm95ZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgICBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucmVhZGluZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGFzeW5jIF9leHBsb3JlRGlyKHBhdGgsIGRlcHRoKSB7XG4gICAgICAgIGxldCBmaWxlcztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZpbGVzID0gYXdhaXQgcmVhZGRpcihwYXRoLCB0aGlzLl9yZE9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgdGhpcy5fb25FcnJvcihlcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgZmlsZXMsIGRlcHRoLCBwYXRoIH07XG4gICAgfVxuICAgIGFzeW5jIF9mb3JtYXRFbnRyeShkaXJlbnQsIHBhdGgpIHtcbiAgICAgICAgbGV0IGVudHJ5O1xuICAgICAgICBjb25zdCBiYXNlbmFtZSA9IHRoaXMuX2lzRGlyZW50ID8gZGlyZW50Lm5hbWUgOiBkaXJlbnQ7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHByZXNvbHZlKHBqb2luKHBhdGgsIGJhc2VuYW1lKSk7XG4gICAgICAgICAgICBlbnRyeSA9IHsgcGF0aDogcHJlbGF0aXZlKHRoaXMuX3Jvb3QsIGZ1bGxQYXRoKSwgZnVsbFBhdGgsIGJhc2VuYW1lIH07XG4gICAgICAgICAgICBlbnRyeVt0aGlzLl9zdGF0c1Byb3BdID0gdGhpcy5faXNEaXJlbnQgPyBkaXJlbnQgOiBhd2FpdCB0aGlzLl9zdGF0KGZ1bGxQYXRoKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICB0aGlzLl9vbkVycm9yKGVycik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGVudHJ5O1xuICAgIH1cbiAgICBfb25FcnJvcihlcnIpIHtcbiAgICAgICAgaWYgKGlzTm9ybWFsRmxvd0Vycm9yKGVycikgJiYgIXRoaXMuZGVzdHJveWVkKSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoJ3dhcm4nLCBlcnIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5kZXN0cm95KGVycik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgYXN5bmMgX2dldEVudHJ5VHlwZShlbnRyeSkge1xuICAgICAgICAvLyBlbnRyeSBtYXkgYmUgdW5kZWZpbmVkLCBiZWNhdXNlIGEgd2FybmluZyBvciBhbiBlcnJvciB3ZXJlIGVtaXR0ZWRcbiAgICAgICAgLy8gYW5kIHRoZSBzdGF0c1Byb3AgaXMgdW5kZWZpbmVkXG4gICAgICAgIGlmICghZW50cnkgJiYgdGhpcy5fc3RhdHNQcm9wIGluIGVudHJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhdHMgPSBlbnRyeVt0aGlzLl9zdGF0c1Byb3BdO1xuICAgICAgICBpZiAoc3RhdHMuaXNGaWxlKCkpXG4gICAgICAgICAgICByZXR1cm4gJ2ZpbGUnO1xuICAgICAgICBpZiAoc3RhdHMuaXNEaXJlY3RvcnkoKSlcbiAgICAgICAgICAgIHJldHVybiAnZGlyZWN0b3J5JztcbiAgICAgICAgaWYgKHN0YXRzICYmIHN0YXRzLmlzU3ltYm9saWNMaW5rKCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGwgPSBlbnRyeS5mdWxsUGF0aDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW50cnlSZWFsUGF0aCA9IGF3YWl0IHJlYWxwYXRoKGZ1bGwpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5UmVhbFBhdGhTdGF0cyA9IGF3YWl0IGxzdGF0KGVudHJ5UmVhbFBhdGgpO1xuICAgICAgICAgICAgICAgIGlmIChlbnRyeVJlYWxQYXRoU3RhdHMuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdmaWxlJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGVudHJ5UmVhbFBhdGhTdGF0cy5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxlbiA9IGVudHJ5UmVhbFBhdGgubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZnVsbC5zdGFydHNXaXRoKGVudHJ5UmVhbFBhdGgpICYmIGZ1bGwuc3Vic3RyKGxlbiwgMSkgPT09IHBzZXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlY3Vyc2l2ZUVycm9yID0gbmV3IEVycm9yKGBDaXJjdWxhciBzeW1saW5rIGRldGVjdGVkOiBcIiR7ZnVsbH1cIiBwb2ludHMgdG8gXCIke2VudHJ5UmVhbFBhdGh9XCJgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY3Vyc2l2ZUVycm9yLmNvZGUgPSBSRUNVUlNJVkVfRVJST1JfQ09ERTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9vbkVycm9yKHJlY3Vyc2l2ZUVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJ2RpcmVjdG9yeSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25FcnJvcihlcnJvcik7XG4gICAgICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIF9pbmNsdWRlQXNGaWxlKGVudHJ5KSB7XG4gICAgICAgIGNvbnN0IHN0YXRzID0gZW50cnkgJiYgZW50cnlbdGhpcy5fc3RhdHNQcm9wXTtcbiAgICAgICAgcmV0dXJuIHN0YXRzICYmIHRoaXMuX3dhbnRzRXZlcnl0aGluZyAmJiAhc3RhdHMuaXNEaXJlY3RvcnkoKTtcbiAgICB9XG59XG4vKipcbiAqIFN0cmVhbWluZyB2ZXJzaW9uOiBSZWFkcyBhbGwgZmlsZXMgYW5kIGRpcmVjdG9yaWVzIGluIGdpdmVuIHJvb3QgcmVjdXJzaXZlbHkuXG4gKiBDb25zdW1lcyB+Y29uc3RhbnQgc21hbGwgYW1vdW50IG9mIFJBTS5cbiAqIEBwYXJhbSByb290IFJvb3QgZGlyZWN0b3J5XG4gKiBAcGFyYW0gb3B0aW9ucyBPcHRpb25zIHRvIHNwZWNpZnkgcm9vdCAoc3RhcnQgZGlyZWN0b3J5KSwgZmlsdGVycyBhbmQgcmVjdXJzaW9uIGRlcHRoXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkZGlycChyb290LCBvcHRpb25zID0ge30pIHtcbiAgICAvLyBAdHMtaWdub3JlXG4gICAgbGV0IHR5cGUgPSBvcHRpb25zLmVudHJ5VHlwZSB8fCBvcHRpb25zLnR5cGU7XG4gICAgaWYgKHR5cGUgPT09ICdib3RoJylcbiAgICAgICAgdHlwZSA9IEVudHJ5VHlwZXMuRklMRV9ESVJfVFlQRTsgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHlcbiAgICBpZiAodHlwZSlcbiAgICAgICAgb3B0aW9ucy50eXBlID0gdHlwZTtcbiAgICBpZiAoIXJvb3QpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZWFkZGlycDogcm9vdCBhcmd1bWVudCBpcyByZXF1aXJlZC4gVXNhZ2U6IHJlYWRkaXJwKHJvb3QsIG9wdGlvbnMpJyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiByb290ICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZWFkZGlycDogcm9vdCBhcmd1bWVudCBtdXN0IGJlIGEgc3RyaW5nLiBVc2FnZTogcmVhZGRpcnAocm9vdCwgb3B0aW9ucyknKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSAmJiAhQUxMX1RZUEVTLmluY2x1ZGVzKHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgcmVhZGRpcnA6IEludmFsaWQgdHlwZSBwYXNzZWQuIFVzZSBvbmUgb2YgJHtBTExfVFlQRVMuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgb3B0aW9ucy5yb290ID0gcm9vdDtcbiAgICByZXR1cm4gbmV3IFJlYWRkaXJwU3RyZWFtKG9wdGlvbnMpO1xufVxuLyoqXG4gKiBQcm9taXNlIHZlcnNpb246IFJlYWRzIGFsbCBmaWxlcyBhbmQgZGlyZWN0b3JpZXMgaW4gZ2l2ZW4gcm9vdCByZWN1cnNpdmVseS5cbiAqIENvbXBhcmVkIHRvIHN0cmVhbWluZyB2ZXJzaW9uLCB3aWxsIGNvbnN1bWUgYSBsb3Qgb2YgUkFNIGUuZy4gd2hlbiAxIG1pbGxpb24gZmlsZXMgYXJlIGxpc3RlZC5cbiAqIEByZXR1cm5zIGFycmF5IG9mIHBhdGhzIGFuZCB0aGVpciBlbnRyeSBpbmZvc1xuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGRpcnBQcm9taXNlKHJvb3QsIG9wdGlvbnMgPSB7fSkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGVzID0gW107XG4gICAgICAgIHJlYWRkaXJwKHJvb3QsIG9wdGlvbnMpXG4gICAgICAgICAgICAub24oJ2RhdGEnLCAoZW50cnkpID0+IGZpbGVzLnB1c2goZW50cnkpKVxuICAgICAgICAgICAgLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKGZpbGVzKSlcbiAgICAgICAgICAgIC5vbignZXJyb3InLCAoZXJyb3IpID0+IHJlamVjdChlcnJvcikpO1xuICAgIH0pO1xufVxuZXhwb3J0IGRlZmF1bHQgcmVhZGRpcnA7XG4iLCAiaW1wb3J0IHsgd2F0Y2hGaWxlLCB1bndhdGNoRmlsZSwgd2F0Y2ggYXMgZnNfd2F0Y2ggfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBvcGVuLCBzdGF0LCBsc3RhdCwgcmVhbHBhdGggYXMgZnNyZWFscGF0aCB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCAqIGFzIHN5c1BhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyB0eXBlIGFzIG9zVHlwZSB9IGZyb20gJ29zJztcbmV4cG9ydCBjb25zdCBTVFJfREFUQSA9ICdkYXRhJztcbmV4cG9ydCBjb25zdCBTVFJfRU5EID0gJ2VuZCc7XG5leHBvcnQgY29uc3QgU1RSX0NMT1NFID0gJ2Nsb3NlJztcbmV4cG9ydCBjb25zdCBFTVBUWV9GTiA9ICgpID0+IHsgfTtcbmV4cG9ydCBjb25zdCBJREVOVElUWV9GTiA9ICh2YWwpID0+IHZhbDtcbmNvbnN0IHBsID0gcHJvY2Vzcy5wbGF0Zm9ybTtcbmV4cG9ydCBjb25zdCBpc1dpbmRvd3MgPSBwbCA9PT0gJ3dpbjMyJztcbmV4cG9ydCBjb25zdCBpc01hY29zID0gcGwgPT09ICdkYXJ3aW4nO1xuZXhwb3J0IGNvbnN0IGlzTGludXggPSBwbCA9PT0gJ2xpbnV4JztcbmV4cG9ydCBjb25zdCBpc0ZyZWVCU0QgPSBwbCA9PT0gJ2ZyZWVic2QnO1xuZXhwb3J0IGNvbnN0IGlzSUJNaSA9IG9zVHlwZSgpID09PSAnT1M0MDAnO1xuZXhwb3J0IGNvbnN0IEVWRU5UUyA9IHtcbiAgICBBTEw6ICdhbGwnLFxuICAgIFJFQURZOiAncmVhZHknLFxuICAgIEFERDogJ2FkZCcsXG4gICAgQ0hBTkdFOiAnY2hhbmdlJyxcbiAgICBBRERfRElSOiAnYWRkRGlyJyxcbiAgICBVTkxJTks6ICd1bmxpbmsnLFxuICAgIFVOTElOS19ESVI6ICd1bmxpbmtEaXInLFxuICAgIFJBVzogJ3JhdycsXG4gICAgRVJST1I6ICdlcnJvcicsXG59O1xuY29uc3QgRVYgPSBFVkVOVFM7XG5jb25zdCBUSFJPVFRMRV9NT0RFX1dBVENIID0gJ3dhdGNoJztcbmNvbnN0IHN0YXRNZXRob2RzID0geyBsc3RhdCwgc3RhdCB9O1xuY29uc3QgS0VZX0xJU1RFTkVSUyA9ICdsaXN0ZW5lcnMnO1xuY29uc3QgS0VZX0VSUiA9ICdlcnJIYW5kbGVycyc7XG5jb25zdCBLRVlfUkFXID0gJ3Jhd0VtaXR0ZXJzJztcbmNvbnN0IEhBTkRMRVJfS0VZUyA9IFtLRVlfTElTVEVORVJTLCBLRVlfRVJSLCBLRVlfUkFXXTtcbi8vIHByZXR0aWVyLWlnbm9yZVxuY29uc3QgYmluYXJ5RXh0ZW5zaW9ucyA9IG5ldyBTZXQoW1xuICAgICczZG0nLCAnM2RzJywgJzNnMicsICczZ3AnLCAnN3onLCAnYScsICdhYWMnLCAnYWRwJywgJ2FmZGVzaWduJywgJ2FmcGhvdG8nLCAnYWZwdWInLCAnYWknLFxuICAgICdhaWYnLCAnYWlmZicsICdhbHonLCAnYXBlJywgJ2FwaycsICdhcHBpbWFnZScsICdhcicsICdhcmonLCAnYXNmJywgJ2F1JywgJ2F2aScsXG4gICAgJ2JhaycsICdiYW1sJywgJ2JoJywgJ2JpbicsICdiaycsICdibXAnLCAnYnRpZicsICdiejInLCAnYnppcDInLFxuICAgICdjYWInLCAnY2FmJywgJ2NnbScsICdjbGFzcycsICdjbXgnLCAnY3BpbycsICdjcjInLCAnY3VyJywgJ2RhdCcsICdkY20nLCAnZGViJywgJ2RleCcsICdkanZ1JyxcbiAgICAnZGxsJywgJ2RtZycsICdkbmcnLCAnZG9jJywgJ2RvY20nLCAnZG9jeCcsICdkb3QnLCAnZG90bScsICdkcmEnLCAnRFNfU3RvcmUnLCAnZHNrJywgJ2R0cycsXG4gICAgJ2R0c2hkJywgJ2R2YicsICdkd2cnLCAnZHhmJyxcbiAgICAnZWNlbHA0ODAwJywgJ2VjZWxwNzQ3MCcsICdlY2VscDk2MDAnLCAnZWdnJywgJ2VvbCcsICdlb3QnLCAnZXB1YicsICdleGUnLFxuICAgICdmNHYnLCAnZmJzJywgJ2ZoJywgJ2ZsYScsICdmbGFjJywgJ2ZsYXRwYWsnLCAnZmxpJywgJ2ZsdicsICdmcHgnLCAnZnN0JywgJ2Z2dCcsXG4gICAgJ2czJywgJ2doJywgJ2dpZicsICdncmFmZmxlJywgJ2d6JywgJ2d6aXAnLFxuICAgICdoMjYxJywgJ2gyNjMnLCAnaDI2NCcsICdpY25zJywgJ2ljbycsICdpZWYnLCAnaW1nJywgJ2lwYScsICdpc28nLFxuICAgICdqYXInLCAnanBlZycsICdqcGcnLCAnanBndicsICdqcG0nLCAnanhyJywgJ2tleScsICdrdHgnLFxuICAgICdsaGEnLCAnbGliJywgJ2x2cCcsICdseicsICdsemgnLCAnbHptYScsICdsem8nLFxuICAgICdtM3UnLCAnbTRhJywgJ200dicsICdtYXInLCAnbWRpJywgJ21odCcsICdtaWQnLCAnbWlkaScsICdtajInLCAnbWthJywgJ21rdicsICdtbXInLCAnbW5nJyxcbiAgICAnbW9iaScsICdtb3YnLCAnbW92aWUnLCAnbXAzJyxcbiAgICAnbXA0JywgJ21wNGEnLCAnbXBlZycsICdtcGcnLCAnbXBnYScsICdteHUnLFxuICAgICduZWYnLCAnbnB4JywgJ251bWJlcnMnLCAnbnVwa2cnLFxuICAgICdvJywgJ29kcCcsICdvZHMnLCAnb2R0JywgJ29nYScsICdvZ2cnLCAnb2d2JywgJ290ZicsICdvdHQnLFxuICAgICdwYWdlcycsICdwYm0nLCAncGN4JywgJ3BkYicsICdwZGYnLCAncGVhJywgJ3BnbScsICdwaWMnLCAncG5nJywgJ3BubScsICdwb3QnLCAncG90bScsXG4gICAgJ3BvdHgnLCAncHBhJywgJ3BwYW0nLFxuICAgICdwcG0nLCAncHBzJywgJ3Bwc20nLCAncHBzeCcsICdwcHQnLCAncHB0bScsICdwcHR4JywgJ3BzZCcsICdweWEnLCAncHljJywgJ3B5bycsICdweXYnLFxuICAgICdxdCcsXG4gICAgJ3JhcicsICdyYXMnLCAncmF3JywgJ3Jlc291cmNlcycsICdyZ2InLCAncmlwJywgJ3JsYycsICdybWYnLCAncm12YicsICdycG0nLCAncnRmJywgJ3J6JyxcbiAgICAnczNtJywgJ3M3eicsICdzY3B0JywgJ3NnaScsICdzaGFyJywgJ3NuYXAnLCAnc2lsJywgJ3NrZXRjaCcsICdzbGsnLCAnc212JywgJ3NuaycsICdzbycsXG4gICAgJ3N0bCcsICdzdW8nLCAnc3ViJywgJ3N3ZicsXG4gICAgJ3RhcicsICd0YnonLCAndGJ6MicsICd0Z2EnLCAndGd6JywgJ3RobXgnLCAndGlmJywgJ3RpZmYnLCAndGx6JywgJ3R0YycsICd0dGYnLCAndHh6JyxcbiAgICAndWRmJywgJ3V2aCcsICd1dmknLCAndXZtJywgJ3V2cCcsICd1dnMnLCAndXZ1JyxcbiAgICAndml2JywgJ3ZvYicsXG4gICAgJ3dhcicsICd3YXYnLCAnd2F4JywgJ3dibXAnLCAnd2RwJywgJ3dlYmEnLCAnd2VibScsICd3ZWJwJywgJ3dobCcsICd3aW0nLCAnd20nLCAnd21hJyxcbiAgICAnd212JywgJ3dteCcsICd3b2ZmJywgJ3dvZmYyJywgJ3dybScsICd3dngnLFxuICAgICd4Ym0nLCAneGlmJywgJ3hsYScsICd4bGFtJywgJ3hscycsICd4bHNiJywgJ3hsc20nLCAneGxzeCcsICd4bHQnLCAneGx0bScsICd4bHR4JywgJ3htJyxcbiAgICAneG1pbmQnLCAneHBpJywgJ3hwbScsICd4d2QnLCAneHonLFxuICAgICd6JywgJ3ppcCcsICd6aXB4Jyxcbl0pO1xuY29uc3QgaXNCaW5hcnlQYXRoID0gKGZpbGVQYXRoKSA9PiBiaW5hcnlFeHRlbnNpb25zLmhhcyhzeXNQYXRoLmV4dG5hbWUoZmlsZVBhdGgpLnNsaWNlKDEpLnRvTG93ZXJDYXNlKCkpO1xuLy8gVE9ETzogZW1pdCBlcnJvcnMgcHJvcGVybHkuIEV4YW1wbGU6IEVNRklMRSBvbiBNYWNvcy5cbmNvbnN0IGZvcmVhY2ggPSAodmFsLCBmbikgPT4ge1xuICAgIGlmICh2YWwgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICAgICAgdmFsLmZvckVhY2goZm4pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgZm4odmFsKTtcbiAgICB9XG59O1xuY29uc3QgYWRkQW5kQ29udmVydCA9IChtYWluLCBwcm9wLCBpdGVtKSA9PiB7XG4gICAgbGV0IGNvbnRhaW5lciA9IG1haW5bcHJvcF07XG4gICAgaWYgKCEoY29udGFpbmVyIGluc3RhbmNlb2YgU2V0KSkge1xuICAgICAgICBtYWluW3Byb3BdID0gY29udGFpbmVyID0gbmV3IFNldChbY29udGFpbmVyXSk7XG4gICAgfVxuICAgIGNvbnRhaW5lci5hZGQoaXRlbSk7XG59O1xuY29uc3QgY2xlYXJJdGVtID0gKGNvbnQpID0+IChrZXkpID0+IHtcbiAgICBjb25zdCBzZXQgPSBjb250W2tleV07XG4gICAgaWYgKHNldCBpbnN0YW5jZW9mIFNldCkge1xuICAgICAgICBzZXQuY2xlYXIoKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGRlbGV0ZSBjb250W2tleV07XG4gICAgfVxufTtcbmNvbnN0IGRlbEZyb21TZXQgPSAobWFpbiwgcHJvcCwgaXRlbSkgPT4ge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IG1haW5bcHJvcF07XG4gICAgaWYgKGNvbnRhaW5lciBpbnN0YW5jZW9mIFNldCkge1xuICAgICAgICBjb250YWluZXIuZGVsZXRlKGl0ZW0pO1xuICAgIH1cbiAgICBlbHNlIGlmIChjb250YWluZXIgPT09IGl0ZW0pIHtcbiAgICAgICAgZGVsZXRlIG1haW5bcHJvcF07XG4gICAgfVxufTtcbmNvbnN0IGlzRW1wdHlTZXQgPSAodmFsKSA9PiAodmFsIGluc3RhbmNlb2YgU2V0ID8gdmFsLnNpemUgPT09IDAgOiAhdmFsKTtcbmNvbnN0IEZzV2F0Y2hJbnN0YW5jZXMgPSBuZXcgTWFwKCk7XG4vKipcbiAqIEluc3RhbnRpYXRlcyB0aGUgZnNfd2F0Y2ggaW50ZXJmYWNlXG4gKiBAcGFyYW0gcGF0aCB0byBiZSB3YXRjaGVkXG4gKiBAcGFyYW0gb3B0aW9ucyB0byBiZSBwYXNzZWQgdG8gZnNfd2F0Y2hcbiAqIEBwYXJhbSBsaXN0ZW5lciBtYWluIGV2ZW50IGhhbmRsZXJcbiAqIEBwYXJhbSBlcnJIYW5kbGVyIGVtaXRzIGluZm8gYWJvdXQgZXJyb3JzXG4gKiBAcGFyYW0gZW1pdFJhdyBlbWl0cyByYXcgZXZlbnQgZGF0YVxuICogQHJldHVybnMge05hdGl2ZUZzV2F0Y2hlcn1cbiAqL1xuZnVuY3Rpb24gY3JlYXRlRnNXYXRjaEluc3RhbmNlKHBhdGgsIG9wdGlvbnMsIGxpc3RlbmVyLCBlcnJIYW5kbGVyLCBlbWl0UmF3KSB7XG4gICAgY29uc3QgaGFuZGxlRXZlbnQgPSAocmF3RXZlbnQsIGV2UGF0aCkgPT4ge1xuICAgICAgICBsaXN0ZW5lcihwYXRoKTtcbiAgICAgICAgZW1pdFJhdyhyYXdFdmVudCwgZXZQYXRoLCB7IHdhdGNoZWRQYXRoOiBwYXRoIH0pO1xuICAgICAgICAvLyBlbWl0IGJhc2VkIG9uIGV2ZW50cyBvY2N1cnJpbmcgZm9yIGZpbGVzIGZyb20gYSBkaXJlY3RvcnkncyB3YXRjaGVyIGluXG4gICAgICAgIC8vIGNhc2UgdGhlIGZpbGUncyB3YXRjaGVyIG1pc3NlcyBpdCAoYW5kIHJlbHkgb24gdGhyb3R0bGluZyB0byBkZS1kdXBlKVxuICAgICAgICBpZiAoZXZQYXRoICYmIHBhdGggIT09IGV2UGF0aCkge1xuICAgICAgICAgICAgZnNXYXRjaEJyb2FkY2FzdChzeXNQYXRoLnJlc29sdmUocGF0aCwgZXZQYXRoKSwgS0VZX0xJU1RFTkVSUywgc3lzUGF0aC5qb2luKHBhdGgsIGV2UGF0aCkpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gZnNfd2F0Y2gocGF0aCwge1xuICAgICAgICAgICAgcGVyc2lzdGVudDogb3B0aW9ucy5wZXJzaXN0ZW50LFxuICAgICAgICB9LCBoYW5kbGVFdmVudCk7XG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBlcnJIYW5kbGVyKGVycm9yKTtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG59XG4vKipcbiAqIEhlbHBlciBmb3IgcGFzc2luZyBmc193YXRjaCBldmVudCBkYXRhIHRvIGEgY29sbGVjdGlvbiBvZiBsaXN0ZW5lcnNcbiAqIEBwYXJhbSBmdWxsUGF0aCBhYnNvbHV0ZSBwYXRoIGJvdW5kIHRvIGZzX3dhdGNoIGluc3RhbmNlXG4gKi9cbmNvbnN0IGZzV2F0Y2hCcm9hZGNhc3QgPSAoZnVsbFBhdGgsIGxpc3RlbmVyVHlwZSwgdmFsMSwgdmFsMiwgdmFsMykgPT4ge1xuICAgIGNvbnN0IGNvbnQgPSBGc1dhdGNoSW5zdGFuY2VzLmdldChmdWxsUGF0aCk7XG4gICAgaWYgKCFjb250KVxuICAgICAgICByZXR1cm47XG4gICAgZm9yZWFjaChjb250W2xpc3RlbmVyVHlwZV0sIChsaXN0ZW5lcikgPT4ge1xuICAgICAgICBsaXN0ZW5lcih2YWwxLCB2YWwyLCB2YWwzKTtcbiAgICB9KTtcbn07XG4vKipcbiAqIEluc3RhbnRpYXRlcyB0aGUgZnNfd2F0Y2ggaW50ZXJmYWNlIG9yIGJpbmRzIGxpc3RlbmVyc1xuICogdG8gYW4gZXhpc3Rpbmcgb25lIGNvdmVyaW5nIHRoZSBzYW1lIGZpbGUgc3lzdGVtIGVudHJ5XG4gKiBAcGFyYW0gcGF0aFxuICogQHBhcmFtIGZ1bGxQYXRoIGFic29sdXRlIHBhdGhcbiAqIEBwYXJhbSBvcHRpb25zIHRvIGJlIHBhc3NlZCB0byBmc193YXRjaFxuICogQHBhcmFtIGhhbmRsZXJzIGNvbnRhaW5lciBmb3IgZXZlbnQgbGlzdGVuZXIgZnVuY3Rpb25zXG4gKi9cbmNvbnN0IHNldEZzV2F0Y2hMaXN0ZW5lciA9IChwYXRoLCBmdWxsUGF0aCwgb3B0aW9ucywgaGFuZGxlcnMpID0+IHtcbiAgICBjb25zdCB7IGxpc3RlbmVyLCBlcnJIYW5kbGVyLCByYXdFbWl0dGVyIH0gPSBoYW5kbGVycztcbiAgICBsZXQgY29udCA9IEZzV2F0Y2hJbnN0YW5jZXMuZ2V0KGZ1bGxQYXRoKTtcbiAgICBsZXQgd2F0Y2hlcjtcbiAgICBpZiAoIW9wdGlvbnMucGVyc2lzdGVudCkge1xuICAgICAgICB3YXRjaGVyID0gY3JlYXRlRnNXYXRjaEluc3RhbmNlKHBhdGgsIG9wdGlvbnMsIGxpc3RlbmVyLCBlcnJIYW5kbGVyLCByYXdFbWl0dGVyKTtcbiAgICAgICAgaWYgKCF3YXRjaGVyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICByZXR1cm4gd2F0Y2hlci5jbG9zZS5iaW5kKHdhdGNoZXIpO1xuICAgIH1cbiAgICBpZiAoY29udCkge1xuICAgICAgICBhZGRBbmRDb252ZXJ0KGNvbnQsIEtFWV9MSVNURU5FUlMsIGxpc3RlbmVyKTtcbiAgICAgICAgYWRkQW5kQ29udmVydChjb250LCBLRVlfRVJSLCBlcnJIYW5kbGVyKTtcbiAgICAgICAgYWRkQW5kQ29udmVydChjb250LCBLRVlfUkFXLCByYXdFbWl0dGVyKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHdhdGNoZXIgPSBjcmVhdGVGc1dhdGNoSW5zdGFuY2UocGF0aCwgb3B0aW9ucywgZnNXYXRjaEJyb2FkY2FzdC5iaW5kKG51bGwsIGZ1bGxQYXRoLCBLRVlfTElTVEVORVJTKSwgZXJySGFuZGxlciwgLy8gbm8gbmVlZCB0byB1c2UgYnJvYWRjYXN0IGhlcmVcbiAgICAgICAgZnNXYXRjaEJyb2FkY2FzdC5iaW5kKG51bGwsIGZ1bGxQYXRoLCBLRVlfUkFXKSk7XG4gICAgICAgIGlmICghd2F0Y2hlcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgd2F0Y2hlci5vbihFVi5FUlJPUiwgYXN5bmMgKGVycm9yKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBicm9hZGNhc3RFcnIgPSBmc1dhdGNoQnJvYWRjYXN0LmJpbmQobnVsbCwgZnVsbFBhdGgsIEtFWV9FUlIpO1xuICAgICAgICAgICAgaWYgKGNvbnQpXG4gICAgICAgICAgICAgICAgY29udC53YXRjaGVyVW51c2FibGUgPSB0cnVlOyAvLyBkb2N1bWVudGVkIHNpbmNlIE5vZGUgMTAuNC4xXG4gICAgICAgICAgICAvLyBXb3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzQzMzdcbiAgICAgICAgICAgIGlmIChpc1dpbmRvd3MgJiYgZXJyb3IuY29kZSA9PT0gJ0VQRVJNJykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZkID0gYXdhaXQgb3BlbihwYXRoLCAncicpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBmZC5jbG9zZSgpO1xuICAgICAgICAgICAgICAgICAgICBicm9hZGNhc3RFcnIoZXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGRvIG5vdGhpbmdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBicm9hZGNhc3RFcnIoZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29udCA9IHtcbiAgICAgICAgICAgIGxpc3RlbmVyczogbGlzdGVuZXIsXG4gICAgICAgICAgICBlcnJIYW5kbGVyczogZXJySGFuZGxlcixcbiAgICAgICAgICAgIHJhd0VtaXR0ZXJzOiByYXdFbWl0dGVyLFxuICAgICAgICAgICAgd2F0Y2hlcixcbiAgICAgICAgfTtcbiAgICAgICAgRnNXYXRjaEluc3RhbmNlcy5zZXQoZnVsbFBhdGgsIGNvbnQpO1xuICAgIH1cbiAgICAvLyBjb25zdCBpbmRleCA9IGNvbnQubGlzdGVuZXJzLmluZGV4T2YobGlzdGVuZXIpO1xuICAgIC8vIHJlbW92ZXMgdGhpcyBpbnN0YW5jZSdzIGxpc3RlbmVycyBhbmQgY2xvc2VzIHRoZSB1bmRlcmx5aW5nIGZzX3dhdGNoXG4gICAgLy8gaW5zdGFuY2UgaWYgdGhlcmUgYXJlIG5vIG1vcmUgbGlzdGVuZXJzIGxlZnRcbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICBkZWxGcm9tU2V0KGNvbnQsIEtFWV9MSVNURU5FUlMsIGxpc3RlbmVyKTtcbiAgICAgICAgZGVsRnJvbVNldChjb250LCBLRVlfRVJSLCBlcnJIYW5kbGVyKTtcbiAgICAgICAgZGVsRnJvbVNldChjb250LCBLRVlfUkFXLCByYXdFbWl0dGVyKTtcbiAgICAgICAgaWYgKGlzRW1wdHlTZXQoY29udC5saXN0ZW5lcnMpKSB7XG4gICAgICAgICAgICAvLyBDaGVjayB0byBwcm90ZWN0IGFnYWluc3QgaXNzdWUgZ2gtNzMwLlxuICAgICAgICAgICAgLy8gaWYgKGNvbnQud2F0Y2hlclVudXNhYmxlKSB7XG4gICAgICAgICAgICBjb250LndhdGNoZXIuY2xvc2UoKTtcbiAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgIEZzV2F0Y2hJbnN0YW5jZXMuZGVsZXRlKGZ1bGxQYXRoKTtcbiAgICAgICAgICAgIEhBTkRMRVJfS0VZUy5mb3JFYWNoKGNsZWFySXRlbShjb250KSk7XG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgICBjb250LndhdGNoZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBPYmplY3QuZnJlZXplKGNvbnQpO1xuICAgICAgICB9XG4gICAgfTtcbn07XG4vLyBmc193YXRjaEZpbGUgaGVscGVyc1xuLy8gb2JqZWN0IHRvIGhvbGQgcGVyLXByb2Nlc3MgZnNfd2F0Y2hGaWxlIGluc3RhbmNlc1xuLy8gKG1heSBiZSBzaGFyZWQgYWNyb3NzIGNob2tpZGFyIEZTV2F0Y2hlciBpbnN0YW5jZXMpXG5jb25zdCBGc1dhdGNoRmlsZUluc3RhbmNlcyA9IG5ldyBNYXAoKTtcbi8qKlxuICogSW5zdGFudGlhdGVzIHRoZSBmc193YXRjaEZpbGUgaW50ZXJmYWNlIG9yIGJpbmRzIGxpc3RlbmVyc1xuICogdG8gYW4gZXhpc3Rpbmcgb25lIGNvdmVyaW5nIHRoZSBzYW1lIGZpbGUgc3lzdGVtIGVudHJ5XG4gKiBAcGFyYW0gcGF0aCB0byBiZSB3YXRjaGVkXG4gKiBAcGFyYW0gZnVsbFBhdGggYWJzb2x1dGUgcGF0aFxuICogQHBhcmFtIG9wdGlvbnMgb3B0aW9ucyB0byBiZSBwYXNzZWQgdG8gZnNfd2F0Y2hGaWxlXG4gKiBAcGFyYW0gaGFuZGxlcnMgY29udGFpbmVyIGZvciBldmVudCBsaXN0ZW5lciBmdW5jdGlvbnNcbiAqIEByZXR1cm5zIGNsb3NlclxuICovXG5jb25zdCBzZXRGc1dhdGNoRmlsZUxpc3RlbmVyID0gKHBhdGgsIGZ1bGxQYXRoLCBvcHRpb25zLCBoYW5kbGVycykgPT4ge1xuICAgIGNvbnN0IHsgbGlzdGVuZXIsIHJhd0VtaXR0ZXIgfSA9IGhhbmRsZXJzO1xuICAgIGxldCBjb250ID0gRnNXYXRjaEZpbGVJbnN0YW5jZXMuZ2V0KGZ1bGxQYXRoKTtcbiAgICAvLyBsZXQgbGlzdGVuZXJzID0gbmV3IFNldCgpO1xuICAgIC8vIGxldCByYXdFbWl0dGVycyA9IG5ldyBTZXQoKTtcbiAgICBjb25zdCBjb3B0cyA9IGNvbnQgJiYgY29udC5vcHRpb25zO1xuICAgIGlmIChjb3B0cyAmJiAoY29wdHMucGVyc2lzdGVudCA8IG9wdGlvbnMucGVyc2lzdGVudCB8fCBjb3B0cy5pbnRlcnZhbCA+IG9wdGlvbnMuaW50ZXJ2YWwpKSB7XG4gICAgICAgIC8vIFwiVXBncmFkZVwiIHRoZSB3YXRjaGVyIHRvIHBlcnNpc3RlbmNlIG9yIGEgcXVpY2tlciBpbnRlcnZhbC5cbiAgICAgICAgLy8gVGhpcyBjcmVhdGVzIHNvbWUgdW5saWtlbHkgZWRnZSBjYXNlIGlzc3VlcyBpZiB0aGUgdXNlciBtaXhlc1xuICAgICAgICAvLyBzZXR0aW5ncyBpbiBhIHZlcnkgd2VpcmQgd2F5LCBidXQgc29sdmluZyBmb3IgdGhvc2UgY2FzZXNcbiAgICAgICAgLy8gZG9lc24ndCBzZWVtIHdvcnRod2hpbGUgZm9yIHRoZSBhZGRlZCBjb21wbGV4aXR5LlxuICAgICAgICAvLyBsaXN0ZW5lcnMgPSBjb250Lmxpc3RlbmVycztcbiAgICAgICAgLy8gcmF3RW1pdHRlcnMgPSBjb250LnJhd0VtaXR0ZXJzO1xuICAgICAgICB1bndhdGNoRmlsZShmdWxsUGF0aCk7XG4gICAgICAgIGNvbnQgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGlmIChjb250KSB7XG4gICAgICAgIGFkZEFuZENvbnZlcnQoY29udCwgS0VZX0xJU1RFTkVSUywgbGlzdGVuZXIpO1xuICAgICAgICBhZGRBbmRDb252ZXJ0KGNvbnQsIEtFWV9SQVcsIHJhd0VtaXR0ZXIpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgLy8gVE9ET1xuICAgICAgICAvLyBsaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKTtcbiAgICAgICAgLy8gcmF3RW1pdHRlcnMuYWRkKHJhd0VtaXR0ZXIpO1xuICAgICAgICBjb250ID0ge1xuICAgICAgICAgICAgbGlzdGVuZXJzOiBsaXN0ZW5lcixcbiAgICAgICAgICAgIHJhd0VtaXR0ZXJzOiByYXdFbWl0dGVyLFxuICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICAgIHdhdGNoZXI6IHdhdGNoRmlsZShmdWxsUGF0aCwgb3B0aW9ucywgKGN1cnIsIHByZXYpID0+IHtcbiAgICAgICAgICAgICAgICBmb3JlYWNoKGNvbnQucmF3RW1pdHRlcnMsIChyYXdFbWl0dGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHJhd0VtaXR0ZXIoRVYuQ0hBTkdFLCBmdWxsUGF0aCwgeyBjdXJyLCBwcmV2IH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJtdGltZSA9IGN1cnIubXRpbWVNcztcbiAgICAgICAgICAgICAgICBpZiAoY3Vyci5zaXplICE9PSBwcmV2LnNpemUgfHwgY3Vycm10aW1lID4gcHJldi5tdGltZU1zIHx8IGN1cnJtdGltZSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBmb3JlYWNoKGNvbnQubGlzdGVuZXJzLCAobGlzdGVuZXIpID0+IGxpc3RlbmVyKHBhdGgsIGN1cnIpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSxcbiAgICAgICAgfTtcbiAgICAgICAgRnNXYXRjaEZpbGVJbnN0YW5jZXMuc2V0KGZ1bGxQYXRoLCBjb250KTtcbiAgICB9XG4gICAgLy8gY29uc3QgaW5kZXggPSBjb250Lmxpc3RlbmVycy5pbmRleE9mKGxpc3RlbmVyKTtcbiAgICAvLyBSZW1vdmVzIHRoaXMgaW5zdGFuY2UncyBsaXN0ZW5lcnMgYW5kIGNsb3NlcyB0aGUgdW5kZXJseWluZyBmc193YXRjaEZpbGVcbiAgICAvLyBpbnN0YW5jZSBpZiB0aGVyZSBhcmUgbm8gbW9yZSBsaXN0ZW5lcnMgbGVmdC5cbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICBkZWxGcm9tU2V0KGNvbnQsIEtFWV9MSVNURU5FUlMsIGxpc3RlbmVyKTtcbiAgICAgICAgZGVsRnJvbVNldChjb250LCBLRVlfUkFXLCByYXdFbWl0dGVyKTtcbiAgICAgICAgaWYgKGlzRW1wdHlTZXQoY29udC5saXN0ZW5lcnMpKSB7XG4gICAgICAgICAgICBGc1dhdGNoRmlsZUluc3RhbmNlcy5kZWxldGUoZnVsbFBhdGgpO1xuICAgICAgICAgICAgdW53YXRjaEZpbGUoZnVsbFBhdGgpO1xuICAgICAgICAgICAgY29udC5vcHRpb25zID0gY29udC53YXRjaGVyID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgT2JqZWN0LmZyZWV6ZShjb250KTtcbiAgICAgICAgfVxuICAgIH07XG59O1xuLyoqXG4gKiBAbWl4aW5cbiAqL1xuZXhwb3J0IGNsYXNzIE5vZGVGc0hhbmRsZXIge1xuICAgIGNvbnN0cnVjdG9yKGZzVykge1xuICAgICAgICB0aGlzLmZzdyA9IGZzVztcbiAgICAgICAgdGhpcy5fYm91bmRIYW5kbGVFcnJvciA9IChlcnJvcikgPT4gZnNXLl9oYW5kbGVFcnJvcihlcnJvcik7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdhdGNoIGZpbGUgZm9yIGNoYW5nZXMgd2l0aCBmc193YXRjaEZpbGUgb3IgZnNfd2F0Y2guXG4gICAgICogQHBhcmFtIHBhdGggdG8gZmlsZSBvciBkaXJcbiAgICAgKiBAcGFyYW0gbGlzdGVuZXIgb24gZnMgY2hhbmdlXG4gICAgICogQHJldHVybnMgY2xvc2VyIGZvciB0aGUgd2F0Y2hlciBpbnN0YW5jZVxuICAgICAqL1xuICAgIF93YXRjaFdpdGhOb2RlRnMocGF0aCwgbGlzdGVuZXIpIHtcbiAgICAgICAgY29uc3Qgb3B0cyA9IHRoaXMuZnN3Lm9wdGlvbnM7XG4gICAgICAgIGNvbnN0IGRpcmVjdG9yeSA9IHN5c1BhdGguZGlybmFtZShwYXRoKTtcbiAgICAgICAgY29uc3QgYmFzZW5hbWUgPSBzeXNQYXRoLmJhc2VuYW1lKHBhdGgpO1xuICAgICAgICBjb25zdCBwYXJlbnQgPSB0aGlzLmZzdy5fZ2V0V2F0Y2hlZERpcihkaXJlY3RvcnkpO1xuICAgICAgICBwYXJlbnQuYWRkKGJhc2VuYW1lKTtcbiAgICAgICAgY29uc3QgYWJzb2x1dGVQYXRoID0gc3lzUGF0aC5yZXNvbHZlKHBhdGgpO1xuICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgcGVyc2lzdGVudDogb3B0cy5wZXJzaXN0ZW50LFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIWxpc3RlbmVyKVxuICAgICAgICAgICAgbGlzdGVuZXIgPSBFTVBUWV9GTjtcbiAgICAgICAgbGV0IGNsb3NlcjtcbiAgICAgICAgaWYgKG9wdHMudXNlUG9sbGluZykge1xuICAgICAgICAgICAgY29uc3QgZW5hYmxlQmluID0gb3B0cy5pbnRlcnZhbCAhPT0gb3B0cy5iaW5hcnlJbnRlcnZhbDtcbiAgICAgICAgICAgIG9wdGlvbnMuaW50ZXJ2YWwgPSBlbmFibGVCaW4gJiYgaXNCaW5hcnlQYXRoKGJhc2VuYW1lKSA/IG9wdHMuYmluYXJ5SW50ZXJ2YWwgOiBvcHRzLmludGVydmFsO1xuICAgICAgICAgICAgY2xvc2VyID0gc2V0RnNXYXRjaEZpbGVMaXN0ZW5lcihwYXRoLCBhYnNvbHV0ZVBhdGgsIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcixcbiAgICAgICAgICAgICAgICByYXdFbWl0dGVyOiB0aGlzLmZzdy5fZW1pdFJhdyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY2xvc2VyID0gc2V0RnNXYXRjaExpc3RlbmVyKHBhdGgsIGFic29sdXRlUGF0aCwgb3B0aW9ucywge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyLFxuICAgICAgICAgICAgICAgIGVyckhhbmRsZXI6IHRoaXMuX2JvdW5kSGFuZGxlRXJyb3IsXG4gICAgICAgICAgICAgICAgcmF3RW1pdHRlcjogdGhpcy5mc3cuX2VtaXRSYXcsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2xvc2VyO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXYXRjaCBhIGZpbGUgYW5kIGVtaXQgYWRkIGV2ZW50IGlmIHdhcnJhbnRlZC5cbiAgICAgKiBAcmV0dXJucyBjbG9zZXIgZm9yIHRoZSB3YXRjaGVyIGluc3RhbmNlXG4gICAgICovXG4gICAgX2hhbmRsZUZpbGUoZmlsZSwgc3RhdHMsIGluaXRpYWxBZGQpIHtcbiAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRpcm5hbWUgPSBzeXNQYXRoLmRpcm5hbWUoZmlsZSk7XG4gICAgICAgIGNvbnN0IGJhc2VuYW1lID0gc3lzUGF0aC5iYXNlbmFtZShmaWxlKTtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gdGhpcy5mc3cuX2dldFdhdGNoZWREaXIoZGlybmFtZSk7XG4gICAgICAgIC8vIHN0YXRzIGlzIGFsd2F5cyBwcmVzZW50XG4gICAgICAgIGxldCBwcmV2U3RhdHMgPSBzdGF0cztcbiAgICAgICAgLy8gaWYgdGhlIGZpbGUgaXMgYWxyZWFkeSBiZWluZyB3YXRjaGVkLCBkbyBub3RoaW5nXG4gICAgICAgIGlmIChwYXJlbnQuaGFzKGJhc2VuYW1lKSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY29uc3QgbGlzdGVuZXIgPSBhc3luYyAocGF0aCwgbmV3U3RhdHMpID0+IHtcbiAgICAgICAgICAgIGlmICghdGhpcy5mc3cuX3Rocm90dGxlKFRIUk9UVExFX01PREVfV0FUQ0gsIGZpbGUsIDUpKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmICghbmV3U3RhdHMgfHwgbmV3U3RhdHMubXRpbWVNcyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld1N0YXRzID0gYXdhaXQgc3RhdChmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgdGhhdCBjaGFuZ2UgZXZlbnQgd2FzIG5vdCBmaXJlZCBiZWNhdXNlIG9mIGNoYW5nZWQgb25seSBhY2Nlc3NUaW1lLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhdCA9IG5ld1N0YXRzLmF0aW1lTXM7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG10ID0gbmV3U3RhdHMubXRpbWVNcztcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFhdCB8fCBhdCA8PSBtdCB8fCBtdCAhPT0gcHJldlN0YXRzLm10aW1lTXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0KEVWLkNIQU5HRSwgZmlsZSwgbmV3U3RhdHMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmICgoaXNNYWNvcyB8fCBpc0xpbnV4IHx8IGlzRnJlZUJTRCkgJiYgcHJldlN0YXRzLmlubyAhPT0gbmV3U3RhdHMuaW5vKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fY2xvc2VGaWxlKHBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldlN0YXRzID0gbmV3U3RhdHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbG9zZXIgPSB0aGlzLl93YXRjaFdpdGhOb2RlRnMoZmlsZSwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNsb3NlcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fYWRkUGF0aENsb3NlcihwYXRoLCBjbG9zZXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJldlN0YXRzID0gbmV3U3RhdHM7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZpeCBpc3N1ZXMgd2hlcmUgbXRpbWUgaXMgbnVsbCBidXQgZmlsZSBpcyBzdGlsbCBwcmVzZW50XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9yZW1vdmUoZGlybmFtZSwgYmFzZW5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBhZGQgaXMgYWJvdXQgdG8gYmUgZW1pdHRlZCBpZiBmaWxlIG5vdCBhbHJlYWR5IHRyYWNrZWQgaW4gcGFyZW50XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChwYXJlbnQuaGFzKGJhc2VuYW1lKSkge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIHRoYXQgY2hhbmdlIGV2ZW50IHdhcyBub3QgZmlyZWQgYmVjYXVzZSBvZiBjaGFuZ2VkIG9ubHkgYWNjZXNzVGltZS5cbiAgICAgICAgICAgICAgICBjb25zdCBhdCA9IG5ld1N0YXRzLmF0aW1lTXM7XG4gICAgICAgICAgICAgICAgY29uc3QgbXQgPSBuZXdTdGF0cy5tdGltZU1zO1xuICAgICAgICAgICAgICAgIGlmICghYXQgfHwgYXQgPD0gbXQgfHwgbXQgIT09IHByZXZTdGF0cy5tdGltZU1zKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0KEVWLkNIQU5HRSwgZmlsZSwgbmV3U3RhdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwcmV2U3RhdHMgPSBuZXdTdGF0cztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8ga2ljayBvZmYgdGhlIHdhdGNoZXJcbiAgICAgICAgY29uc3QgY2xvc2VyID0gdGhpcy5fd2F0Y2hXaXRoTm9kZUZzKGZpbGUsIGxpc3RlbmVyKTtcbiAgICAgICAgLy8gZW1pdCBhbiBhZGQgZXZlbnQgaWYgd2UncmUgc3VwcG9zZWQgdG9cbiAgICAgICAgaWYgKCEoaW5pdGlhbEFkZCAmJiB0aGlzLmZzdy5vcHRpb25zLmlnbm9yZUluaXRpYWwpICYmIHRoaXMuZnN3Ll9pc250SWdub3JlZChmaWxlKSkge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmZzdy5fdGhyb3R0bGUoRVYuQURELCBmaWxlLCAwKSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLmZzdy5fZW1pdChFVi5BREQsIGZpbGUsIHN0YXRzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2xvc2VyO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBIYW5kbGUgc3ltbGlua3MgZW5jb3VudGVyZWQgd2hpbGUgcmVhZGluZyBhIGRpci5cbiAgICAgKiBAcGFyYW0gZW50cnkgcmV0dXJuZWQgYnkgcmVhZGRpcnBcbiAgICAgKiBAcGFyYW0gZGlyZWN0b3J5IHBhdGggb2YgZGlyIGJlaW5nIHJlYWRcbiAgICAgKiBAcGFyYW0gcGF0aCBvZiB0aGlzIGl0ZW1cbiAgICAgKiBAcGFyYW0gaXRlbSBiYXNlbmFtZSBvZiB0aGlzIGl0ZW1cbiAgICAgKiBAcmV0dXJucyB0cnVlIGlmIG5vIG1vcmUgcHJvY2Vzc2luZyBpcyBuZWVkZWQgZm9yIHRoaXMgZW50cnkuXG4gICAgICovXG4gICAgYXN5bmMgX2hhbmRsZVN5bWxpbmsoZW50cnksIGRpcmVjdG9yeSwgcGF0aCwgaXRlbSkge1xuICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZnVsbCA9IGVudHJ5LmZ1bGxQYXRoO1xuICAgICAgICBjb25zdCBkaXIgPSB0aGlzLmZzdy5fZ2V0V2F0Y2hlZERpcihkaXJlY3RvcnkpO1xuICAgICAgICBpZiAoIXRoaXMuZnN3Lm9wdGlvbnMuZm9sbG93U3ltbGlua3MpIHtcbiAgICAgICAgICAgIC8vIHdhdGNoIHN5bWxpbmsgZGlyZWN0bHkgKGRvbid0IGZvbGxvdykgYW5kIGRldGVjdCBjaGFuZ2VzXG4gICAgICAgICAgICB0aGlzLmZzdy5faW5jclJlYWR5Q291bnQoKTtcbiAgICAgICAgICAgIGxldCBsaW5rUGF0aDtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgbGlua1BhdGggPSBhd2FpdCBmc3JlYWxwYXRoKHBhdGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZzdy5fZW1pdFJlYWR5KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmIChkaXIuaGFzKGl0ZW0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuZ2V0KGZ1bGwpICE9PSBsaW5rUGF0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fc3ltbGlua1BhdGhzLnNldChmdWxsLCBsaW5rUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0KEVWLkNIQU5HRSwgcGF0aCwgZW50cnkuc3RhdHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGRpci5hZGQoaXRlbSk7XG4gICAgICAgICAgICAgICAgdGhpcy5mc3cuX3N5bWxpbmtQYXRocy5zZXQoZnVsbCwgbGlua1BhdGgpO1xuICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0KEVWLkFERCwgcGF0aCwgZW50cnkuc3RhdHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXRSZWFkeSgpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZG9uJ3QgZm9sbG93IHRoZSBzYW1lIHN5bWxpbmsgbW9yZSB0aGFuIG9uY2VcbiAgICAgICAgaWYgKHRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuaGFzKGZ1bGwpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmZzdy5fc3ltbGlua1BhdGhzLnNldChmdWxsLCB0cnVlKTtcbiAgICB9XG4gICAgX2hhbmRsZVJlYWQoZGlyZWN0b3J5LCBpbml0aWFsQWRkLCB3aCwgdGFyZ2V0LCBkaXIsIGRlcHRoLCB0aHJvdHRsZXIpIHtcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBkaXJlY3RvcnkgbmFtZSBvbiBXaW5kb3dzXG4gICAgICAgIGRpcmVjdG9yeSA9IHN5c1BhdGguam9pbihkaXJlY3RvcnksICcnKTtcbiAgICAgICAgdGhyb3R0bGVyID0gdGhpcy5mc3cuX3Rocm90dGxlKCdyZWFkZGlyJywgZGlyZWN0b3J5LCAxMDAwKTtcbiAgICAgICAgaWYgKCF0aHJvdHRsZXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gdGhpcy5mc3cuX2dldFdhdGNoZWREaXIod2gucGF0aCk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnQgPSBuZXcgU2V0KCk7XG4gICAgICAgIGxldCBzdHJlYW0gPSB0aGlzLmZzdy5fcmVhZGRpcnAoZGlyZWN0b3J5LCB7XG4gICAgICAgICAgICBmaWxlRmlsdGVyOiAoZW50cnkpID0+IHdoLmZpbHRlclBhdGgoZW50cnkpLFxuICAgICAgICAgICAgZGlyZWN0b3J5RmlsdGVyOiAoZW50cnkpID0+IHdoLmZpbHRlckRpcihlbnRyeSksXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIXN0cmVhbSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgc3RyZWFtXG4gICAgICAgICAgICAub24oU1RSX0RBVEEsIGFzeW5jIChlbnRyeSkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZCkge1xuICAgICAgICAgICAgICAgIHN0cmVhbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpdGVtID0gZW50cnkucGF0aDtcbiAgICAgICAgICAgIGxldCBwYXRoID0gc3lzUGF0aC5qb2luKGRpcmVjdG9yeSwgaXRlbSk7XG4gICAgICAgICAgICBjdXJyZW50LmFkZChpdGVtKTtcbiAgICAgICAgICAgIGlmIChlbnRyeS5zdGF0cy5pc1N5bWJvbGljTGluaygpICYmXG4gICAgICAgICAgICAgICAgKGF3YWl0IHRoaXMuX2hhbmRsZVN5bWxpbmsoZW50cnksIGRpcmVjdG9yeSwgcGF0aCwgaXRlbSkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZCkge1xuICAgICAgICAgICAgICAgIHN0cmVhbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBGaWxlcyB0aGF0IHByZXNlbnQgaW4gY3VycmVudCBkaXJlY3Rvcnkgc25hcHNob3RcbiAgICAgICAgICAgIC8vIGJ1dCBhYnNlbnQgaW4gcHJldmlvdXMgYXJlIGFkZGVkIHRvIHdhdGNoIGxpc3QgYW5kXG4gICAgICAgICAgICAvLyBlbWl0IGBhZGRgIGV2ZW50LlxuICAgICAgICAgICAgaWYgKGl0ZW0gPT09IHRhcmdldCB8fCAoIXRhcmdldCAmJiAhcHJldmlvdXMuaGFzKGl0ZW0pKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9pbmNyUmVhZHlDb3VudCgpO1xuICAgICAgICAgICAgICAgIC8vIGVuc3VyZSByZWxhdGl2ZW5lc3Mgb2YgcGF0aCBpcyBwcmVzZXJ2ZWQgaW4gY2FzZSBvZiB3YXRjaGVyIHJldXNlXG4gICAgICAgICAgICAgICAgcGF0aCA9IHN5c1BhdGguam9pbihkaXIsIHN5c1BhdGgucmVsYXRpdmUoZGlyLCBwYXRoKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRkVG9Ob2RlRnMocGF0aCwgaW5pdGlhbEFkZCwgd2gsIGRlcHRoICsgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgICAgICAub24oRVYuRVJST1IsIHRoaXMuX2JvdW5kSGFuZGxlRXJyb3IpO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFzdHJlYW0pXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdCgpO1xuICAgICAgICAgICAgc3RyZWFtLm9uY2UoU1RSX0VORCwgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RyZWFtID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHdhc1Rocm90dGxlZCA9IHRocm90dGxlciA/IHRocm90dGxlci5jbGVhcigpIDogZmFsc2U7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh1bmRlZmluZWQpO1xuICAgICAgICAgICAgICAgIC8vIEZpbGVzIHRoYXQgYWJzZW50IGluIGN1cnJlbnQgZGlyZWN0b3J5IHNuYXBzaG90XG4gICAgICAgICAgICAgICAgLy8gYnV0IHByZXNlbnQgaW4gcHJldmlvdXMgZW1pdCBgcmVtb3ZlYCBldmVudFxuICAgICAgICAgICAgICAgIC8vIGFuZCBhcmUgcmVtb3ZlZCBmcm9tIEB3YXRjaGVkW2RpcmVjdG9yeV0uXG4gICAgICAgICAgICAgICAgcHJldmlvdXNcbiAgICAgICAgICAgICAgICAgICAgLmdldENoaWxkcmVuKClcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcigoaXRlbSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaXRlbSAhPT0gZGlyZWN0b3J5ICYmICFjdXJyZW50LmhhcyhpdGVtKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fcmVtb3ZlKGRpcmVjdG9yeSwgaXRlbSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3RyZWFtID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIC8vIG9uZSBtb3JlIHRpbWUgZm9yIGFueSBtaXNzZWQgaW4gY2FzZSBjaGFuZ2VzIGNhbWUgaW4gZXh0cmVtZWx5IHF1aWNrbHlcbiAgICAgICAgICAgICAgICBpZiAod2FzVGhyb3R0bGVkKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9oYW5kbGVSZWFkKGRpcmVjdG9yeSwgZmFsc2UsIHdoLCB0YXJnZXQsIGRpciwgZGVwdGgsIHRocm90dGxlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgZGlyZWN0b3J5IHRvIGFkZCAvIHJlbW92ZSBmaWxlcyBmcm9tIGBAd2F0Y2hlZGAgbGlzdCBhbmQgcmUtcmVhZCBpdCBvbiBjaGFuZ2UuXG4gICAgICogQHBhcmFtIGRpciBmcyBwYXRoXG4gICAgICogQHBhcmFtIHN0YXRzXG4gICAgICogQHBhcmFtIGluaXRpYWxBZGRcbiAgICAgKiBAcGFyYW0gZGVwdGggcmVsYXRpdmUgdG8gdXNlci1zdXBwbGllZCBwYXRoXG4gICAgICogQHBhcmFtIHRhcmdldCBjaGlsZCBwYXRoIHRhcmdldGVkIGZvciB3YXRjaFxuICAgICAqIEBwYXJhbSB3aCBDb21tb24gd2F0Y2ggaGVscGVycyBmb3IgdGhpcyBwYXRoXG4gICAgICogQHBhcmFtIHJlYWxwYXRoXG4gICAgICogQHJldHVybnMgY2xvc2VyIGZvciB0aGUgd2F0Y2hlciBpbnN0YW5jZS5cbiAgICAgKi9cbiAgICBhc3luYyBfaGFuZGxlRGlyKGRpciwgc3RhdHMsIGluaXRpYWxBZGQsIGRlcHRoLCB0YXJnZXQsIHdoLCByZWFscGF0aCkge1xuICAgICAgICBjb25zdCBwYXJlbnREaXIgPSB0aGlzLmZzdy5fZ2V0V2F0Y2hlZERpcihzeXNQYXRoLmRpcm5hbWUoZGlyKSk7XG4gICAgICAgIGNvbnN0IHRyYWNrZWQgPSBwYXJlbnREaXIuaGFzKHN5c1BhdGguYmFzZW5hbWUoZGlyKSk7XG4gICAgICAgIGlmICghKGluaXRpYWxBZGQgJiYgdGhpcy5mc3cub3B0aW9ucy5pZ25vcmVJbml0aWFsKSAmJiAhdGFyZ2V0ICYmICF0cmFja2VkKSB7XG4gICAgICAgICAgICB0aGlzLmZzdy5fZW1pdChFVi5BRERfRElSLCBkaXIsIHN0YXRzKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBlbnN1cmUgZGlyIGlzIHRyYWNrZWQgKGhhcm1sZXNzIGlmIHJlZHVuZGFudClcbiAgICAgICAgcGFyZW50RGlyLmFkZChzeXNQYXRoLmJhc2VuYW1lKGRpcikpO1xuICAgICAgICB0aGlzLmZzdy5fZ2V0V2F0Y2hlZERpcihkaXIpO1xuICAgICAgICBsZXQgdGhyb3R0bGVyO1xuICAgICAgICBsZXQgY2xvc2VyO1xuICAgICAgICBjb25zdCBvRGVwdGggPSB0aGlzLmZzdy5vcHRpb25zLmRlcHRoO1xuICAgICAgICBpZiAoKG9EZXB0aCA9PSBudWxsIHx8IGRlcHRoIDw9IG9EZXB0aCkgJiYgIXRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuaGFzKHJlYWxwYXRoKSkge1xuICAgICAgICAgICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLl9oYW5kbGVSZWFkKGRpciwgaW5pdGlhbEFkZCwgd2gsIHRhcmdldCwgZGlyLCBkZXB0aCwgdGhyb3R0bGVyKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjbG9zZXIgPSB0aGlzLl93YXRjaFdpdGhOb2RlRnMoZGlyLCAoZGlyUGF0aCwgc3RhdHMpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBpZiBjdXJyZW50IGRpcmVjdG9yeSBpcyByZW1vdmVkLCBkbyBub3RoaW5nXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRzICYmIHN0YXRzLm10aW1lTXMgPT09IDApXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB0aGlzLl9oYW5kbGVSZWFkKGRpclBhdGgsIGZhbHNlLCB3aCwgdGFyZ2V0LCBkaXIsIGRlcHRoLCB0aHJvdHRsZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNsb3NlcjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSGFuZGxlIGFkZGVkIGZpbGUsIGRpcmVjdG9yeSwgb3IgZ2xvYiBwYXR0ZXJuLlxuICAgICAqIERlbGVnYXRlcyBjYWxsIHRvIF9oYW5kbGVGaWxlIC8gX2hhbmRsZURpciBhZnRlciBjaGVja3MuXG4gICAgICogQHBhcmFtIHBhdGggdG8gZmlsZSBvciBpclxuICAgICAqIEBwYXJhbSBpbml0aWFsQWRkIHdhcyB0aGUgZmlsZSBhZGRlZCBhdCB3YXRjaCBpbnN0YW50aWF0aW9uP1xuICAgICAqIEBwYXJhbSBwcmlvcldoIGRlcHRoIHJlbGF0aXZlIHRvIHVzZXItc3VwcGxpZWQgcGF0aFxuICAgICAqIEBwYXJhbSBkZXB0aCBDaGlsZCBwYXRoIGFjdHVhbGx5IHRhcmdldGVkIGZvciB3YXRjaFxuICAgICAqIEBwYXJhbSB0YXJnZXQgQ2hpbGQgcGF0aCBhY3R1YWxseSB0YXJnZXRlZCBmb3Igd2F0Y2hcbiAgICAgKi9cbiAgICBhc3luYyBfYWRkVG9Ob2RlRnMocGF0aCwgaW5pdGlhbEFkZCwgcHJpb3JXaCwgZGVwdGgsIHRhcmdldCkge1xuICAgICAgICBjb25zdCByZWFkeSA9IHRoaXMuZnN3Ll9lbWl0UmVhZHk7XG4gICAgICAgIGlmICh0aGlzLmZzdy5faXNJZ25vcmVkKHBhdGgpIHx8IHRoaXMuZnN3LmNsb3NlZCkge1xuICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB3aCA9IHRoaXMuZnN3Ll9nZXRXYXRjaEhlbHBlcnMocGF0aCk7XG4gICAgICAgIGlmIChwcmlvcldoKSB7XG4gICAgICAgICAgICB3aC5maWx0ZXJQYXRoID0gKGVudHJ5KSA9PiBwcmlvcldoLmZpbHRlclBhdGgoZW50cnkpO1xuICAgICAgICAgICAgd2guZmlsdGVyRGlyID0gKGVudHJ5KSA9PiBwcmlvcldoLmZpbHRlckRpcihlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZXZhbHVhdGUgd2hhdCBpcyBhdCB0aGUgcGF0aCB3ZSdyZSBiZWluZyBhc2tlZCB0byB3YXRjaFxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSBhd2FpdCBzdGF0TWV0aG9kc1t3aC5zdGF0TWV0aG9kXSh3aC53YXRjaFBhdGgpO1xuICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBpZiAodGhpcy5mc3cuX2lzSWdub3JlZCh3aC53YXRjaFBhdGgsIHN0YXRzKSkge1xuICAgICAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZm9sbG93ID0gdGhpcy5mc3cub3B0aW9ucy5mb2xsb3dTeW1saW5rcztcbiAgICAgICAgICAgIGxldCBjbG9zZXI7XG4gICAgICAgICAgICBpZiAoc3RhdHMuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFic1BhdGggPSBzeXNQYXRoLnJlc29sdmUocGF0aCk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0UGF0aCA9IGZvbGxvdyA/IGF3YWl0IGZzcmVhbHBhdGgocGF0aCkgOiBwYXRoO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBjbG9zZXIgPSBhd2FpdCB0aGlzLl9oYW5kbGVEaXIod2gud2F0Y2hQYXRoLCBzdGF0cywgaW5pdGlhbEFkZCwgZGVwdGgsIHRhcmdldCwgd2gsIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAvLyBwcmVzZXJ2ZSB0aGlzIHN5bWxpbmsncyB0YXJnZXQgcGF0aFxuICAgICAgICAgICAgICAgIGlmIChhYnNQYXRoICE9PSB0YXJnZXRQYXRoICYmIHRhcmdldFBhdGggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fc3ltbGlua1BhdGhzLnNldChhYnNQYXRoLCB0YXJnZXRQYXRoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzdGF0cy5pc1N5bWJvbGljTGluaygpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0UGF0aCA9IGZvbGxvdyA/IGF3YWl0IGZzcmVhbHBhdGgocGF0aCkgOiBwYXRoO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBzeXNQYXRoLmRpcm5hbWUod2gud2F0Y2hQYXRoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZzdy5fZ2V0V2F0Y2hlZERpcihwYXJlbnQpLmFkZCh3aC53YXRjaFBhdGgpO1xuICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0KEVWLkFERCwgd2gud2F0Y2hQYXRoLCBzdGF0cyk7XG4gICAgICAgICAgICAgICAgY2xvc2VyID0gYXdhaXQgdGhpcy5faGFuZGxlRGlyKHBhcmVudCwgc3RhdHMsIGluaXRpYWxBZGQsIGRlcHRoLCBwYXRoLCB3aCwgdGFyZ2V0UGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIC8vIHByZXNlcnZlIHRoaXMgc3ltbGluaydzIHRhcmdldCBwYXRoXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFBhdGggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fc3ltbGlua1BhdGhzLnNldChzeXNQYXRoLnJlc29sdmUocGF0aCksIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNsb3NlciA9IHRoaXMuX2hhbmRsZUZpbGUod2gud2F0Y2hQYXRoLCBzdGF0cywgaW5pdGlhbEFkZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgaWYgKGNsb3NlcilcbiAgICAgICAgICAgICAgICB0aGlzLmZzdy5fYWRkUGF0aENsb3NlcihwYXRoLCBjbG9zZXIpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuZnN3Ll9oYW5kbGVFcnJvcihlcnJvcikpIHtcbiAgICAgICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBwYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuIiwgIi8qKlxuICogRGlzY292ZXIgdHdlYWtzIHVuZGVyIDx1c2VyUm9vdD4vdHdlYWtzLiBFYWNoIHR3ZWFrIGlzIGEgZGlyZWN0b3J5IHdpdGggYVxuICogbWFuaWZlc3QuanNvbiBhbmQgYW4gZW50cnkgc2NyaXB0LiBFbnRyeSByZXNvbHV0aW9uIGlzIG1hbmlmZXN0Lm1haW4gZmlyc3QsXG4gKiB0aGVuIGluZGV4LmpzLCBpbmRleC5tanMsIGFuZCBpbmRleC5janMuXG4gKlxuICogVGhlIG1hbmlmZXN0IGdhdGUgaXMgaW50ZW50aW9uYWxseSBzdHJpY3QuIEEgdHdlYWsgbXVzdCBpZGVudGlmeSBpdHMgR2l0SHViXG4gKiByZXBvc2l0b3J5IHNvIHRoZSBtYW5hZ2VyIGNhbiBjaGVjayByZWxlYXNlcyB3aXRob3V0IGdyYW50aW5nIHRoZSB0d2VhayBhblxuICogdXBkYXRlL2luc3RhbGwgY2hhbm5lbC4gVXBkYXRlIGNoZWNrcyBhcmUgYWR2aXNvcnkgb25seS5cbiAqL1xuaW1wb3J0IHsgcmVhZGRpclN5bmMsIHN0YXRTeW5jLCByZWFkRmlsZVN5bmMsIGV4aXN0c1N5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCB0eXBlIHsgVHdlYWtNYW5pZmVzdCB9IGZyb20gXCJAY29kZXgtcGx1c3BsdXMvc2RrXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlzY292ZXJlZFR3ZWFrIHtcbiAgZGlyOiBzdHJpbmc7XG4gIGVudHJ5OiBzdHJpbmc7XG4gIG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xufVxuXG5jb25zdCBFTlRSWV9DQU5ESURBVEVTID0gW1wiaW5kZXguanNcIiwgXCJpbmRleC5janNcIiwgXCJpbmRleC5tanNcIl07XG5cbmV4cG9ydCBmdW5jdGlvbiBkaXNjb3ZlclR3ZWFrcyh0d2Vha3NEaXI6IHN0cmluZyk6IERpc2NvdmVyZWRUd2Vha1tdIHtcbiAgaWYgKCFleGlzdHNTeW5jKHR3ZWFrc0RpcikpIHJldHVybiBbXTtcbiAgY29uc3Qgb3V0OiBEaXNjb3ZlcmVkVHdlYWtbXSA9IFtdO1xuICBmb3IgKGNvbnN0IG5hbWUgb2YgcmVhZGRpclN5bmModHdlYWtzRGlyKSkge1xuICAgIGNvbnN0IGRpciA9IGpvaW4odHdlYWtzRGlyLCBuYW1lKTtcbiAgICBpZiAoIXN0YXRTeW5jKGRpcikuaXNEaXJlY3RvcnkoKSkgY29udGludWU7XG4gICAgY29uc3QgbWFuaWZlc3RQYXRoID0gam9pbihkaXIsIFwibWFuaWZlc3QuanNvblwiKTtcbiAgICBpZiAoIWV4aXN0c1N5bmMobWFuaWZlc3RQYXRoKSkgY29udGludWU7XG4gICAgbGV0IG1hbmlmZXN0OiBUd2Vha01hbmlmZXN0O1xuICAgIHRyeSB7XG4gICAgICBtYW5pZmVzdCA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKG1hbmlmZXN0UGF0aCwgXCJ1dGY4XCIpKSBhcyBUd2Vha01hbmlmZXN0O1xuICAgIH0gY2F0Y2gge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmICghaXNWYWxpZE1hbmlmZXN0KG1hbmlmZXN0KSkgY29udGludWU7XG4gICAgY29uc3QgZW50cnkgPSByZXNvbHZlRW50cnkoZGlyLCBtYW5pZmVzdCk7XG4gICAgaWYgKCFlbnRyeSkgY29udGludWU7XG4gICAgb3V0LnB1c2goeyBkaXIsIGVudHJ5LCBtYW5pZmVzdCB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBpc1ZhbGlkTWFuaWZlc3QobTogVHdlYWtNYW5pZmVzdCk6IGJvb2xlYW4ge1xuICBpZiAoIW0uaWQgfHwgIW0ubmFtZSB8fCAhbS52ZXJzaW9uIHx8ICFtLmdpdGh1YlJlcG8pIHJldHVybiBmYWxzZTtcbiAgaWYgKCEvXlthLXpBLVowLTkuXy1dK1xcL1thLXpBLVowLTkuXy1dKyQvLnRlc3QobS5naXRodWJSZXBvKSkgcmV0dXJuIGZhbHNlO1xuICBpZiAobS5zY29wZSAmJiAhW1wicmVuZGVyZXJcIiwgXCJtYWluXCIsIFwiYm90aFwiXS5pbmNsdWRlcyhtLnNjb3BlKSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUVudHJ5KGRpcjogc3RyaW5nLCBtOiBUd2Vha01hbmlmZXN0KTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmIChtLm1haW4pIHtcbiAgICBjb25zdCBwID0gam9pbihkaXIsIG0ubWFpbik7XG4gICAgcmV0dXJuIGV4aXN0c1N5bmMocCkgPyBwIDogbnVsbDtcbiAgfVxuICBmb3IgKGNvbnN0IGMgb2YgRU5UUllfQ0FORElEQVRFUykge1xuICAgIGNvbnN0IHAgPSBqb2luKGRpciwgYyk7XG4gICAgaWYgKGV4aXN0c1N5bmMocCkpIHJldHVybiBwO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuIiwgIi8qKlxuICogRGlzay1iYWNrZWQga2V5L3ZhbHVlIHN0b3JhZ2UgZm9yIG1haW4tcHJvY2VzcyB0d2Vha3MuXG4gKlxuICogRWFjaCB0d2VhayBnZXRzIG9uZSBKU09OIGZpbGUgdW5kZXIgYDx1c2VyUm9vdD4vc3RvcmFnZS88aWQ+Lmpzb25gLlxuICogV3JpdGVzIGFyZSBkZWJvdW5jZWQgKDUwIG1zKSBhbmQgYXRvbWljICh3cml0ZSB0byA8ZmlsZT4udG1wIHRoZW4gcmVuYW1lKS5cbiAqIFJlYWRzIGFyZSBlYWdlciArIGNhY2hlZCBpbi1tZW1vcnk7IHdlIGxvYWQgb24gZmlyc3QgYWNjZXNzLlxuICovXG5pbXBvcnQge1xuICBleGlzdHNTeW5jLFxuICBta2RpclN5bmMsXG4gIHJlYWRGaWxlU3luYyxcbiAgcmVuYW1lU3luYyxcbiAgd3JpdGVGaWxlU3luYyxcbn0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlza1N0b3JhZ2Uge1xuICBnZXQ8VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IFQpOiBUO1xuICBzZXQoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZDtcbiAgZGVsZXRlKGtleTogc3RyaW5nKTogdm9pZDtcbiAgYWxsKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBmbHVzaCgpOiB2b2lkO1xufVxuXG5jb25zdCBGTFVTSF9ERUxBWV9NUyA9IDUwO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRGlza1N0b3JhZ2Uocm9vdERpcjogc3RyaW5nLCBpZDogc3RyaW5nKTogRGlza1N0b3JhZ2Uge1xuICBjb25zdCBkaXIgPSBqb2luKHJvb3REaXIsIFwic3RvcmFnZVwiKTtcbiAgbWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIGNvbnN0IGZpbGUgPSBqb2luKGRpciwgYCR7c2FuaXRpemUoaWQpfS5qc29uYCk7XG5cbiAgbGV0IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG4gIGlmIChleGlzdHNTeW5jKGZpbGUpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGRhdGEgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhmaWxlLCBcInV0ZjhcIikpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gQ29ycnVwdCBmaWxlIFx1MjAxNCBzdGFydCBmcmVzaCwgYnV0IGRvbid0IGNsb2JiZXIgdGhlIG9yaWdpbmFsIHVudGlsIHdlXG4gICAgICAvLyBzdWNjZXNzZnVsbHkgd3JpdGUgYWdhaW4uIChNb3ZlIGl0IGFzaWRlIGZvciBmb3JlbnNpY3MuKVxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVuYW1lU3luYyhmaWxlLCBgJHtmaWxlfS5jb3JydXB0LSR7RGF0ZS5ub3coKX1gKTtcbiAgICAgIH0gY2F0Y2gge31cbiAgICAgIGRhdGEgPSB7fTtcbiAgICB9XG4gIH1cblxuICBsZXQgZGlydHkgPSBmYWxzZTtcbiAgbGV0IHRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0IHNjaGVkdWxlRmx1c2ggPSAoKSA9PiB7XG4gICAgZGlydHkgPSB0cnVlO1xuICAgIGlmICh0aW1lcikgcmV0dXJuO1xuICAgIHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aW1lciA9IG51bGw7XG4gICAgICBpZiAoZGlydHkpIGZsdXNoKCk7XG4gICAgfSwgRkxVU0hfREVMQVlfTVMpO1xuICB9O1xuXG4gIGNvbnN0IGZsdXNoID0gKCk6IHZvaWQgPT4ge1xuICAgIGlmICghZGlydHkpIHJldHVybjtcbiAgICBjb25zdCB0bXAgPSBgJHtmaWxlfS50bXBgO1xuICAgIHRyeSB7XG4gICAgICB3cml0ZUZpbGVTeW5jKHRtcCwgSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMiksIFwidXRmOFwiKTtcbiAgICAgIHJlbmFtZVN5bmModG1wLCBmaWxlKTtcbiAgICAgIGRpcnR5ID0gZmFsc2U7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gTGVhdmUgZGlydHk9dHJ1ZSBzbyBhIGZ1dHVyZSBmbHVzaCByZXRyaWVzLlxuICAgICAgY29uc29sZS5lcnJvcihcIltjb2RleC1wbHVzcGx1c10gc3RvcmFnZSBmbHVzaCBmYWlsZWQ6XCIsIGlkLCBlKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IDxUPihrOiBzdHJpbmcsIGQ/OiBUKTogVCA9PlxuICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGRhdGEsIGspID8gKGRhdGFba10gYXMgVCkgOiAoZCBhcyBUKSxcbiAgICBzZXQoaywgdikge1xuICAgICAgZGF0YVtrXSA9IHY7XG4gICAgICBzY2hlZHVsZUZsdXNoKCk7XG4gICAgfSxcbiAgICBkZWxldGUoaykge1xuICAgICAgaWYgKGsgaW4gZGF0YSkge1xuICAgICAgICBkZWxldGUgZGF0YVtrXTtcbiAgICAgICAgc2NoZWR1bGVGbHVzaCgpO1xuICAgICAgfVxuICAgIH0sXG4gICAgYWxsOiAoKSA9PiAoeyAuLi5kYXRhIH0pLFxuICAgIGZsdXNoLFxuICB9O1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZShpZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gVHdlYWsgaWRzIGFyZSBhdXRob3ItY29udHJvbGxlZDsgY2xhbXAgdG8gYSBzYWZlIGZpbGVuYW1lLlxuICByZXR1cm4gaWQucmVwbGFjZSgvW15hLXpBLVowLTkuX0AtXS9nLCBcIl9cIik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBU0Esc0JBQW9GO0FBQ3BGLElBQUFBLGtCQUFtRjtBQUNuRixJQUFBQyxvQkFBOEI7OztBQ1Y5QixJQUFBQyxhQUErQjtBQUMvQixJQUFBQyxtQkFBOEI7QUFDOUIsb0JBQTZCO0FBQzdCLElBQUFDLFdB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QSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTTtBQUFBLEVBQUs7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVk7QUFBQSxFQUFXO0FBQUEsRUFBUztBQUFBLEVBQ3JGO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFZO0FBQUEsRUFBTTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTTtBQUFBLEVBQzFFO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFNO0FBQUEsRUFBTztBQUFBLEVBQU07QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUN4RDtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVM7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3ZGO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBWTtBQUFBLEVBQU87QUFBQSxFQUNyRjtBQUFBLEVBQVM7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3ZCO0FBQUEsRUFBYTtBQUFBLEVBQWE7QUFBQSxFQUFhO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQ3BFO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFNO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFXO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQzFFO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFPO0FBQUEsRUFBVztBQUFBLEVBQU07QUFBQSxFQUNwQztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDNUQ7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDbkQ7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFNO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUMxQztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3JGO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFTO0FBQUEsRUFDeEI7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQ3RDO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFXO0FBQUEsRUFDekI7QUFBQSxFQUFLO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3REO0FBQUEsRUFBUztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUMvRTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFDZjtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDakY7QUFBQSxFQUNBO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBYTtBQUFB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O0FBQUEsSUFDQSxRQUFRLENBQUMsR0FBVyxZQUE2QztBQUMvRCw4QkFBUSxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBZ0IsU0FBb0IsUUFBUSxHQUFHLElBQUksQ0FBQztBQUFBLElBQzdFO0FBQUEsRUFDRjtBQUNGO0FBRUEsU0FBUyxXQUFXLElBQVk7QUFDOUIsUUFBTSxVQUFNLHdCQUFLLFVBQVcsY0FBYyxFQUFFO0FBQzVDLGlDQUFVLEtBQUssRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNsQyxRQUFNLEtBQUssUUFBUSxrQkFBa0I7QUFDckMsU0FBTztBQUFBLElBQ0wsU0FBUztBQUFBLElBQ1QsTUFBTSxDQUFDLE1BQWMsR0FBRyxhQUFTLHdCQUFLLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFBQSxJQUNyRCxPQUFPLENBQUMsR0FBVyxNQUFjLEdBQUcsY0FBVSx3QkFBSyxLQUFLLENBQUMsR0FBRyxHQUFHLE1BQU07QUFBQSxJQUNyRSxRQUFRLE9BQU8sTUFBYztBQUMzQixVQUFJO0FBQ0YsY0FBTSxHQUFHLFdBQU8sd0JBQUssS0FBSyxDQUFDLENBQUM7QUFDNUIsZUFBTztBQUFBLE1BQ1QsUUFBUTtBQUNOLGVBQU87QUFBQSxNQUNUO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjsiLAogICJuYW1lcyI6IFsiaW1wb3J0X25vZGVfZnMiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJpbXBvcnRfZnMiLCAiaW1wb3J0X3Byb21pc2VzIiwgInN5c1BhdGgiLCAicHJlc29sdmUiLCAiYmFzZW5hbWUiLCAicGpvaW4iLCAicHJlbGF0aXZlIiwgInBzZXAiLCAiaW1wb3J0X3Byb21pc2VzIiwgIm9zVHlwZSIsICJmc193YXRjaCIsICJyYXdFbWl0dGVyIiwgImxpc3RlbmVyIiwgImJhc2VuYW1lIiwgImRpcm5hbWUiLCAibmV3U3RhdHMiLCAiY2xvc2VyIiwgImZzcmVhbHBhdGgiLCAicmVzb2x2ZSIsICJyZWFscGF0aCIsICJzdGF0cyIsICJyZWxhdGl2ZSIsICJET1VCTEVfU0xBU0hfUkUiLCAidGVzdFN0cmluZyIsICJwYXRoIiwgInN0YXRzIiwgInN0YXRjYiIsICJub3ciLCAic3RhdCIsICJpbXBvcnRfbm9kZV9wYXRoIiwgImltcG9ydF9ub2RlX2ZzIiwgImltcG9ydF9ub2RlX3BhdGgiLCAic3RhdCJdCn0K
