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
var import_node_fs4 = require("node:fs");
var import_node_path5 = require("node:path");

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
    const dirname4 = sysPath.dirname(file);
    const basename3 = sysPath.basename(file);
    const parent = this.fsw._getWatchedDir(dirname4);
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
          this.fsw._remove(dirname4, basename3);
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
    return new Promise((resolve5, reject) => {
      if (!stream)
        return reject();
      stream.once(STR_END, () => {
        if (this.fsw.closed) {
          stream = void 0;
          return;
        }
        const wasThrottled = throttler ? throttler.clear() : false;
        resolve5(void 0);
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
        const relative4 = sysPath2.relative(matcher.path, string);
        if (!relative4) {
          return false;
        }
        return !relative4.startsWith("..") && !sysPath2.isAbsolute(relative4);
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
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");

// src/path-security.ts
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
function isInsidePath(baseDir, candidate) {
  const rel = (0, import_node_path2.relative)(baseDir, candidate);
  return rel === "" || !!rel && !rel.startsWith("..") && !(0, import_node_path2.isAbsolute)(rel);
}
function resolveInside(baseDir, inputPath, opts = {}) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new Error("empty path");
  }
  const base = canonicalExistingPath((0, import_node_path2.resolve)(baseDir));
  const raw = (0, import_node_path2.resolve)(base, inputPath);
  if (!opts.allowBase && raw === base) {
    throw new Error("path must be inside base directory");
  }
  if (!isInsidePath(base, raw)) {
    throw new Error("path outside base directory");
  }
  if ((0, import_node_fs.existsSync)(raw)) {
    const canonical = canonicalExistingPath(raw);
    if (!isInsidePath(base, canonical)) {
      throw new Error("path outside base directory");
    }
    const stat4 = (0, import_node_fs.statSync)(canonical);
    if (opts.requireFile && !stat4.isFile()) throw new Error("path is not a file");
    if (opts.requireDirectory && !stat4.isDirectory()) {
      throw new Error("path is not a directory");
    }
    return canonical;
  }
  if (opts.mustExist) {
    throw new Error("path does not exist");
  }
  const parent = nearestExistingParent(raw);
  const canonicalParent = canonicalExistingPath(parent);
  if (!isInsidePath(base, canonicalParent)) {
    throw new Error("path outside base directory");
  }
  return raw;
}
function canonicalExistingPath(path) {
  return import_node_fs.realpathSync.native(path);
}
function nearestExistingParent(path) {
  let current = path;
  while (!(0, import_node_fs.existsSync)(current)) {
    const next = (0, import_node_path2.dirname)(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

// src/version.ts
var CODEX_PLUSPLUS_VERSION = "0.1.0";
var VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
function normalizeVersion(v) {
  return v.trim().replace(/^v/i, "");
}
function compareVersions(a, b) {
  const av = VERSION_RE.exec(normalizeVersion(a));
  const bv = VERSION_RE.exec(normalizeVersion(b));
  if (!av || !bv) return null;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(av[i]) - Number(bv[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
function minRuntimeError(minRuntime, currentVersion = CODEX_PLUSPLUS_VERSION) {
  if (!minRuntime) return void 0;
  const comparison = compareVersions(currentVersion, minRuntime);
  if (comparison === null) {
    return `Invalid minRuntime "${minRuntime}"`;
  }
  if (comparison < 0) {
    return `Requires Codex++ ${normalizeVersion(minRuntime)} or newer`;
  }
  return void 0;
}

// src/tweak-discovery.ts
var ENTRY_CANDIDATES = ["index.js", "index.cjs", "index.mjs"];
function discoverTweaks(tweaksDir) {
  if (!(0, import_node_fs2.existsSync)(tweaksDir)) return [];
  const out = [];
  for (const name of (0, import_node_fs2.readdirSync)(tweaksDir)) {
    const dir = (0, import_node_path3.join)(tweaksDir, name);
    if (!(0, import_node_fs2.statSync)(dir).isDirectory()) continue;
    const manifestPath = (0, import_node_path3.join)(dir, "manifest.json");
    if (!(0, import_node_fs2.existsSync)(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse((0, import_node_fs2.readFileSync)(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (!isValidManifest(manifest)) continue;
    const entry = resolveEntry(dir, manifest);
    if (!entry) continue;
    const loadError = minRuntimeError(manifest.minRuntime);
    out.push({
      dir,
      entry,
      manifest,
      loadable: !loadError,
      ...loadError ? { loadError } : {},
      capabilities: manifestCapabilities(manifest)
    });
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
    try {
      return resolveInside(dir, m.main, { mustExist: true, requireFile: true });
    } catch {
      return null;
    }
  }
  for (const c of ENTRY_CANDIDATES) {
    try {
      return resolveInside(dir, c, { mustExist: true, requireFile: true });
    } catch {
    }
  }
  return null;
}
function manifestCapabilities(manifest) {
  const scope = manifest.scope ?? "both";
  const caps = ["isolated storage", "scoped IPC"];
  if (scope === "main" || scope === "both") caps.unshift("main process");
  if (scope === "renderer" || scope === "both") caps.unshift("renderer UI");
  if (manifest.main) caps.push("custom entry");
  if (manifest.minRuntime) caps.push("runtime gate");
  return caps;
}

// src/storage.ts
var import_node_fs3 = require("node:fs");
var import_node_path4 = require("node:path");
var FLUSH_DELAY_MS = 50;
function createDiskStorage(rootDir, id) {
  const dir = (0, import_node_path4.join)(rootDir, "storage");
  (0, import_node_fs3.mkdirSync)(dir, { recursive: true });
  const file = (0, import_node_path4.join)(dir, `${sanitize(id)}.json`);
  let data = {};
  if ((0, import_node_fs3.existsSync)(file)) {
    try {
      data = JSON.parse((0, import_node_fs3.readFileSync)(file, "utf8"));
    } catch {
      try {
        (0, import_node_fs3.renameSync)(file, `${file}.corrupt-${Date.now()}`);
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
      (0, import_node_fs3.writeFileSync)(tmp, JSON.stringify(data, null, 2), "utf8");
      (0, import_node_fs3.renameSync)(tmp, file);
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

// src/lifecycle.ts
async function stopLoadedTweaks(loaded, logger = {}) {
  for (const [id, tweak] of loaded) {
    try {
      await tweak.stop?.();
    } catch (e) {
      logger.warn?.(`stop failed for ${id}:`, e);
    }
    for (const dispose of tweak.disposers ?? []) {
      try {
        dispose();
      } catch (e) {
        logger.warn?.(`dispose failed for ${id}:`, e);
      }
    }
    if (tweak.disposers) tweak.disposers.length = 0;
    try {
      tweak.storage?.flush();
    } catch (e) {
      logger.warn?.(`storage flush failed for ${id}:`, e);
    }
    logger.info?.(`stopped tweak: ${id}`);
  }
  loaded.clear();
}

// src/main-ipc.ts
function createMainIpc(tweakId, ipcMain2, disposers, registeredHandles) {
  const ch = (channel) => `codexpp:${tweakId}:${channel}`;
  return {
    on: (channel, handler) => {
      const full = ch(channel);
      const wrapped = (_event, ...args) => handler(...args);
      ipcMain2.on(full, wrapped);
      const dispose = once(() => ipcMain2.removeListener(full, wrapped));
      disposers.push(dispose);
      return dispose;
    },
    send: (_channel) => {
      throw new Error("ipc.send is renderer\u2192main; main side uses handle/on");
    },
    invoke: (_channel) => {
      throw new Error("ipc.invoke is renderer\u2192main; main side uses handle");
    },
    handle: (channel, handler) => {
      const full = ch(channel);
      registeredHandles.get(full)?.();
      const wrapped = (_event, ...args) => handler(...args);
      ipcMain2.handle(full, wrapped);
      const dispose = once(() => {
        if (registeredHandles.get(full) === dispose) {
          registeredHandles.delete(full);
          ipcMain2.removeHandler(full);
        }
      });
      registeredHandles.set(full, dispose);
      disposers.push(dispose);
      return dispose;
    }
  };
}
function once(fn) {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn();
  };
}

// src/health.ts
function createRuntimeHealth(input) {
  return {
    version: input.version,
    paths: {
      userRoot: input.userRoot,
      runtimeDir: input.runtimeDir,
      tweaksDir: input.tweaksDir,
      logDir: input.logDir
    },
    tweaks: {
      discovered: input.discoveredTweaks,
      loadedMain: input.loadedMainTweaks,
      loadedRenderer: input.loadedRendererTweaks ?? null
    },
    startedAt: input.startedAt,
    lastReload: input.lastReload,
    recentErrors: input.recentErrors.slice(-10)
  };
}

// src/main.ts
var userRoot = process.env.CODEX_PLUSPLUS_USER_ROOT;
var runtimeDir = process.env.CODEX_PLUSPLUS_RUNTIME;
if (!userRoot || !runtimeDir) {
  throw new Error(
    "codex-plusplus runtime started without CODEX_PLUSPLUS_USER_ROOT/RUNTIME envs"
  );
}
var PRELOAD_PATH = (0, import_node_path5.resolve)(runtimeDir, "preload.js");
var TWEAKS_DIR = (0, import_node_path5.resolve)(userRoot, "tweaks");
var LOG_DIR = (0, import_node_path5.join)(userRoot, "log");
var LOG_FILE = (0, import_node_path5.join)(LOG_DIR, "main.log");
var CONFIG_FILE = (0, import_node_path5.join)(userRoot, "config.json");
var CODEX_PLUSPLUS_REPO = "b-nnett/codex-plusplus";
(0, import_node_fs4.mkdirSync)(LOG_DIR, { recursive: true });
(0, import_node_fs4.mkdirSync)(TWEAKS_DIR, { recursive: true });
var runtimeStartedAt = (/* @__PURE__ */ new Date()).toISOString();
var recentRuntimeErrors = [];
var lastReload = null;
if (process.env.CODEXPP_REMOTE_DEBUG === "1") {
  const port = process.env.CODEXPP_REMOTE_DEBUG_PORT ?? "9222";
  import_electron.app.commandLine.appendSwitch("remote-debugging-port", port);
  log("info", `remote debugging enabled on port ${port}`);
}
function readState() {
  try {
    return JSON.parse((0, import_node_fs4.readFileSync)(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeState(s) {
  try {
    (0, import_node_fs4.writeFileSync)(CONFIG_FILE, JSON.stringify(s, null, 2));
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
    (0, import_node_fs4.appendFileSync)(LOG_FILE, line);
  } catch {
  }
  if (level === "warn" || level === "error") {
    recentRuntimeErrors.push({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message: args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ").slice(0, 500)
    });
    recentRuntimeErrors.splice(0, Math.max(0, recentRuntimeErrors.length - 20));
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
var registeredMainHandles = /* @__PURE__ */ new Map();
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
void loadAllMainTweaks();
var quitAfterTweakStop = false;
import_electron.app.on("before-quit", (event) => {
  if (quitAfterTweakStop) return;
  event.preventDefault();
  quitAfterTweakStop = true;
  void (async () => {
    await stopAllMainTweaks();
    import_electron.app.quit();
  })();
});
import_electron.ipcMain.handle("codexpp:list-tweaks", async () => {
  await Promise.all(tweakState.discovered.map((t) => ensureTweakUpdateCheck(t)));
  const updateChecks = readState().tweakUpdateChecks ?? {};
  return tweakState.discovered.map((t) => ({
    manifest: t.manifest,
    entry: t.entry,
    dir: t.dir,
    entryExists: (0, import_node_fs4.existsSync)(t.entry),
    enabled: isTweakEnabled(t.manifest.id),
    loadable: t.loadable,
    loadError: t.loadError,
    capabilities: t.capabilities,
    update: updateChecks[t.manifest.id] ?? null
  }));
});
import_electron.ipcMain.handle("codexpp:get-tweak-enabled", (_e, id) => isTweakEnabled(id));
import_electron.ipcMain.handle("codexpp:set-tweak-enabled", async (_e, id, enabled) => {
  setTweakEnabled(id, !!enabled);
  log("info", `tweak ${id} enabled=${!!enabled}`);
  await reloadTweaks(`tweak ${id} enabled=${!!enabled}`);
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
import_electron.ipcMain.handle(
  "codexpp:runtime-health",
  () => createRuntimeHealth({
    version: CODEX_PLUSPLUS_VERSION,
    userRoot,
    runtimeDir,
    tweaksDir: TWEAKS_DIR,
    logDir: LOG_DIR,
    discoveredTweaks: tweakState.discovered.length,
    loadedMainTweaks: tweakState.loadedMain.size,
    loadedRendererTweaks: null,
    startedAt: runtimeStartedAt,
    lastReload,
    recentErrors: recentRuntimeErrors
  })
);
import_electron.ipcMain.handle("codexpp:read-tweak-source", (_e, entryPath) => {
  const resolved = resolveInside(TWEAKS_DIR, entryPath, {
    mustExist: true,
    requireFile: true
  });
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
    const dir = resolveInside(TWEAKS_DIR, tweakDir, {
      mustExist: true,
      requireDirectory: true
    });
    const full = resolveInside(dir, relPath, {
      mustExist: true,
      requireFile: true
    });
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
    (0, import_node_fs4.appendFileSync)(
      (0, import_node_path5.join)(LOG_DIR, "preload.log"),
      `[${(/* @__PURE__ */ new Date()).toISOString()}] [${lvl}] ${msg}
`
    );
  } catch {
  }
});
import_electron.ipcMain.handle("codexpp:tweak-fs", (_e, op, id, p, c) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error("bad tweak id");
  const dir = (0, import_node_path5.resolve)(userRoot, "tweak-data", id);
  (0, import_node_fs4.mkdirSync)(dir, { recursive: true });
  if (op === "dataDir") return dir;
  if (!["read", "write", "exists"].includes(op)) {
    throw new Error(`unknown op: ${op}`);
  }
  const full = resolveInside(dir, p, {
    mustExist: op === "read",
    requireFile: op === "read"
  });
  const fs = require("node:fs");
  switch (op) {
    case "read":
      return fs.readFileSync(full, "utf8");
    case "write":
      return fs.writeFileSync(full, c ?? "", "utf8");
    case "exists":
      return fs.existsSync(full);
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
import_electron.ipcMain.handle("codexpp:reload-tweaks", async () => {
  await reloadTweaks("manual");
  return { at: Date.now(), count: tweakState.discovered.length };
});
var RELOAD_DEBOUNCE_MS = 250;
var reloadTimer = null;
function scheduleReload(reason) {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    void reloadTweaks(reason);
  }, RELOAD_DEBOUNCE_MS);
}
try {
  const watcher = esm_default.watch(TWEAKS_DIR, {
    ignoreInitial: true,
    // Wait for files to settle before triggering — guards against partially
    // written tweak files during editor saves / git checkouts.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    // Avoid eating CPU on huge node_modules trees inside tweak folders.
    ignored: (p) => isInsidePath(TWEAKS_DIR, (0, import_node_path5.resolve)(p)) && /(^|[\\/])node_modules([\\/]|$)/.test(p)
  });
  watcher.on("all", (event, path) => scheduleReload(`${event} ${path}`));
  watcher.on("error", (e) => log("warn", "watcher error:", e));
  log("info", "watching", TWEAKS_DIR);
  import_electron.app.on("will-quit", () => watcher.close().catch(() => {
  }));
} catch (e) {
  log("error", "failed to start watcher:", e);
}
async function reloadTweaks(reason) {
  log("info", `reloading tweaks (${reason})`);
  try {
    await stopAllMainTweaks();
    clearTweakModuleCache();
    await loadAllMainTweaks();
    lastReload = { at: (/* @__PURE__ */ new Date()).toISOString(), reason, ok: true };
    broadcastReload();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    lastReload = { at: (/* @__PURE__ */ new Date()).toISOString(), reason, ok: false, error };
    log("error", `reload failed (${reason}):`, error);
    throw e;
  }
}
async function loadAllMainTweaks() {
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
    if (!t.loadable) {
      log("warn", `skipping incompatible main tweak ${t.manifest.id}: ${t.loadError}`);
      continue;
    }
    if (!isTweakEnabled(t.manifest.id)) {
      log("info", `skipping disabled main tweak: ${t.manifest.id}`);
      continue;
    }
    let startupDisposers = [];
    try {
      const mod = require(t.entry);
      const tweak = mod.default ?? mod;
      if (typeof tweak?.start === "function") {
        const storage = createDiskStorage(userRoot, t.manifest.id);
        const disposers = [];
        startupDisposers = disposers;
        await tweak.start({
          manifest: t.manifest,
          process: "main",
          log: makeLogger(t.manifest.id),
          storage,
          ipc: makeMainIpc(t.manifest.id, disposers),
          fs: makeMainFs(t.manifest.id)
        });
        tweakState.loadedMain.set(t.manifest.id, {
          stop: tweak.stop,
          disposers,
          storage
        });
        log("info", `started main tweak: ${t.manifest.id}`);
      }
    } catch (e) {
      for (const dispose of startupDisposers) {
        try {
          dispose();
        } catch {
        }
      }
      log("error", `tweak ${t.manifest.id} failed to start:`, e);
    }
  }
}
function stopAllMainTweaks() {
  return stopLoadedTweaks(tweakState.loadedMain, {
    info: (message) => log("info", message.replace("stopped tweak:", "stopped main tweak:")),
    warn: (message, error) => log("warn", message, error)
  });
}
function clearTweakModuleCache() {
  for (const key of Object.keys(require.cache)) {
    try {
      resolveInside(TWEAKS_DIR, key);
      delete require.cache[key];
    } catch {
    }
  }
}
var UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1e3;
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
    updateAvailable: latestVersion ? (compareVersions(normalizeVersion(latestVersion), CODEX_PLUSPLUS_VERSION) ?? 0) > 0 : false,
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
    updateAvailable: latestVersion ? (compareVersions(latestVersion, normalizeVersion(t.manifest.version)) ?? 0) > 0 : false,
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
function makeMainIpc(id, disposers) {
  return createMainIpc(id, import_electron.ipcMain, disposers, registeredMainHandles);
}
function makeMainFs(id) {
  const dir = (0, import_node_path5.resolve)(userRoot, "tweak-data", id);
  (0, import_node_fs4.mkdirSync)(dir, { recursive: true });
  const fs = require("node:fs/promises");
  return {
    dataDir: dir,
    read: (p) => fs.readFile(resolveInside(dir, p, { mustExist: true, requireFile: true }), "utf8"),
    write: (p, c) => fs.writeFile(resolveInside(dir, p), c, "utf8"),
    exists: async (p) => {
      const full = resolveInside(dir, p);
      try {
        await fs.access(full);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL21haW4udHMiLCAiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL2Nob2tpZGFyL2VzbS9pbmRleC5qcyIsICIuLi8uLi8uLi9ub2RlX21vZHVsZXMvcmVhZGRpcnAvZXNtL2luZGV4LmpzIiwgIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9jaG9raWRhci9lc20vaGFuZGxlci5qcyIsICIuLi9zcmMvdHdlYWstZGlzY292ZXJ5LnRzIiwgIi4uL3NyYy9wYXRoLXNlY3VyaXR5LnRzIiwgIi4uL3NyYy92ZXJzaW9uLnRzIiwgIi4uL3NyYy9zdG9yYWdlLnRzIiwgIi4uL3NyYy9saWZlY3ljbGUudHMiLCAiLi4vc3JjL21haW4taXBjLnRzIiwgIi4uL3NyYy9oZWFsdGgudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qKlxyXG4gKiBNYWluLXByb2Nlc3MgYm9vdHN0cmFwLiBMb2FkZWQgYnkgdGhlIGFzYXIgbG9hZGVyIGJlZm9yZSBDb2RleCdzIG93blxyXG4gKiBtYWluIHByb2Nlc3MgY29kZSBydW5zLiBXZSBob29rIGBCcm93c2VyV2luZG93YCBzbyBldmVyeSB3aW5kb3cgQ29kZXhcclxuICogY3JlYXRlcyBnZXRzIG91ciBwcmVsb2FkIHNjcmlwdCBhdHRhY2hlZC4gV2UgYWxzbyBzdGFuZCB1cCBhbiBJUENcclxuICogY2hhbm5lbCBmb3IgdHdlYWtzIHRvIHRhbGsgdG8gdGhlIG1haW4gcHJvY2Vzcy5cclxuICpcclxuICogV2UgYXJlIGluIENKUyBsYW5kIGhlcmUgKG1hdGNoZXMgRWxlY3Ryb24ncyBtYWluIHByb2Nlc3MgYW5kIENvZGV4J3Mgb3duXHJcbiAqIGNvZGUpLiBUaGUgcmVuZGVyZXItc2lkZSBydW50aW1lIGlzIGJ1bmRsZWQgc2VwYXJhdGVseSBpbnRvIHByZWxvYWQuanMuXHJcbiAqL1xyXG5pbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3csIGNsaXBib2FyZCwgaXBjTWFpbiwgc2Vzc2lvbiwgc2hlbGwsIHdlYkNvbnRlbnRzIH0gZnJvbSBcImVsZWN0cm9uXCI7XHJcbmltcG9ydCB7IGV4aXN0c1N5bmMsIG1rZGlyU3luYywgYXBwZW5kRmlsZVN5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XHJcbmltcG9ydCB7IGpvaW4sIHJlc29sdmUgfSBmcm9tIFwibm9kZTpwYXRoXCI7XHJcbmltcG9ydCBjaG9raWRhciBmcm9tIFwiY2hva2lkYXJcIjtcbmltcG9ydCB7IGRpc2NvdmVyVHdlYWtzLCB0eXBlIERpc2NvdmVyZWRUd2VhayB9IGZyb20gXCIuL3R3ZWFrLWRpc2NvdmVyeVwiO1xuaW1wb3J0IHsgY3JlYXRlRGlza1N0b3JhZ2UsIHR5cGUgRGlza1N0b3JhZ2UgfSBmcm9tIFwiLi9zdG9yYWdlXCI7XG5pbXBvcnQgeyByZXNvbHZlSW5zaWRlLCBpc0luc2lkZVBhdGggfSBmcm9tIFwiLi9wYXRoLXNlY3VyaXR5XCI7XG5pbXBvcnQgeyBzdG9wTG9hZGVkVHdlYWtzIH0gZnJvbSBcIi4vbGlmZWN5Y2xlXCI7XG5pbXBvcnQgeyBDT0RFWF9QTFVTUExVU19WRVJTSU9OLCBjb21wYXJlVmVyc2lvbnMsIG5vcm1hbGl6ZVZlcnNpb24gfSBmcm9tIFwiLi92ZXJzaW9uXCI7XG5pbXBvcnQgeyBjcmVhdGVNYWluSXBjLCB0eXBlIERpc3Bvc2VyIH0gZnJvbSBcIi4vbWFpbi1pcGNcIjtcbmltcG9ydCB7IGNyZWF0ZVJ1bnRpbWVIZWFsdGgsIHR5cGUgUnVudGltZUhlYWx0aEV2ZW50LCB0eXBlIFJ1bnRpbWVSZWxvYWRTdGF0dXMgfSBmcm9tIFwiLi9oZWFsdGhcIjtcblxyXG5jb25zdCB1c2VyUm9vdCA9IHByb2Nlc3MuZW52LkNPREVYX1BMVVNQTFVTX1VTRVJfUk9PVDtcclxuY29uc3QgcnVudGltZURpciA9IHByb2Nlc3MuZW52LkNPREVYX1BMVVNQTFVTX1JVTlRJTUU7XHJcblxyXG5pZiAoIXVzZXJSb290IHx8ICFydW50aW1lRGlyKSB7XHJcbiAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgXCJjb2RleC1wbHVzcGx1cyBydW50aW1lIHN0YXJ0ZWQgd2l0aG91dCBDT0RFWF9QTFVTUExVU19VU0VSX1JPT1QvUlVOVElNRSBlbnZzXCIsXHJcbiAgKTtcclxufVxyXG5cclxuY29uc3QgUFJFTE9BRF9QQVRIID0gcmVzb2x2ZShydW50aW1lRGlyLCBcInByZWxvYWQuanNcIik7XG5jb25zdCBUV0VBS1NfRElSID0gcmVzb2x2ZSh1c2VyUm9vdCwgXCJ0d2Vha3NcIik7XG5jb25zdCBMT0dfRElSID0gam9pbih1c2VyUm9vdCwgXCJsb2dcIik7XG5jb25zdCBMT0dfRklMRSA9IGpvaW4oTE9HX0RJUiwgXCJtYWluLmxvZ1wiKTtcbmNvbnN0IENPTkZJR19GSUxFID0gam9pbih1c2VyUm9vdCwgXCJjb25maWcuanNvblwiKTtcbmNvbnN0IENPREVYX1BMVVNQTFVTX1JFUE8gPSBcImItbm5ldHQvY29kZXgtcGx1c3BsdXNcIjtcblxyXG5ta2RpclN5bmMoTE9HX0RJUiwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5ta2RpclN5bmMoVFdFQUtTX0RJUiwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cbmNvbnN0IHJ1bnRpbWVTdGFydGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5jb25zdCByZWNlbnRSdW50aW1lRXJyb3JzOiBSdW50aW1lSGVhbHRoRXZlbnRbXSA9IFtdO1xubGV0IGxhc3RSZWxvYWQ6IFJ1bnRpbWVSZWxvYWRTdGF0dXMgfCBudWxsID0gbnVsbDtcblxuLy8gT3B0aW9uYWw6IGVuYWJsZSBDaHJvbWUgRGV2VG9vbHMgUHJvdG9jb2wgb24gYSBUQ1AgcG9ydCBzbyB3ZSBjYW4gZHJpdmUgdGhlXG4vLyBydW5uaW5nIENvZGV4IGZyb20gb3V0c2lkZSAoY3VybCBodHRwOi8vbG9jYWxob3N0Ojxwb3J0Pi9qc29uLCBhdHRhY2ggdmlhXG4vLyBDRFAgV2ViU29ja2V0LCB0YWtlIHNjcmVlbnNob3RzLCBldmFsdWF0ZSBpbiByZW5kZXJlciwgZXRjLikuIENvZGV4J3NcclxuLy8gcHJvZHVjdGlvbiBidWlsZCBzZXRzIHdlYlByZWZlcmVuY2VzLmRldlRvb2xzPWZhbHNlLCB3aGljaCBraWxscyB0aGVcclxuLy8gaW4td2luZG93IERldlRvb2xzIHNob3J0Y3V0LCBidXQgYC0tcmVtb3RlLWRlYnVnZ2luZy1wb3J0YCB3b3JrcyByZWdhcmRsZXNzXHJcbi8vIGJlY2F1c2UgaXQncyBhIENocm9taXVtIGNvbW1hbmQtbGluZSBzd2l0Y2ggcHJvY2Vzc2VkIGJlZm9yZSBhcHAgaW5pdC5cclxuLy9cclxuLy8gT2ZmIGJ5IGRlZmF1bHQuIFNldCBDT0RFWFBQX1JFTU9URV9ERUJVRz0xIChvcHRpb25hbGx5IENPREVYUFBfUkVNT1RFX0RFQlVHX1BPUlQpXHJcbi8vIHRvIHR1cm4gaXQgb24uIE11c3QgYmUgYXBwZW5kZWQgYmVmb3JlIGBhcHBgIGJlY29tZXMgcmVhZHk7IHdlJ3JlIGF0IG1vZHVsZVxyXG4vLyB0b3AtbGV2ZWwgc28gdGhhdCdzIGZpbmUuXHJcbmlmIChwcm9jZXNzLmVudi5DT0RFWFBQX1JFTU9URV9ERUJVRyA9PT0gXCIxXCIpIHtcclxuICBjb25zdCBwb3J0ID0gcHJvY2Vzcy5lbnYuQ09ERVhQUF9SRU1PVEVfREVCVUdfUE9SVCA/PyBcIjkyMjJcIjtcclxuICBhcHAuY29tbWFuZExpbmUuYXBwZW5kU3dpdGNoKFwicmVtb3RlLWRlYnVnZ2luZy1wb3J0XCIsIHBvcnQpO1xyXG4gIGxvZyhcImluZm9cIiwgYHJlbW90ZSBkZWJ1Z2dpbmcgZW5hYmxlZCBvbiBwb3J0ICR7cG9ydH1gKTtcclxufVxyXG5cclxuaW50ZXJmYWNlIFBlcnNpc3RlZFN0YXRlIHtcclxuICBjb2RleFBsdXNQbHVzPzoge1xyXG4gICAgYXV0b1VwZGF0ZT86IGJvb2xlYW47XHJcbiAgICB1cGRhdGVDaGVjaz86IENvZGV4UGx1c1BsdXNVcGRhdGVDaGVjaztcclxuICB9O1xyXG4gIC8qKiBQZXItdHdlYWsgZW5hYmxlIGZsYWdzLiBNaXNzaW5nIGVudHJpZXMgZGVmYXVsdCB0byBlbmFibGVkLiAqL1xyXG4gIHR3ZWFrcz86IFJlY29yZDxzdHJpbmcsIHsgZW5hYmxlZD86IGJvb2xlYW4gfT47XHJcbiAgLyoqIENhY2hlZCBHaXRIdWIgcmVsZWFzZSBjaGVja3MuIFJ1bnRpbWUgbmV2ZXIgYXV0by1pbnN0YWxscyB1cGRhdGVzLiAqL1xyXG4gIHR3ZWFrVXBkYXRlQ2hlY2tzPzogUmVjb3JkPHN0cmluZywgVHdlYWtVcGRhdGVDaGVjaz47XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sge1xyXG4gIGNoZWNrZWRBdDogc3RyaW5nO1xyXG4gIGN1cnJlbnRWZXJzaW9uOiBzdHJpbmc7XHJcbiAgbGF0ZXN0VmVyc2lvbjogc3RyaW5nIHwgbnVsbDtcclxuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xyXG4gIHJlbGVhc2VOb3Rlczogc3RyaW5nIHwgbnVsbDtcclxuICB1cGRhdGVBdmFpbGFibGU6IGJvb2xlYW47XHJcbiAgZXJyb3I/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBUd2Vha1VwZGF0ZUNoZWNrIHtcclxuICBjaGVja2VkQXQ6IHN0cmluZztcclxuICByZXBvOiBzdHJpbmc7XHJcbiAgY3VycmVudFZlcnNpb246IHN0cmluZztcclxuICBsYXRlc3RWZXJzaW9uOiBzdHJpbmcgfCBudWxsO1xyXG4gIGxhdGVzdFRhZzogc3RyaW5nIHwgbnVsbDtcclxuICByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsO1xyXG4gIHVwZGF0ZUF2YWlsYWJsZTogYm9vbGVhbjtcclxuICBlcnJvcj86IHN0cmluZztcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZFN0YXRlKCk6IFBlcnNpc3RlZFN0YXRlIHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKENPTkZJR19GSUxFLCBcInV0ZjhcIikpIGFzIFBlcnNpc3RlZFN0YXRlO1xyXG4gIH0gY2F0Y2gge1xyXG4gICAgcmV0dXJuIHt9O1xyXG4gIH1cclxufVxyXG5mdW5jdGlvbiB3cml0ZVN0YXRlKHM6IFBlcnNpc3RlZFN0YXRlKTogdm9pZCB7XHJcbiAgdHJ5IHtcclxuICAgIHdyaXRlRmlsZVN5bmMoQ09ORklHX0ZJTEUsIEpTT04uc3RyaW5naWZ5KHMsIG51bGwsIDIpKTtcclxuICB9IGNhdGNoIChlKSB7XHJcbiAgICBsb2coXCJ3YXJuXCIsIFwid3JpdGVTdGF0ZSBmYWlsZWQ6XCIsIFN0cmluZygoZSBhcyBFcnJvcikubWVzc2FnZSkpO1xyXG4gIH1cclxufVxyXG5mdW5jdGlvbiBpc0NvZGV4UGx1c1BsdXNBdXRvVXBkYXRlRW5hYmxlZCgpOiBib29sZWFuIHtcclxuICByZXR1cm4gcmVhZFN0YXRlKCkuY29kZXhQbHVzUGx1cz8uYXV0b1VwZGF0ZSAhPT0gZmFsc2U7XHJcbn1cclxuZnVuY3Rpb24gc2V0Q29kZXhQbHVzUGx1c0F1dG9VcGRhdGUoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xyXG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcclxuICBzLmNvZGV4UGx1c1BsdXMgPz89IHt9O1xyXG4gIHMuY29kZXhQbHVzUGx1cy5hdXRvVXBkYXRlID0gZW5hYmxlZDtcclxuICB3cml0ZVN0YXRlKHMpO1xyXG59XHJcbmZ1bmN0aW9uIGlzVHdlYWtFbmFibGVkKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICBjb25zdCBzID0gcmVhZFN0YXRlKCk7XHJcbiAgcmV0dXJuIHMudHdlYWtzPy5baWRdPy5lbmFibGVkICE9PSBmYWxzZTtcclxufVxyXG5mdW5jdGlvbiBzZXRUd2Vha0VuYWJsZWQoaWQ6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xyXG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcclxuICBzLnR3ZWFrcyA/Pz0ge307XHJcbiAgcy50d2Vha3NbaWRdID0geyAuLi5zLnR3ZWFrc1tpZF0sIGVuYWJsZWQgfTtcclxuICB3cml0ZVN0YXRlKHMpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBsb2cobGV2ZWw6IFwiaW5mb1wiIHwgXCJ3YXJuXCIgfCBcImVycm9yXCIsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xyXG4gIGNvbnN0IGxpbmUgPSBgWyR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpfV0gWyR7bGV2ZWx9XSAke2FyZ3NcclxuICAgIC5tYXAoKGEpID0+ICh0eXBlb2YgYSA9PT0gXCJzdHJpbmdcIiA/IGEgOiBKU09OLnN0cmluZ2lmeShhKSkpXHJcbiAgICAuam9pbihcIiBcIil9XFxuYDtcclxuICB0cnkge1xuICAgIGFwcGVuZEZpbGVTeW5jKExPR19GSUxFLCBsaW5lKTtcbiAgfSBjYXRjaCB7fVxuICBpZiAobGV2ZWwgPT09IFwid2FyblwiIHx8IGxldmVsID09PSBcImVycm9yXCIpIHtcbiAgICByZWNlbnRSdW50aW1lRXJyb3JzLnB1c2goe1xuICAgICAgYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIGxldmVsLFxuICAgICAgbWVzc2FnZTogYXJnc1xuICAgICAgICAubWFwKChhKSA9PiAodHlwZW9mIGEgPT09IFwic3RyaW5nXCIgPyBhIDogSlNPTi5zdHJpbmdpZnkoYSkpKVxuICAgICAgICAuam9pbihcIiBcIilcbiAgICAgICAgLnNsaWNlKDAsIDUwMCksXG4gICAgfSk7XG4gICAgcmVjZW50UnVudGltZUVycm9ycy5zcGxpY2UoMCwgTWF0aC5tYXgoMCwgcmVjZW50UnVudGltZUVycm9ycy5sZW5ndGggLSAyMCkpO1xuICB9XG4gIGlmIChsZXZlbCA9PT0gXCJlcnJvclwiKSBjb25zb2xlLmVycm9yKFwiW2NvZGV4LXBsdXNwbHVzXVwiLCAuLi5hcmdzKTtcbn1cblxyXG4vLyBTdXJmYWNlIHVuaGFuZGxlZCBlcnJvcnMgZnJvbSBhbnl3aGVyZSBpbiB0aGUgbWFpbiBwcm9jZXNzIHRvIG91ciBsb2cuXHJcbnByb2Nlc3Mub24oXCJ1bmNhdWdodEV4Y2VwdGlvblwiLCAoZTogRXJyb3IgJiB7IGNvZGU/OiBzdHJpbmcgfSkgPT4ge1xyXG4gIGxvZyhcImVycm9yXCIsIFwidW5jYXVnaHRFeGNlcHRpb25cIiwgeyBjb2RlOiBlLmNvZGUsIG1lc3NhZ2U6IGUubWVzc2FnZSwgc3RhY2s6IGUuc3RhY2sgfSk7XHJcbn0pO1xyXG5wcm9jZXNzLm9uKFwidW5oYW5kbGVkUmVqZWN0aW9uXCIsIChlKSA9PiB7XHJcbiAgbG9nKFwiZXJyb3JcIiwgXCJ1bmhhbmRsZWRSZWplY3Rpb25cIiwgeyB2YWx1ZTogU3RyaW5nKGUpIH0pO1xyXG59KTtcclxuXHJcbmludGVyZmFjZSBMb2FkZWRNYWluVHdlYWsge1xuICBzdG9wPzogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD47XG4gIGRpc3Bvc2VyczogRGlzcG9zZXJbXTtcbiAgc3RvcmFnZTogRGlza1N0b3JhZ2U7XG59XG5cbmNvbnN0IHR3ZWFrU3RhdGUgPSB7XG4gIGRpc2NvdmVyZWQ6IFtdIGFzIERpc2NvdmVyZWRUd2Vha1tdLFxuICBsb2FkZWRNYWluOiBuZXcgTWFwPHN0cmluZywgTG9hZGVkTWFpblR3ZWFrPigpLFxufTtcblxuY29uc3QgcmVnaXN0ZXJlZE1haW5IYW5kbGVzID0gbmV3IE1hcDxzdHJpbmcsIERpc3Bvc2VyPigpO1xuXG4vLyAxLiBIb29rIGV2ZXJ5IHNlc3Npb24gc28gb3VyIHByZWxvYWQgcnVucyBpbiBldmVyeSByZW5kZXJlci5cbi8vXHJcbi8vIFdlIHVzZSBFbGVjdHJvbidzIG1vZGVybiBgc2Vzc2lvbi5yZWdpc3RlclByZWxvYWRTY3JpcHRgIEFQSSAoYWRkZWQgaW5cclxuLy8gRWxlY3Ryb24gMzUpLiBUaGUgZGVwcmVjYXRlZCBgc2V0UHJlbG9hZHNgIHBhdGggc2lsZW50bHkgbm8tb3BzIGluIHNvbWVcclxuLy8gY29uZmlndXJhdGlvbnMgKG5vdGFibHkgd2l0aCBzYW5kYm94ZWQgcmVuZGVyZXJzKSwgc28gcmVnaXN0ZXJQcmVsb2FkU2NyaXB0XHJcbi8vIGlzIHRoZSBvbmx5IHJlbGlhYmxlIHdheSB0byBpbmplY3QgaW50byBDb2RleCdzIEJyb3dzZXJXaW5kb3dzLlxyXG5mdW5jdGlvbiByZWdpc3RlclByZWxvYWQoczogRWxlY3Ryb24uU2Vzc2lvbiwgbGFiZWw6IHN0cmluZyk6IHZvaWQge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZWcgPSAocyBhcyB1bmtub3duIGFzIHtcclxuICAgICAgcmVnaXN0ZXJQcmVsb2FkU2NyaXB0PzogKG9wdHM6IHtcclxuICAgICAgICB0eXBlPzogXCJmcmFtZVwiIHwgXCJzZXJ2aWNlLXdvcmtlclwiO1xyXG4gICAgICAgIGlkPzogc3RyaW5nO1xyXG4gICAgICAgIGZpbGVQYXRoOiBzdHJpbmc7XHJcbiAgICAgIH0pID0+IHN0cmluZztcclxuICAgIH0pLnJlZ2lzdGVyUHJlbG9hZFNjcmlwdDtcclxuICAgIGlmICh0eXBlb2YgcmVnID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgcmVnLmNhbGwocywgeyB0eXBlOiBcImZyYW1lXCIsIGZpbGVQYXRoOiBQUkVMT0FEX1BBVEgsIGlkOiBcImNvZGV4LXBsdXNwbHVzXCIgfSk7XHJcbiAgICAgIGxvZyhcImluZm9cIiwgYHByZWxvYWQgcmVnaXN0ZXJlZCAocmVnaXN0ZXJQcmVsb2FkU2NyaXB0KSBvbiAke2xhYmVsfTpgLCBQUkVMT0FEX1BBVEgpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyBGYWxsYmFjayBmb3Igb2xkZXIgRWxlY3Ryb24gdmVyc2lvbnMuXHJcbiAgICBjb25zdCBleGlzdGluZyA9IHMuZ2V0UHJlbG9hZHMoKTtcclxuICAgIGlmICghZXhpc3RpbmcuaW5jbHVkZXMoUFJFTE9BRF9QQVRIKSkge1xyXG4gICAgICBzLnNldFByZWxvYWRzKFsuLi5leGlzdGluZywgUFJFTE9BRF9QQVRIXSk7XHJcbiAgICB9XHJcbiAgICBsb2coXCJpbmZvXCIsIGBwcmVsb2FkIHJlZ2lzdGVyZWQgKHNldFByZWxvYWRzKSBvbiAke2xhYmVsfTpgLCBQUkVMT0FEX1BBVEgpO1xyXG4gIH0gY2F0Y2ggKGUpIHtcclxuICAgIGlmIChlIGluc3RhbmNlb2YgRXJyb3IgJiYgZS5tZXNzYWdlLmluY2x1ZGVzKFwiZXhpc3RpbmcgSURcIikpIHtcclxuICAgICAgbG9nKFwiaW5mb1wiLCBgcHJlbG9hZCBhbHJlYWR5IHJlZ2lzdGVyZWQgb24gJHtsYWJlbH06YCwgUFJFTE9BRF9QQVRIKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgbG9nKFwiZXJyb3JcIiwgYHByZWxvYWQgcmVnaXN0cmF0aW9uIG9uICR7bGFiZWx9IGZhaWxlZDpgLCBlKTtcclxuICB9XHJcbn1cclxuXHJcbmFwcC53aGVuUmVhZHkoKS50aGVuKCgpID0+IHtcclxuICBsb2coXCJpbmZvXCIsIFwiYXBwIHJlYWR5IGZpcmVkXCIpO1xyXG4gIHJlZ2lzdGVyUHJlbG9hZChzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLCBcImRlZmF1bHRTZXNzaW9uXCIpO1xyXG59KTtcclxuXHJcbmFwcC5vbihcInNlc3Npb24tY3JlYXRlZFwiLCAocykgPT4ge1xyXG4gIHJlZ2lzdGVyUHJlbG9hZChzLCBcInNlc3Npb24tY3JlYXRlZFwiKTtcclxufSk7XHJcblxyXG4vLyBESUFHTk9TVElDOiBsb2cgZXZlcnkgd2ViQ29udGVudHMgY3JlYXRpb24uIFVzZWZ1bCBmb3IgdmVyaWZ5aW5nIG91clxyXG4vLyBwcmVsb2FkIHJlYWNoZXMgZXZlcnkgcmVuZGVyZXIgQ29kZXggc3Bhd25zLlxyXG5hcHAub24oXCJ3ZWItY29udGVudHMtY3JlYXRlZFwiLCAoX2UsIHdjKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHdwID0gKHdjIGFzIHVua25vd24gYXMgeyBnZXRMYXN0V2ViUHJlZmVyZW5jZXM/OiAoKSA9PiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KVxyXG4gICAgICAuZ2V0TGFzdFdlYlByZWZlcmVuY2VzPy4oKTtcclxuICAgIGxvZyhcImluZm9cIiwgXCJ3ZWItY29udGVudHMtY3JlYXRlZFwiLCB7XHJcbiAgICAgIGlkOiB3Yy5pZCxcclxuICAgICAgdHlwZTogd2MuZ2V0VHlwZSgpLFxyXG4gICAgICBzZXNzaW9uSXNEZWZhdWx0OiB3Yy5zZXNzaW9uID09PSBzZXNzaW9uLmRlZmF1bHRTZXNzaW9uLFxyXG4gICAgICBzYW5kYm94OiB3cD8uc2FuZGJveCxcclxuICAgICAgY29udGV4dElzb2xhdGlvbjogd3A/LmNvbnRleHRJc29sYXRpb24sXHJcbiAgICB9KTtcclxuICAgIHdjLm9uKFwicHJlbG9hZC1lcnJvclwiLCAoX2V2LCBwLCBlcnIpID0+IHtcclxuICAgICAgbG9nKFwiZXJyb3JcIiwgYHdjICR7d2MuaWR9IHByZWxvYWQtZXJyb3IgcGF0aD0ke3B9YCwgU3RyaW5nKGVycj8uc3RhY2sgPz8gZXJyKSk7XHJcbiAgICB9KTtcclxuICB9IGNhdGNoIChlKSB7XHJcbiAgICBsb2coXCJlcnJvclwiLCBcIndlYi1jb250ZW50cy1jcmVhdGVkIGhhbmRsZXIgZmFpbGVkOlwiLCBTdHJpbmcoKGUgYXMgRXJyb3IpPy5zdGFjayA/PyBlKSk7XHJcbiAgfVxyXG59KTtcclxuXHJcbmxvZyhcImluZm9cIiwgXCJtYWluLnRzIGV2YWx1YXRlZDsgYXBwLmlzUmVhZHk9XCIgKyBhcHAuaXNSZWFkeSgpKTtcclxuXHJcbi8vIDIuIEluaXRpYWwgdHdlYWsgZGlzY292ZXJ5ICsgbWFpbi1zY29wZSBsb2FkLlxudm9pZCBsb2FkQWxsTWFpblR3ZWFrcygpO1xuXG5sZXQgcXVpdEFmdGVyVHdlYWtTdG9wID0gZmFsc2U7XG5hcHAub24oXCJiZWZvcmUtcXVpdFwiLCAoZXZlbnQpID0+IHtcbiAgaWYgKHF1aXRBZnRlclR3ZWFrU3RvcCkgcmV0dXJuO1xuICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICBxdWl0QWZ0ZXJUd2Vha1N0b3AgPSB0cnVlO1xuICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgYXdhaXQgc3RvcEFsbE1haW5Ud2Vha3MoKTtcbiAgICBhcHAucXVpdCgpO1xuICB9KSgpO1xufSk7XG5cclxuLy8gMy4gSVBDOiBleHBvc2UgdHdlYWsgbWV0YWRhdGEgKyByZXZlYWwtaW4tZmluZGVyLlxyXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6bGlzdC10d2Vha3NcIiwgYXN5bmMgKCkgPT4ge1xyXG4gIGF3YWl0IFByb21pc2UuYWxsKHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5tYXAoKHQpID0+IGVuc3VyZVR3ZWFrVXBkYXRlQ2hlY2sodCkpKTtcclxuICBjb25zdCB1cGRhdGVDaGVja3MgPSByZWFkU3RhdGUoKS50d2Vha1VwZGF0ZUNoZWNrcyA/PyB7fTtcclxuICByZXR1cm4gdHdlYWtTdGF0ZS5kaXNjb3ZlcmVkLm1hcCgodCkgPT4gKHtcclxuICAgIG1hbmlmZXN0OiB0Lm1hbmlmZXN0LFxyXG4gICAgZW50cnk6IHQuZW50cnksXHJcbiAgICBkaXI6IHQuZGlyLFxuICAgIGVudHJ5RXhpc3RzOiBleGlzdHNTeW5jKHQuZW50cnkpLFxuICAgIGVuYWJsZWQ6IGlzVHdlYWtFbmFibGVkKHQubWFuaWZlc3QuaWQpLFxuICAgIGxvYWRhYmxlOiB0LmxvYWRhYmxlLFxuICAgIGxvYWRFcnJvcjogdC5sb2FkRXJyb3IsXG4gICAgY2FwYWJpbGl0aWVzOiB0LmNhcGFiaWxpdGllcyxcbiAgICB1cGRhdGU6IHVwZGF0ZUNoZWNrc1t0Lm1hbmlmZXN0LmlkXSA/PyBudWxsLFxuICB9KSk7XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmdldC10d2Vhay1lbmFibGVkXCIsIChfZSwgaWQ6IHN0cmluZykgPT4gaXNUd2Vha0VuYWJsZWQoaWQpKTtcbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpzZXQtdHdlYWstZW5hYmxlZFwiLCBhc3luYyAoX2UsIGlkOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pID0+IHtcbiAgc2V0VHdlYWtFbmFibGVkKGlkLCAhIWVuYWJsZWQpO1xuICBsb2coXCJpbmZvXCIsIGB0d2VhayAke2lkfSBlbmFibGVkPSR7ISFlbmFibGVkfWApO1xuICBhd2FpdCByZWxvYWRUd2Vha3MoYHR3ZWFrICR7aWR9IGVuYWJsZWQ9JHshIWVuYWJsZWR9YCk7XG4gIHJldHVybiB0cnVlO1xufSk7XG5cclxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOmdldC1jb25maWdcIiwgKCkgPT4ge1xyXG4gIGNvbnN0IHMgPSByZWFkU3RhdGUoKTtcclxuICByZXR1cm4ge1xyXG4gICAgdmVyc2lvbjogQ09ERVhfUExVU1BMVVNfVkVSU0lPTixcclxuICAgIGF1dG9VcGRhdGU6IHMuY29kZXhQbHVzUGx1cz8uYXV0b1VwZGF0ZSAhPT0gZmFsc2UsXHJcbiAgICB1cGRhdGVDaGVjazogcy5jb2RleFBsdXNQbHVzPy51cGRhdGVDaGVjayA/PyBudWxsLFxyXG4gIH07XHJcbn0pO1xyXG5cclxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnNldC1hdXRvLXVwZGF0ZVwiLCAoX2UsIGVuYWJsZWQ6IGJvb2xlYW4pID0+IHtcclxuICBzZXRDb2RleFBsdXNQbHVzQXV0b1VwZGF0ZSghIWVuYWJsZWQpO1xyXG4gIHJldHVybiB7IGF1dG9VcGRhdGU6IGlzQ29kZXhQbHVzUGx1c0F1dG9VcGRhdGVFbmFibGVkKCkgfTtcclxufSk7XHJcblxyXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y2hlY2stY29kZXhwcC11cGRhdGVcIiwgYXN5bmMgKF9lLCBmb3JjZT86IGJvb2xlYW4pID0+IHtcbiAgcmV0dXJuIGVuc3VyZUNvZGV4UGx1c1BsdXNVcGRhdGVDaGVjayhmb3JjZSA9PT0gdHJ1ZSk7XG59KTtcblxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnJ1bnRpbWUtaGVhbHRoXCIsICgpID0+XG4gIGNyZWF0ZVJ1bnRpbWVIZWFsdGgoe1xuICAgIHZlcnNpb246IENPREVYX1BMVVNQTFVTX1ZFUlNJT04sXG4gICAgdXNlclJvb3QsXG4gICAgcnVudGltZURpcixcbiAgICB0d2Vha3NEaXI6IFRXRUFLU19ESVIsXG4gICAgbG9nRGlyOiBMT0dfRElSLFxuICAgIGRpc2NvdmVyZWRUd2Vha3M6IHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5sZW5ndGgsXG4gICAgbG9hZGVkTWFpblR3ZWFrczogdHdlYWtTdGF0ZS5sb2FkZWRNYWluLnNpemUsXG4gICAgbG9hZGVkUmVuZGVyZXJUd2Vha3M6IG51bGwsXG4gICAgc3RhcnRlZEF0OiBydW50aW1lU3RhcnRlZEF0LFxuICAgIGxhc3RSZWxvYWQsXG4gICAgcmVjZW50RXJyb3JzOiByZWNlbnRSdW50aW1lRXJyb3JzLFxuICB9KSxcbik7XG5cclxuLy8gU2FuZGJveGVkIHJlbmRlcmVyIHByZWxvYWQgY2FuJ3QgdXNlIE5vZGUgZnMgdG8gcmVhZCB0d2VhayBzb3VyY2UuIE1haW5cclxuLy8gcmVhZHMgaXQgb24gdGhlIHJlbmRlcmVyJ3MgYmVoYWxmLiBQYXRoIG11c3QgbGl2ZSB1bmRlciB0d2Vha3NEaXIgZm9yXHJcbi8vIHNlY3VyaXR5IFx1MjAxNCB3ZSByZWZ1c2UgYW55dGhpbmcgZWxzZS5cclxuaXBjTWFpbi5oYW5kbGUoXCJjb2RleHBwOnJlYWQtdHdlYWstc291cmNlXCIsIChfZSwgZW50cnlQYXRoOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlSW5zaWRlKFRXRUFLU19ESVIsIGVudHJ5UGF0aCwge1xuICAgIG11c3RFeGlzdDogdHJ1ZSxcbiAgICByZXF1aXJlRmlsZTogdHJ1ZSxcbiAgfSk7XG4gIHJldHVybiByZXF1aXJlKFwibm9kZTpmc1wiKS5yZWFkRmlsZVN5bmMocmVzb2x2ZWQsIFwidXRmOFwiKTtcbn0pO1xuXHJcbi8qKlxyXG4gKiBSZWFkIGFuIGFyYml0cmFyeSBhc3NldCBmaWxlIGZyb20gaW5zaWRlIGEgdHdlYWsncyBkaXJlY3RvcnkgYW5kIHJldHVybiBpdFxyXG4gKiBhcyBhIGBkYXRhOmAgVVJMLiBVc2VkIGJ5IHRoZSBzZXR0aW5ncyBpbmplY3RvciB0byByZW5kZXIgbWFuaWZlc3QgaWNvbnNcclxuICogKHRoZSByZW5kZXJlciBpcyBzYW5kYm94ZWQ7IGBmaWxlOi8vYCB3b24ndCBsb2FkKS5cclxuICpcclxuICogU2VjdXJpdHk6IGNhbGxlciBwYXNzZXMgYHR3ZWFrRGlyYCBhbmQgYHJlbFBhdGhgOyB3ZSAoMSkgcmVxdWlyZSB0d2Vha0RpclxyXG4gKiB0byBsaXZlIHVuZGVyIFRXRUFLU19ESVIsICgyKSByZXNvbHZlIHJlbFBhdGggYWdhaW5zdCBpdCBhbmQgcmUtY2hlY2sgdGhlXHJcbiAqIHJlc3VsdCBzdGlsbCBsaXZlcyB1bmRlciBUV0VBS1NfRElSLCAoMykgY2FwIG91dHB1dCBzaXplIGF0IDEgTWlCLlxyXG4gKi9cclxuY29uc3QgQVNTRVRfTUFYX0JZVEVTID0gMTAyNCAqIDEwMjQ7XHJcbmNvbnN0IE1JTUVfQllfRVhUOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gIFwiLnBuZ1wiOiBcImltYWdlL3BuZ1wiLFxyXG4gIFwiLmpwZ1wiOiBcImltYWdlL2pwZWdcIixcclxuICBcIi5qcGVnXCI6IFwiaW1hZ2UvanBlZ1wiLFxyXG4gIFwiLmdpZlwiOiBcImltYWdlL2dpZlwiLFxyXG4gIFwiLndlYnBcIjogXCJpbWFnZS93ZWJwXCIsXHJcbiAgXCIuc3ZnXCI6IFwiaW1hZ2Uvc3ZnK3htbFwiLFxyXG4gIFwiLmljb1wiOiBcImltYWdlL3gtaWNvblwiLFxyXG59O1xyXG5pcGNNYWluLmhhbmRsZShcclxuICBcImNvZGV4cHA6cmVhZC10d2Vhay1hc3NldFwiLFxuICAoX2UsIHR3ZWFrRGlyOiBzdHJpbmcsIHJlbFBhdGg6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IGZzID0gcmVxdWlyZShcIm5vZGU6ZnNcIikgYXMgdHlwZW9mIGltcG9ydChcIm5vZGU6ZnNcIik7XG4gICAgY29uc3QgZGlyID0gcmVzb2x2ZUluc2lkZShUV0VBS1NfRElSLCB0d2Vha0Rpciwge1xuICAgICAgbXVzdEV4aXN0OiB0cnVlLFxuICAgICAgcmVxdWlyZURpcmVjdG9yeTogdHJ1ZSxcbiAgICB9KTtcbiAgICBjb25zdCBmdWxsID0gcmVzb2x2ZUluc2lkZShkaXIsIHJlbFBhdGgsIHtcbiAgICAgIG11c3RFeGlzdDogdHJ1ZSxcbiAgICAgIHJlcXVpcmVGaWxlOiB0cnVlLFxuICAgIH0pO1xuICAgIGNvbnN0IHN0YXQgPSBmcy5zdGF0U3luYyhmdWxsKTtcclxuICAgIGlmIChzdGF0LnNpemUgPiBBU1NFVF9NQVhfQllURVMpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBhc3NldCB0b28gbGFyZ2UgKCR7c3RhdC5zaXplfSA+ICR7QVNTRVRfTUFYX0JZVEVTfSlgKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGV4dCA9IGZ1bGwuc2xpY2UoZnVsbC5sYXN0SW5kZXhPZihcIi5cIikpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBjb25zdCBtaW1lID0gTUlNRV9CWV9FWFRbZXh0XSA/PyBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiO1xyXG4gICAgY29uc3QgYnVmID0gZnMucmVhZEZpbGVTeW5jKGZ1bGwpO1xyXG4gICAgcmV0dXJuIGBkYXRhOiR7bWltZX07YmFzZTY0LCR7YnVmLnRvU3RyaW5nKFwiYmFzZTY0XCIpfWA7XHJcbiAgfSxcclxuKTtcclxuXHJcbi8vIFNhbmRib3hlZCBwcmVsb2FkIGNhbid0IHdyaXRlIGxvZ3MgdG8gZGlzazsgZm9yd2FyZCB0byB1cyB2aWEgSVBDLlxyXG5pcGNNYWluLm9uKFwiY29kZXhwcDpwcmVsb2FkLWxvZ1wiLCAoX2UsIGxldmVsOiBcImluZm9cIiB8IFwid2FyblwiIHwgXCJlcnJvclwiLCBtc2c6IHN0cmluZykgPT4ge1xyXG4gIGNvbnN0IGx2bCA9IGxldmVsID09PSBcImVycm9yXCIgfHwgbGV2ZWwgPT09IFwid2FyblwiID8gbGV2ZWwgOiBcImluZm9cIjtcclxuICB0cnkge1xyXG4gICAgYXBwZW5kRmlsZVN5bmMoXHJcbiAgICAgIGpvaW4oTE9HX0RJUiwgXCJwcmVsb2FkLmxvZ1wiKSxcclxuICAgICAgYFske25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1dIFske2x2bH1dICR7bXNnfVxcbmAsXHJcbiAgICApO1xyXG4gIH0gY2F0Y2gge31cclxufSk7XHJcblxyXG4vLyBTYW5kYm94LXNhZmUgZmlsZXN5c3RlbSBvcHMgZm9yIHJlbmRlcmVyLXNjb3BlIHR3ZWFrcy4gRWFjaCB0d2VhayBnZXRzXHJcbi8vIGEgc2FuZGJveGVkIGRpciB1bmRlciB1c2VyUm9vdC90d2Vhay1kYXRhLzxpZD4uIFJlbmRlcmVyIHNpZGUgY2FsbHMgdGhlc2VcclxuLy8gb3ZlciBJUEMgaW5zdGVhZCBvZiB1c2luZyBOb2RlIGZzIGRpcmVjdGx5LlxyXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6dHdlYWstZnNcIiwgKF9lLCBvcDogc3RyaW5nLCBpZDogc3RyaW5nLCBwOiBzdHJpbmcsIGM/OiBzdHJpbmcpID0+IHtcbiAgaWYgKCEvXlthLXpBLVowLTkuXy1dKyQvLnRlc3QoaWQpKSB0aHJvdyBuZXcgRXJyb3IoXCJiYWQgdHdlYWsgaWRcIik7XG4gIGNvbnN0IGRpciA9IHJlc29sdmUodXNlclJvb3QhLCBcInR3ZWFrLWRhdGFcIiwgaWQpO1xuICBta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgaWYgKG9wID09PSBcImRhdGFEaXJcIikgcmV0dXJuIGRpcjtcbiAgaWYgKCFbXCJyZWFkXCIsIFwid3JpdGVcIiwgXCJleGlzdHNcIl0uaW5jbHVkZXMob3ApKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGB1bmtub3duIG9wOiAke29wfWApO1xuICB9XG4gIGNvbnN0IGZ1bGwgPSByZXNvbHZlSW5zaWRlKGRpciwgcCwge1xuICAgIG11c3RFeGlzdDogb3AgPT09IFwicmVhZFwiLFxuICAgIHJlcXVpcmVGaWxlOiBvcCA9PT0gXCJyZWFkXCIsXG4gIH0pO1xuICBjb25zdCBmcyA9IHJlcXVpcmUoXCJub2RlOmZzXCIpIGFzIHR5cGVvZiBpbXBvcnQoXCJub2RlOmZzXCIpO1xuICBzd2l0Y2ggKG9wKSB7XG4gICAgY2FzZSBcInJlYWRcIjogcmV0dXJuIGZzLnJlYWRGaWxlU3luYyhmdWxsLCBcInV0ZjhcIik7XG4gICAgY2FzZSBcIndyaXRlXCI6IHJldHVybiBmcy53cml0ZUZpbGVTeW5jKGZ1bGwsIGMgPz8gXCJcIiwgXCJ1dGY4XCIpO1xuICAgIGNhc2UgXCJleGlzdHNcIjogcmV0dXJuIGZzLmV4aXN0c1N5bmMoZnVsbCk7XG4gIH1cbn0pO1xuXHJcbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDp1c2VyLXBhdGhzXCIsICgpID0+ICh7XHJcbiAgdXNlclJvb3QsXHJcbiAgcnVudGltZURpcixcclxuICB0d2Vha3NEaXI6IFRXRUFLU19ESVIsXHJcbiAgbG9nRGlyOiBMT0dfRElSLFxyXG59KSk7XHJcblxyXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6cmV2ZWFsXCIsIChfZSwgcDogc3RyaW5nKSA9PiB7XHJcbiAgc2hlbGwub3BlblBhdGgocCkuY2F0Y2goKCkgPT4ge30pO1xyXG59KTtcclxuXHJcbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpvcGVuLWV4dGVybmFsXCIsIChfZSwgdXJsOiBzdHJpbmcpID0+IHtcclxuICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XHJcbiAgaWYgKHBhcnNlZC5wcm90b2NvbCAhPT0gXCJodHRwczpcIiB8fCBwYXJzZWQuaG9zdG5hbWUgIT09IFwiZ2l0aHViLmNvbVwiKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvbmx5IGdpdGh1Yi5jb20gbGlua3MgY2FuIGJlIG9wZW5lZCBmcm9tIHR3ZWFrIG1ldGFkYXRhXCIpO1xyXG4gIH1cclxuICBzaGVsbC5vcGVuRXh0ZXJuYWwocGFyc2VkLnRvU3RyaW5nKCkpLmNhdGNoKCgpID0+IHt9KTtcclxufSk7XHJcblxyXG5pcGNNYWluLmhhbmRsZShcImNvZGV4cHA6Y29weS10ZXh0XCIsIChfZSwgdGV4dDogc3RyaW5nKSA9PiB7XHJcbiAgY2xpcGJvYXJkLndyaXRlVGV4dChTdHJpbmcodGV4dCkpO1xyXG4gIHJldHVybiB0cnVlO1xyXG59KTtcclxuXHJcbi8vIE1hbnVhbCBmb3JjZS1yZWxvYWQgdHJpZ2dlciBmcm9tIHRoZSByZW5kZXJlciAoZS5nLiB0aGUgXCJGb3JjZSBSZWxvYWRcIlxyXG4vLyBidXR0b24gb24gb3VyIGluamVjdGVkIFR3ZWFrcyBwYWdlKS4gQnlwYXNzZXMgdGhlIHdhdGNoZXIgZGVib3VuY2UuXHJcbmlwY01haW4uaGFuZGxlKFwiY29kZXhwcDpyZWxvYWQtdHdlYWtzXCIsIGFzeW5jICgpID0+IHtcbiAgYXdhaXQgcmVsb2FkVHdlYWtzKFwibWFudWFsXCIpO1xuICByZXR1cm4geyBhdDogRGF0ZS5ub3coKSwgY291bnQ6IHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5sZW5ndGggfTtcbn0pO1xuXHJcbi8vIDQuIEZpbGVzeXN0ZW0gd2F0Y2hlciBcdTIxOTIgZGVib3VuY2VkIHJlbG9hZCArIGJyb2FkY2FzdC5cclxuLy8gICAgV2Ugd2F0Y2ggdGhlIHR3ZWFrcyBkaXIgZm9yIGFueSBjaGFuZ2UuIE9uIHRoZSBmaXJzdCB0aWNrIG9mIGluYWN0aXZpdHlcclxuLy8gICAgd2Ugc3RvcCBtYWluLXNpZGUgdHdlYWtzLCBjbGVhciB0aGVpciBjYWNoZWQgbW9kdWxlcywgcmUtZGlzY292ZXIsIHRoZW5cclxuLy8gICAgcmVzdGFydCBhbmQgYnJvYWRjYXN0IGBjb2RleHBwOnR3ZWFrcy1jaGFuZ2VkYCB0byBldmVyeSByZW5kZXJlciBzbyBpdFxyXG4vLyAgICBjYW4gcmUtaW5pdCBpdHMgaG9zdC5cclxuY29uc3QgUkVMT0FEX0RFQk9VTkNFX01TID0gMjUwO1xyXG5sZXQgcmVsb2FkVGltZXI6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XHJcbmZ1bmN0aW9uIHNjaGVkdWxlUmVsb2FkKHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XHJcbiAgaWYgKHJlbG9hZFRpbWVyKSBjbGVhclRpbWVvdXQocmVsb2FkVGltZXIpO1xyXG4gIHJlbG9hZFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgcmVsb2FkVGltZXIgPSBudWxsO1xuICAgIHZvaWQgcmVsb2FkVHdlYWtzKHJlYXNvbik7XG4gIH0sIFJFTE9BRF9ERUJPVU5DRV9NUyk7XG59XG5cclxudHJ5IHtcclxuICBjb25zdCB3YXRjaGVyID0gY2hva2lkYXIud2F0Y2goVFdFQUtTX0RJUiwge1xyXG4gICAgaWdub3JlSW5pdGlhbDogdHJ1ZSxcclxuICAgIC8vIFdhaXQgZm9yIGZpbGVzIHRvIHNldHRsZSBiZWZvcmUgdHJpZ2dlcmluZyBcdTIwMTQgZ3VhcmRzIGFnYWluc3QgcGFydGlhbGx5XHJcbiAgICAvLyB3cml0dGVuIHR3ZWFrIGZpbGVzIGR1cmluZyBlZGl0b3Igc2F2ZXMgLyBnaXQgY2hlY2tvdXRzLlxyXG4gICAgYXdhaXRXcml0ZUZpbmlzaDogeyBzdGFiaWxpdHlUaHJlc2hvbGQ6IDE1MCwgcG9sbEludGVydmFsOiA1MCB9LFxyXG4gICAgLy8gQXZvaWQgZWF0aW5nIENQVSBvbiBodWdlIG5vZGVfbW9kdWxlcyB0cmVlcyBpbnNpZGUgdHdlYWsgZm9sZGVycy5cclxuICAgIGlnbm9yZWQ6IChwKSA9PlxuICAgICAgaXNJbnNpZGVQYXRoKFRXRUFLU19ESVIsIHJlc29sdmUocCkpICYmXG4gICAgICAvKF58W1xcXFwvXSlub2RlX21vZHVsZXMoW1xcXFwvXXwkKS8udGVzdChwKSxcbiAgfSk7XHJcbiAgd2F0Y2hlci5vbihcImFsbFwiLCAoZXZlbnQsIHBhdGgpID0+IHNjaGVkdWxlUmVsb2FkKGAke2V2ZW50fSAke3BhdGh9YCkpO1xyXG4gIHdhdGNoZXIub24oXCJlcnJvclwiLCAoZSkgPT4gbG9nKFwid2FyblwiLCBcIndhdGNoZXIgZXJyb3I6XCIsIGUpKTtcclxuICBsb2coXCJpbmZvXCIsIFwid2F0Y2hpbmdcIiwgVFdFQUtTX0RJUik7XHJcbiAgYXBwLm9uKFwid2lsbC1xdWl0XCIsICgpID0+IHdhdGNoZXIuY2xvc2UoKS5jYXRjaCgoKSA9PiB7fSkpO1xyXG59IGNhdGNoIChlKSB7XHJcbiAgbG9nKFwiZXJyb3JcIiwgXCJmYWlsZWQgdG8gc3RhcnQgd2F0Y2hlcjpcIiwgZSk7XHJcbn1cclxuXHJcbi8vIC0tLSBoZWxwZXJzIC0tLVxuXG5hc3luYyBmdW5jdGlvbiByZWxvYWRUd2Vha3MocmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgbG9nKFwiaW5mb1wiLCBgcmVsb2FkaW5nIHR3ZWFrcyAoJHtyZWFzb259KWApO1xuICB0cnkge1xuICAgIGF3YWl0IHN0b3BBbGxNYWluVHdlYWtzKCk7XG4gICAgY2xlYXJUd2Vha01vZHVsZUNhY2hlKCk7XG4gICAgYXdhaXQgbG9hZEFsbE1haW5Ud2Vha3MoKTtcbiAgICBsYXN0UmVsb2FkID0geyBhdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLCByZWFzb24sIG9rOiB0cnVlIH07XG4gICAgYnJvYWRjYXN0UmVsb2FkKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zdCBlcnJvciA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcbiAgICBsYXN0UmVsb2FkID0geyBhdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLCByZWFzb24sIG9rOiBmYWxzZSwgZXJyb3IgfTtcbiAgICBsb2coXCJlcnJvclwiLCBgcmVsb2FkIGZhaWxlZCAoJHtyZWFzb259KTpgLCBlcnJvcik7XG4gICAgdGhyb3cgZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkQWxsTWFpblR3ZWFrcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICB0d2Vha1N0YXRlLmRpc2NvdmVyZWQgPSBkaXNjb3ZlclR3ZWFrcyhUV0VBS1NfRElSKTtcbiAgICBsb2coXHJcbiAgICAgIFwiaW5mb1wiLFxyXG4gICAgICBgZGlzY292ZXJlZCAke3R3ZWFrU3RhdGUuZGlzY292ZXJlZC5sZW5ndGh9IHR3ZWFrKHMpOmAsXHJcbiAgICAgIHR3ZWFrU3RhdGUuZGlzY292ZXJlZC5tYXAoKHQpID0+IHQubWFuaWZlc3QuaWQpLmpvaW4oXCIsIFwiKSxcclxuICAgICk7XHJcbiAgfSBjYXRjaCAoZSkge1xyXG4gICAgbG9nKFwiZXJyb3JcIiwgXCJ0d2VhayBkaXNjb3ZlcnkgZmFpbGVkOlwiLCBlKTtcclxuICAgIHR3ZWFrU3RhdGUuZGlzY292ZXJlZCA9IFtdO1xyXG4gIH1cclxuXG4gIGZvciAoY29uc3QgdCBvZiB0d2Vha1N0YXRlLmRpc2NvdmVyZWQpIHtcbiAgICBpZiAodC5tYW5pZmVzdC5zY29wZSA9PT0gXCJyZW5kZXJlclwiKSBjb250aW51ZTtcbiAgICBpZiAoIXQubG9hZGFibGUpIHtcbiAgICAgIGxvZyhcIndhcm5cIiwgYHNraXBwaW5nIGluY29tcGF0aWJsZSBtYWluIHR3ZWFrICR7dC5tYW5pZmVzdC5pZH06ICR7dC5sb2FkRXJyb3J9YCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKCFpc1R3ZWFrRW5hYmxlZCh0Lm1hbmlmZXN0LmlkKSkge1xuICAgICAgbG9nKFwiaW5mb1wiLCBgc2tpcHBpbmcgZGlzYWJsZWQgbWFpbiB0d2VhazogJHt0Lm1hbmlmZXN0LmlkfWApO1xuICAgICAgY29udGludWU7XG4gICAgfVxyXG4gICAgbGV0IHN0YXJ0dXBEaXNwb3NlcnM6IERpc3Bvc2VyW10gPSBbXTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgbW9kID0gcmVxdWlyZSh0LmVudHJ5KTtcbiAgICAgIGNvbnN0IHR3ZWFrID0gbW9kLmRlZmF1bHQgPz8gbW9kO1xuICAgICAgaWYgKHR5cGVvZiB0d2Vhaz8uc3RhcnQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICBjb25zdCBzdG9yYWdlID0gY3JlYXRlRGlza1N0b3JhZ2UodXNlclJvb3QhLCB0Lm1hbmlmZXN0LmlkKTtcbiAgICAgICAgY29uc3QgZGlzcG9zZXJzOiBEaXNwb3NlcltdID0gW107XG4gICAgICAgIHN0YXJ0dXBEaXNwb3NlcnMgPSBkaXNwb3NlcnM7XG4gICAgICAgIGF3YWl0IHR3ZWFrLnN0YXJ0KHtcbiAgICAgICAgICBtYW5pZmVzdDogdC5tYW5pZmVzdCxcbiAgICAgICAgICBwcm9jZXNzOiBcIm1haW5cIixcbiAgICAgICAgICBsb2c6IG1ha2VMb2dnZXIodC5tYW5pZmVzdC5pZCksXG4gICAgICAgICAgc3RvcmFnZSxcbiAgICAgICAgICBpcGM6IG1ha2VNYWluSXBjKHQubWFuaWZlc3QuaWQsIGRpc3Bvc2VycyksXG4gICAgICAgICAgZnM6IG1ha2VNYWluRnModC5tYW5pZmVzdC5pZCksXG4gICAgICAgIH0pO1xuICAgICAgICB0d2Vha1N0YXRlLmxvYWRlZE1haW4uc2V0KHQubWFuaWZlc3QuaWQsIHtcbiAgICAgICAgICBzdG9wOiB0d2Vhay5zdG9wLFxuICAgICAgICAgIGRpc3Bvc2VycyxcbiAgICAgICAgICBzdG9yYWdlLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nKFwiaW5mb1wiLCBgc3RhcnRlZCBtYWluIHR3ZWFrOiAke3QubWFuaWZlc3QuaWR9YCk7XHJcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBmb3IgKGNvbnN0IGRpc3Bvc2Ugb2Ygc3RhcnR1cERpc3Bvc2Vycykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgICAgfSBjYXRjaCB7fVxuICAgICAgfVxuICAgICAgbG9nKFwiZXJyb3JcIiwgYHR3ZWFrICR7dC5tYW5pZmVzdC5pZH0gZmFpbGVkIHRvIHN0YXJ0OmAsIGUpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzdG9wQWxsTWFpblR3ZWFrcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgcmV0dXJuIHN0b3BMb2FkZWRUd2Vha3ModHdlYWtTdGF0ZS5sb2FkZWRNYWluLCB7XG4gICAgaW5mbzogKG1lc3NhZ2UpID0+IGxvZyhcImluZm9cIiwgbWVzc2FnZS5yZXBsYWNlKFwic3RvcHBlZCB0d2VhazpcIiwgXCJzdG9wcGVkIG1haW4gdHdlYWs6XCIpKSxcbiAgICB3YXJuOiAobWVzc2FnZSwgZXJyb3IpID0+IGxvZyhcIndhcm5cIiwgbWVzc2FnZSwgZXJyb3IpLFxuICB9KTtcbn1cblxyXG5mdW5jdGlvbiBjbGVhclR3ZWFrTW9kdWxlQ2FjaGUoKTogdm9pZCB7XHJcbiAgLy8gRHJvcCBjYWNoZWQgcmVxdWlyZSgpIGVudHJpZXMgdGhhdCBsaXZlIGluc2lkZSB0aGUgdHdlYWtzIGRpciBzbyBhXG4gIC8vIHJlLXJlcXVpcmUgb24gbmV4dCBsb2FkIHBpY2tzIHVwIGZyZXNoIGNvZGUuXG4gIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHJlcXVpcmUuY2FjaGUpKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJlc29sdmVJbnNpZGUoVFdFQUtTX0RJUiwga2V5KTtcbiAgICAgIGRlbGV0ZSByZXF1aXJlLmNhY2hlW2tleV07XG4gICAgfSBjYXRjaCB7fVxuICB9XG59XG5cclxuY29uc3QgVVBEQVRFX0NIRUNLX0lOVEVSVkFMX01TID0gMjQgKiA2MCAqIDYwICogMTAwMDtcblxyXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2soZm9yY2UgPSBmYWxzZSk6IFByb21pc2U8Q29kZXhQbHVzUGx1c1VwZGF0ZUNoZWNrPiB7XHJcbiAgY29uc3Qgc3RhdGUgPSByZWFkU3RhdGUoKTtcclxuICBjb25zdCBjYWNoZWQgPSBzdGF0ZS5jb2RleFBsdXNQbHVzPy51cGRhdGVDaGVjaztcclxuICBpZiAoXHJcbiAgICAhZm9yY2UgJiZcclxuICAgIGNhY2hlZCAmJlxyXG4gICAgY2FjaGVkLmN1cnJlbnRWZXJzaW9uID09PSBDT0RFWF9QTFVTUExVU19WRVJTSU9OICYmXHJcbiAgICBEYXRlLm5vdygpIC0gRGF0ZS5wYXJzZShjYWNoZWQuY2hlY2tlZEF0KSA8IFVQREFURV9DSEVDS19JTlRFUlZBTF9NU1xyXG4gICkge1xyXG4gICAgcmV0dXJuIGNhY2hlZDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlbGVhc2UgPSBhd2FpdCBmZXRjaExhdGVzdFJlbGVhc2UoQ09ERVhfUExVU1BMVVNfUkVQTywgQ09ERVhfUExVU1BMVVNfVkVSU0lPTik7XHJcbiAgY29uc3QgbGF0ZXN0VmVyc2lvbiA9IHJlbGVhc2UubGF0ZXN0VGFnID8gbm9ybWFsaXplVmVyc2lvbihyZWxlYXNlLmxhdGVzdFRhZykgOiBudWxsO1xyXG4gIGNvbnN0IGNoZWNrOiBDb2RleFBsdXNQbHVzVXBkYXRlQ2hlY2sgPSB7XHJcbiAgICBjaGVja2VkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIGN1cnJlbnRWZXJzaW9uOiBDT0RFWF9QTFVTUExVU19WRVJTSU9OLFxyXG4gICAgbGF0ZXN0VmVyc2lvbixcclxuICAgIHJlbGVhc2VVcmw6IHJlbGVhc2UucmVsZWFzZVVybCA/PyBgaHR0cHM6Ly9naXRodWIuY29tLyR7Q09ERVhfUExVU1BMVVNfUkVQT30vcmVsZWFzZXNgLFxyXG4gICAgcmVsZWFzZU5vdGVzOiByZWxlYXNlLnJlbGVhc2VOb3RlcyxcbiAgICB1cGRhdGVBdmFpbGFibGU6IGxhdGVzdFZlcnNpb25cbiAgICAgID8gKGNvbXBhcmVWZXJzaW9ucyhub3JtYWxpemVWZXJzaW9uKGxhdGVzdFZlcnNpb24pLCBDT0RFWF9QTFVTUExVU19WRVJTSU9OKSA/PyAwKSA+IDBcbiAgICAgIDogZmFsc2UsXG4gICAgLi4uKHJlbGVhc2UuZXJyb3IgPyB7IGVycm9yOiByZWxlYXNlLmVycm9yIH0gOiB7fSksXHJcbiAgfTtcclxuICBzdGF0ZS5jb2RleFBsdXNQbHVzID8/PSB7fTtcclxuICBzdGF0ZS5jb2RleFBsdXNQbHVzLnVwZGF0ZUNoZWNrID0gY2hlY2s7XHJcbiAgd3JpdGVTdGF0ZShzdGF0ZSk7XHJcbiAgcmV0dXJuIGNoZWNrO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVUd2Vha1VwZGF0ZUNoZWNrKHQ6IERpc2NvdmVyZWRUd2Vhayk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnN0IGlkID0gdC5tYW5pZmVzdC5pZDtcclxuICBjb25zdCByZXBvID0gdC5tYW5pZmVzdC5naXRodWJSZXBvO1xyXG4gIGNvbnN0IHN0YXRlID0gcmVhZFN0YXRlKCk7XHJcbiAgY29uc3QgY2FjaGVkID0gc3RhdGUudHdlYWtVcGRhdGVDaGVja3M/LltpZF07XHJcbiAgaWYgKFxyXG4gICAgY2FjaGVkICYmXHJcbiAgICBjYWNoZWQucmVwbyA9PT0gcmVwbyAmJlxyXG4gICAgY2FjaGVkLmN1cnJlbnRWZXJzaW9uID09PSB0Lm1hbmlmZXN0LnZlcnNpb24gJiZcclxuICAgIERhdGUubm93KCkgLSBEYXRlLnBhcnNlKGNhY2hlZC5jaGVja2VkQXQpIDwgVVBEQVRFX0NIRUNLX0lOVEVSVkFMX01TXHJcbiAgKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBuZXh0ID0gYXdhaXQgZmV0Y2hMYXRlc3RSZWxlYXNlKHJlcG8sIHQubWFuaWZlc3QudmVyc2lvbik7XHJcbiAgY29uc3QgbGF0ZXN0VmVyc2lvbiA9IG5leHQubGF0ZXN0VGFnID8gbm9ybWFsaXplVmVyc2lvbihuZXh0LmxhdGVzdFRhZykgOiBudWxsO1xyXG4gIGNvbnN0IGNoZWNrOiBUd2Vha1VwZGF0ZUNoZWNrID0ge1xyXG4gICAgY2hlY2tlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICByZXBvLFxyXG4gICAgY3VycmVudFZlcnNpb246IHQubWFuaWZlc3QudmVyc2lvbixcclxuICAgIGxhdGVzdFZlcnNpb24sXHJcbiAgICBsYXRlc3RUYWc6IG5leHQubGF0ZXN0VGFnLFxuICAgIHJlbGVhc2VVcmw6IG5leHQucmVsZWFzZVVybCxcbiAgICB1cGRhdGVBdmFpbGFibGU6IGxhdGVzdFZlcnNpb25cbiAgICAgID8gKGNvbXBhcmVWZXJzaW9ucyhsYXRlc3RWZXJzaW9uLCBub3JtYWxpemVWZXJzaW9uKHQubWFuaWZlc3QudmVyc2lvbikpID8/IDApID4gMFxuICAgICAgOiBmYWxzZSxcbiAgICAuLi4obmV4dC5lcnJvciA/IHsgZXJyb3I6IG5leHQuZXJyb3IgfSA6IHt9KSxcclxuICB9O1xyXG4gIHN0YXRlLnR3ZWFrVXBkYXRlQ2hlY2tzID8/PSB7fTtcclxuICBzdGF0ZS50d2Vha1VwZGF0ZUNoZWNrc1tpZF0gPSBjaGVjaztcclxuICB3cml0ZVN0YXRlKHN0YXRlKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hMYXRlc3RSZWxlYXNlKFxyXG4gIHJlcG86IHN0cmluZyxcclxuICBjdXJyZW50VmVyc2lvbjogc3RyaW5nLFxyXG4pOiBQcm9taXNlPHsgbGF0ZXN0VGFnOiBzdHJpbmcgfCBudWxsOyByZWxlYXNlVXJsOiBzdHJpbmcgfCBudWxsOyByZWxlYXNlTm90ZXM6IHN0cmluZyB8IG51bGw7IGVycm9yPzogc3RyaW5nIH0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcclxuICAgIGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgODAwMCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy8ke3JlcG99L3JlbGVhc2VzL2xhdGVzdGAsIHtcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICBcIkFjY2VwdFwiOiBcImFwcGxpY2F0aW9uL3ZuZC5naXRodWIranNvblwiLFxyXG4gICAgICAgICAgXCJVc2VyLUFnZW50XCI6IGBjb2RleC1wbHVzcGx1cy8ke2N1cnJlbnRWZXJzaW9ufWAsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsLFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKHJlcy5zdGF0dXMgPT09IDQwNCkge1xyXG4gICAgICAgIHJldHVybiB7IGxhdGVzdFRhZzogbnVsbCwgcmVsZWFzZVVybDogbnVsbCwgcmVsZWFzZU5vdGVzOiBudWxsLCBlcnJvcjogXCJubyBHaXRIdWIgcmVsZWFzZSBmb3VuZFwiIH07XHJcbiAgICAgIH1cclxuICAgICAgaWYgKCFyZXMub2spIHtcclxuICAgICAgICByZXR1cm4geyBsYXRlc3RUYWc6IG51bGwsIHJlbGVhc2VVcmw6IG51bGwsIHJlbGVhc2VOb3RlczogbnVsbCwgZXJyb3I6IGBHaXRIdWIgcmV0dXJuZWQgJHtyZXMuc3RhdHVzfWAgfTtcclxuICAgICAgfVxyXG4gICAgICBjb25zdCBib2R5ID0gYXdhaXQgcmVzLmpzb24oKSBhcyB7IHRhZ19uYW1lPzogc3RyaW5nOyBodG1sX3VybD86IHN0cmluZzsgYm9keT86IHN0cmluZyB9O1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGxhdGVzdFRhZzogYm9keS50YWdfbmFtZSA/PyBudWxsLFxyXG4gICAgICAgIHJlbGVhc2VVcmw6IGJvZHkuaHRtbF91cmwgPz8gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3JlcG99L3JlbGVhc2VzYCxcclxuICAgICAgICByZWxlYXNlTm90ZXM6IGJvZHkuYm9keSA/PyBudWxsLFxyXG4gICAgICB9O1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGUpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGxhdGVzdFRhZzogbnVsbCxcclxuICAgICAgcmVsZWFzZVVybDogbnVsbCxcclxuICAgICAgcmVsZWFzZU5vdGVzOiBudWxsLFxyXG4gICAgICBlcnJvcjogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpLFxyXG4gICAgfTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJyb2FkY2FzdFJlbG9hZCgpOiB2b2lkIHtcbiAgY29uc3QgcGF5bG9hZCA9IHtcclxuICAgIGF0OiBEYXRlLm5vdygpLFxyXG4gICAgdHdlYWtzOiB0d2Vha1N0YXRlLmRpc2NvdmVyZWQubWFwKCh0KSA9PiB0Lm1hbmlmZXN0LmlkKSxcclxuICB9O1xyXG4gIGZvciAoY29uc3Qgd2Mgb2Ygd2ViQ29udGVudHMuZ2V0QWxsV2ViQ29udGVudHMoKSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgd2Muc2VuZChcImNvZGV4cHA6dHdlYWtzLWNoYW5nZWRcIiwgcGF5bG9hZCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgIGxvZyhcIndhcm5cIiwgXCJicm9hZGNhc3Qgc2VuZCBmYWlsZWQ6XCIsIGUpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbWFrZUxvZ2dlcihzY29wZTogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGRlYnVnOiAoLi4uYTogdW5rbm93bltdKSA9PiBsb2coXCJpbmZvXCIsIGBbJHtzY29wZX1dYCwgLi4uYSksXHJcbiAgICBpbmZvOiAoLi4uYTogdW5rbm93bltdKSA9PiBsb2coXCJpbmZvXCIsIGBbJHtzY29wZX1dYCwgLi4uYSksXHJcbiAgICB3YXJuOiAoLi4uYTogdW5rbm93bltdKSA9PiBsb2coXCJ3YXJuXCIsIGBbJHtzY29wZX1dYCwgLi4uYSksXHJcbiAgICBlcnJvcjogKC4uLmE6IHVua25vd25bXSkgPT4gbG9nKFwiZXJyb3JcIiwgYFske3Njb3BlfV1gLCAuLi5hKSxcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBtYWtlTWFpbklwYyhpZDogc3RyaW5nLCBkaXNwb3NlcnM6IERpc3Bvc2VyW10pIHtcbiAgcmV0dXJuIGNyZWF0ZU1haW5JcGMoaWQsIGlwY01haW4sIGRpc3Bvc2VycywgcmVnaXN0ZXJlZE1haW5IYW5kbGVzKTtcbn1cblxyXG5mdW5jdGlvbiBtYWtlTWFpbkZzKGlkOiBzdHJpbmcpIHtcbiAgY29uc3QgZGlyID0gcmVzb2x2ZSh1c2VyUm9vdCEsIFwidHdlYWstZGF0YVwiLCBpZCk7XG4gIG1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICBjb25zdCBmcyA9IHJlcXVpcmUoXCJub2RlOmZzL3Byb21pc2VzXCIpIGFzIHR5cGVvZiBpbXBvcnQoXCJub2RlOmZzL3Byb21pc2VzXCIpO1xuICByZXR1cm4ge1xuICAgIGRhdGFEaXI6IGRpcixcbiAgICByZWFkOiAocDogc3RyaW5nKSA9PlxuICAgICAgZnMucmVhZEZpbGUocmVzb2x2ZUluc2lkZShkaXIsIHAsIHsgbXVzdEV4aXN0OiB0cnVlLCByZXF1aXJlRmlsZTogdHJ1ZSB9KSwgXCJ1dGY4XCIpLFxuICAgIHdyaXRlOiAocDogc3RyaW5nLCBjOiBzdHJpbmcpID0+XG4gICAgICBmcy53cml0ZUZpbGUocmVzb2x2ZUluc2lkZShkaXIsIHApLCBjLCBcInV0ZjhcIiksXG4gICAgZXhpc3RzOiBhc3luYyAocDogc3RyaW5nKSA9PiB7XG4gICAgICBjb25zdCBmdWxsID0gcmVzb2x2ZUluc2lkZShkaXIsIHApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZnMuYWNjZXNzKGZ1bGwpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgfTtcclxufVxyXG5cclxuLy8gVG91Y2ggQnJvd3NlcldpbmRvdyB0byBrZWVwIGl0cyBpbXBvcnQgXHUyMDE0IG9sZGVyIEVsZWN0cm9uIGxpbnQgcnVsZXMuXHJcbnZvaWQgQnJvd3NlcldpbmRvdztcclxuIiwgIi8qISBjaG9raWRhciAtIE1JVCBMaWNlbnNlIChjKSAyMDEyIFBhdWwgTWlsbGVyIChwYXVsbWlsbHIuY29tKSAqL1xuaW1wb3J0IHsgc3RhdCBhcyBzdGF0Y2IgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBzdGF0LCByZWFkZGlyIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCAqIGFzIHN5c1BhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyByZWFkZGlycCB9IGZyb20gJ3JlYWRkaXJwJztcbmltcG9ydCB7IE5vZGVGc0hhbmRsZXIsIEVWRU5UUyBhcyBFViwgaXNXaW5kb3dzLCBpc0lCTWksIEVNUFRZX0ZOLCBTVFJfQ0xPU0UsIFNUUl9FTkQsIH0gZnJvbSAnLi9oYW5kbGVyLmpzJztcbmNvbnN0IFNMQVNIID0gJy8nO1xuY29uc3QgU0xBU0hfU0xBU0ggPSAnLy8nO1xuY29uc3QgT05FX0RPVCA9ICcuJztcbmNvbnN0IFRXT19ET1RTID0gJy4uJztcbmNvbnN0IFNUUklOR19UWVBFID0gJ3N0cmluZyc7XG5jb25zdCBCQUNLX1NMQVNIX1JFID0gL1xcXFwvZztcbmNvbnN0IERPVUJMRV9TTEFTSF9SRSA9IC9cXC9cXC8vO1xuY29uc3QgRE9UX1JFID0gL1xcLi4qXFwuKHN3W3B4XSkkfH4kfFxcLnN1YmwuKlxcLnRtcC87XG5jb25zdCBSRVBMQUNFUl9SRSA9IC9eXFwuWy9cXFxcXS87XG5mdW5jdGlvbiBhcnJpZnkoaXRlbSkge1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGl0ZW0pID8gaXRlbSA6IFtpdGVtXTtcbn1cbmNvbnN0IGlzTWF0Y2hlck9iamVjdCA9IChtYXRjaGVyKSA9PiB0eXBlb2YgbWF0Y2hlciA9PT0gJ29iamVjdCcgJiYgbWF0Y2hlciAhPT0gbnVsbCAmJiAhKG1hdGNoZXIgaW5zdGFuY2VvZiBSZWdFeHApO1xuZnVuY3Rpb24gY3JlYXRlUGF0dGVybihtYXRjaGVyKSB7XG4gICAgaWYgKHR5cGVvZiBtYXRjaGVyID09PSAnZnVuY3Rpb24nKVxuICAgICAgICByZXR1cm4gbWF0Y2hlcjtcbiAgICBpZiAodHlwZW9mIG1hdGNoZXIgPT09ICdzdHJpbmcnKVxuICAgICAgICByZXR1cm4gKHN0cmluZykgPT4gbWF0Y2hlciA9PT0gc3RyaW5nO1xuICAgIGlmIChtYXRjaGVyIGluc3RhbmNlb2YgUmVnRXhwKVxuICAgICAgICByZXR1cm4gKHN0cmluZykgPT4gbWF0Y2hlci50ZXN0KHN0cmluZyk7XG4gICAgaWYgKHR5cGVvZiBtYXRjaGVyID09PSAnb2JqZWN0JyAmJiBtYXRjaGVyICE9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiAoc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBpZiAobWF0Y2hlci5wYXRoID09PSBzdHJpbmcpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICBpZiAobWF0Y2hlci5yZWN1cnNpdmUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWxhdGl2ZSA9IHN5c1BhdGgucmVsYXRpdmUobWF0Y2hlci5wYXRoLCBzdHJpbmcpO1xuICAgICAgICAgICAgICAgIGlmICghcmVsYXRpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gIXJlbGF0aXZlLnN0YXJ0c1dpdGgoJy4uJykgJiYgIXN5c1BhdGguaXNBYnNvbHV0ZShyZWxhdGl2ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiAoKSA9PiBmYWxzZTtcbn1cbmZ1bmN0aW9uIG5vcm1hbGl6ZVBhdGgocGF0aCkge1xuICAgIGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignc3RyaW5nIGV4cGVjdGVkJyk7XG4gICAgcGF0aCA9IHN5c1BhdGgubm9ybWFsaXplKHBhdGgpO1xuICAgIHBhdGggPSBwYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcbiAgICBsZXQgcHJlcGVuZCA9IGZhbHNlO1xuICAgIGlmIChwYXRoLnN0YXJ0c1dpdGgoJy8vJykpXG4gICAgICAgIHByZXBlbmQgPSB0cnVlO1xuICAgIGNvbnN0IERPVUJMRV9TTEFTSF9SRSA9IC9cXC9cXC8vO1xuICAgIHdoaWxlIChwYXRoLm1hdGNoKERPVUJMRV9TTEFTSF9SRSkpXG4gICAgICAgIHBhdGggPSBwYXRoLnJlcGxhY2UoRE9VQkxFX1NMQVNIX1JFLCAnLycpO1xuICAgIGlmIChwcmVwZW5kKVxuICAgICAgICBwYXRoID0gJy8nICsgcGF0aDtcbiAgICByZXR1cm4gcGF0aDtcbn1cbmZ1bmN0aW9uIG1hdGNoUGF0dGVybnMocGF0dGVybnMsIHRlc3RTdHJpbmcsIHN0YXRzKSB7XG4gICAgY29uc3QgcGF0aCA9IG5vcm1hbGl6ZVBhdGgodGVzdFN0cmluZyk7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhdHRlcm5zLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gcGF0dGVybnNbaW5kZXhdO1xuICAgICAgICBpZiAocGF0dGVybihwYXRoLCBzdGF0cykpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cbmZ1bmN0aW9uIGFueW1hdGNoKG1hdGNoZXJzLCB0ZXN0U3RyaW5nKSB7XG4gICAgaWYgKG1hdGNoZXJzID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYW55bWF0Y2g6IHNwZWNpZnkgZmlyc3QgYXJndW1lbnQnKTtcbiAgICB9XG4gICAgLy8gRWFybHkgY2FjaGUgZm9yIG1hdGNoZXJzLlxuICAgIGNvbnN0IG1hdGNoZXJzQXJyYXkgPSBhcnJpZnkobWF0Y2hlcnMpO1xuICAgIGNvbnN0IHBhdHRlcm5zID0gbWF0Y2hlcnNBcnJheS5tYXAoKG1hdGNoZXIpID0+IGNyZWF0ZVBhdHRlcm4obWF0Y2hlcikpO1xuICAgIGlmICh0ZXN0U3RyaW5nID09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuICh0ZXN0U3RyaW5nLCBzdGF0cykgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoUGF0dGVybnMocGF0dGVybnMsIHRlc3RTdHJpbmcsIHN0YXRzKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIG1hdGNoUGF0dGVybnMocGF0dGVybnMsIHRlc3RTdHJpbmcpO1xufVxuY29uc3QgdW5pZnlQYXRocyA9IChwYXRoc18pID0+IHtcbiAgICBjb25zdCBwYXRocyA9IGFycmlmeShwYXRoc18pLmZsYXQoKTtcbiAgICBpZiAoIXBhdGhzLmV2ZXJ5KChwKSA9PiB0eXBlb2YgcCA9PT0gU1RSSU5HX1RZUEUpKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYE5vbi1zdHJpbmcgcHJvdmlkZWQgYXMgd2F0Y2ggcGF0aDogJHtwYXRoc31gKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGhzLm1hcChub3JtYWxpemVQYXRoVG9Vbml4KTtcbn07XG4vLyBJZiBTTEFTSF9TTEFTSCBvY2N1cnMgYXQgdGhlIGJlZ2lubmluZyBvZiBwYXRoLCBpdCBpcyBub3QgcmVwbGFjZWRcbi8vICAgICBiZWNhdXNlIFwiLy9TdG9yYWdlUEMvRHJpdmVQb29sL01vdmllc1wiIGlzIGEgdmFsaWQgbmV0d29yayBwYXRoXG5jb25zdCB0b1VuaXggPSAoc3RyaW5nKSA9PiB7XG4gICAgbGV0IHN0ciA9IHN0cmluZy5yZXBsYWNlKEJBQ0tfU0xBU0hfUkUsIFNMQVNIKTtcbiAgICBsZXQgcHJlcGVuZCA9IGZhbHNlO1xuICAgIGlmIChzdHIuc3RhcnRzV2l0aChTTEFTSF9TTEFTSCkpIHtcbiAgICAgICAgcHJlcGVuZCA9IHRydWU7XG4gICAgfVxuICAgIHdoaWxlIChzdHIubWF0Y2goRE9VQkxFX1NMQVNIX1JFKSkge1xuICAgICAgICBzdHIgPSBzdHIucmVwbGFjZShET1VCTEVfU0xBU0hfUkUsIFNMQVNIKTtcbiAgICB9XG4gICAgaWYgKHByZXBlbmQpIHtcbiAgICAgICAgc3RyID0gU0xBU0ggKyBzdHI7XG4gICAgfVxuICAgIHJldHVybiBzdHI7XG59O1xuLy8gT3VyIHZlcnNpb24gb2YgdXBhdGgubm9ybWFsaXplXG4vLyBUT0RPOiB0aGlzIGlzIG5vdCBlcXVhbCB0byBwYXRoLW5vcm1hbGl6ZSBtb2R1bGUgLSBpbnZlc3RpZ2F0ZSB3aHlcbmNvbnN0IG5vcm1hbGl6ZVBhdGhUb1VuaXggPSAocGF0aCkgPT4gdG9Vbml4KHN5c1BhdGgubm9ybWFsaXplKHRvVW5peChwYXRoKSkpO1xuLy8gVE9ETzogcmVmYWN0b3JcbmNvbnN0IG5vcm1hbGl6ZUlnbm9yZWQgPSAoY3dkID0gJycpID0+IChwYXRoKSA9PiB7XG4gICAgaWYgKHR5cGVvZiBwYXRoID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gbm9ybWFsaXplUGF0aFRvVW5peChzeXNQYXRoLmlzQWJzb2x1dGUocGF0aCkgPyBwYXRoIDogc3lzUGF0aC5qb2luKGN3ZCwgcGF0aCkpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgfVxufTtcbmNvbnN0IGdldEFic29sdXRlUGF0aCA9IChwYXRoLCBjd2QpID0+IHtcbiAgICBpZiAoc3lzUGF0aC5pc0Fic29sdXRlKHBhdGgpKSB7XG4gICAgICAgIHJldHVybiBwYXRoO1xuICAgIH1cbiAgICByZXR1cm4gc3lzUGF0aC5qb2luKGN3ZCwgcGF0aCk7XG59O1xuY29uc3QgRU1QVFlfU0VUID0gT2JqZWN0LmZyZWV6ZShuZXcgU2V0KCkpO1xuLyoqXG4gKiBEaXJlY3RvcnkgZW50cnkuXG4gKi9cbmNsYXNzIERpckVudHJ5IHtcbiAgICBjb25zdHJ1Y3RvcihkaXIsIHJlbW92ZVdhdGNoZXIpIHtcbiAgICAgICAgdGhpcy5wYXRoID0gZGlyO1xuICAgICAgICB0aGlzLl9yZW1vdmVXYXRjaGVyID0gcmVtb3ZlV2F0Y2hlcjtcbiAgICAgICAgdGhpcy5pdGVtcyA9IG5ldyBTZXQoKTtcbiAgICB9XG4gICAgYWRkKGl0ZW0pIHtcbiAgICAgICAgY29uc3QgeyBpdGVtcyB9ID0gdGhpcztcbiAgICAgICAgaWYgKCFpdGVtcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaWYgKGl0ZW0gIT09IE9ORV9ET1QgJiYgaXRlbSAhPT0gVFdPX0RPVFMpXG4gICAgICAgICAgICBpdGVtcy5hZGQoaXRlbSk7XG4gICAgfVxuICAgIGFzeW5jIHJlbW92ZShpdGVtKSB7XG4gICAgICAgIGNvbnN0IHsgaXRlbXMgfSA9IHRoaXM7XG4gICAgICAgIGlmICghaXRlbXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGl0ZW1zLmRlbGV0ZShpdGVtKTtcbiAgICAgICAgaWYgKGl0ZW1zLnNpemUgPiAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBkaXIgPSB0aGlzLnBhdGg7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCByZWFkZGlyKGRpcik7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3JlbW92ZVdhdGNoZXIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9yZW1vdmVXYXRjaGVyKHN5c1BhdGguZGlybmFtZShkaXIpLCBzeXNQYXRoLmJhc2VuYW1lKGRpcikpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGhhcyhpdGVtKSB7XG4gICAgICAgIGNvbnN0IHsgaXRlbXMgfSA9IHRoaXM7XG4gICAgICAgIGlmICghaXRlbXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHJldHVybiBpdGVtcy5oYXMoaXRlbSk7XG4gICAgfVxuICAgIGdldENoaWxkcmVuKCkge1xuICAgICAgICBjb25zdCB7IGl0ZW1zIH0gPSB0aGlzO1xuICAgICAgICBpZiAoIWl0ZW1zKVxuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICByZXR1cm4gWy4uLml0ZW1zLnZhbHVlcygpXTtcbiAgICB9XG4gICAgZGlzcG9zZSgpIHtcbiAgICAgICAgdGhpcy5pdGVtcy5jbGVhcigpO1xuICAgICAgICB0aGlzLnBhdGggPSAnJztcbiAgICAgICAgdGhpcy5fcmVtb3ZlV2F0Y2hlciA9IEVNUFRZX0ZOO1xuICAgICAgICB0aGlzLml0ZW1zID0gRU1QVFlfU0VUO1xuICAgICAgICBPYmplY3QuZnJlZXplKHRoaXMpO1xuICAgIH1cbn1cbmNvbnN0IFNUQVRfTUVUSE9EX0YgPSAnc3RhdCc7XG5jb25zdCBTVEFUX01FVEhPRF9MID0gJ2xzdGF0JztcbmV4cG9ydCBjbGFzcyBXYXRjaEhlbHBlciB7XG4gICAgY29uc3RydWN0b3IocGF0aCwgZm9sbG93LCBmc3cpIHtcbiAgICAgICAgdGhpcy5mc3cgPSBmc3c7XG4gICAgICAgIGNvbnN0IHdhdGNoUGF0aCA9IHBhdGg7XG4gICAgICAgIHRoaXMucGF0aCA9IHBhdGggPSBwYXRoLnJlcGxhY2UoUkVQTEFDRVJfUkUsICcnKTtcbiAgICAgICAgdGhpcy53YXRjaFBhdGggPSB3YXRjaFBhdGg7XG4gICAgICAgIHRoaXMuZnVsbFdhdGNoUGF0aCA9IHN5c1BhdGgucmVzb2x2ZSh3YXRjaFBhdGgpO1xuICAgICAgICB0aGlzLmRpclBhcnRzID0gW107XG4gICAgICAgIHRoaXMuZGlyUGFydHMuZm9yRWFjaCgocGFydHMpID0+IHtcbiAgICAgICAgICAgIGlmIChwYXJ0cy5sZW5ndGggPiAxKVxuICAgICAgICAgICAgICAgIHBhcnRzLnBvcCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5mb2xsb3dTeW1saW5rcyA9IGZvbGxvdztcbiAgICAgICAgdGhpcy5zdGF0TWV0aG9kID0gZm9sbG93ID8gU1RBVF9NRVRIT0RfRiA6IFNUQVRfTUVUSE9EX0w7XG4gICAgfVxuICAgIGVudHJ5UGF0aChlbnRyeSkge1xuICAgICAgICByZXR1cm4gc3lzUGF0aC5qb2luKHRoaXMud2F0Y2hQYXRoLCBzeXNQYXRoLnJlbGF0aXZlKHRoaXMud2F0Y2hQYXRoLCBlbnRyeS5mdWxsUGF0aCkpO1xuICAgIH1cbiAgICBmaWx0ZXJQYXRoKGVudHJ5KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHMgfSA9IGVudHJ5O1xuICAgICAgICBpZiAoc3RhdHMgJiYgc3RhdHMuaXNTeW1ib2xpY0xpbmsoKSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbHRlckRpcihlbnRyeSk7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkUGF0aCA9IHRoaXMuZW50cnlQYXRoKGVudHJ5KTtcbiAgICAgICAgLy8gVE9ETzogd2hhdCBpZiBzdGF0cyBpcyB1bmRlZmluZWQ/IHJlbW92ZSAhXG4gICAgICAgIHJldHVybiB0aGlzLmZzdy5faXNudElnbm9yZWQocmVzb2x2ZWRQYXRoLCBzdGF0cykgJiYgdGhpcy5mc3cuX2hhc1JlYWRQZXJtaXNzaW9ucyhzdGF0cyk7XG4gICAgfVxuICAgIGZpbHRlckRpcihlbnRyeSkge1xuICAgICAgICByZXR1cm4gdGhpcy5mc3cuX2lzbnRJZ25vcmVkKHRoaXMuZW50cnlQYXRoKGVudHJ5KSwgZW50cnkuc3RhdHMpO1xuICAgIH1cbn1cbi8qKlxuICogV2F0Y2hlcyBmaWxlcyAmIGRpcmVjdG9yaWVzIGZvciBjaGFuZ2VzLiBFbWl0dGVkIGV2ZW50czpcbiAqIGBhZGRgLCBgYWRkRGlyYCwgYGNoYW5nZWAsIGB1bmxpbmtgLCBgdW5saW5rRGlyYCwgYGFsbGAsIGBlcnJvcmBcbiAqXG4gKiAgICAgbmV3IEZTV2F0Y2hlcigpXG4gKiAgICAgICAuYWRkKGRpcmVjdG9yaWVzKVxuICogICAgICAgLm9uKCdhZGQnLCBwYXRoID0+IGxvZygnRmlsZScsIHBhdGgsICd3YXMgYWRkZWQnKSlcbiAqL1xuZXhwb3J0IGNsYXNzIEZTV2F0Y2hlciBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG4gICAgLy8gTm90IGluZGVudGluZyBtZXRob2RzIGZvciBoaXN0b3J5IHNha2U7IGZvciBub3cuXG4gICAgY29uc3RydWN0b3IoX29wdHMgPSB7fSkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLmNsb3NlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLl9jbG9zZXJzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLl9pZ25vcmVkUGF0aHMgPSBuZXcgU2V0KCk7XG4gICAgICAgIHRoaXMuX3Rocm90dGxlZCA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5fc3RyZWFtcyA9IG5ldyBTZXQoKTtcbiAgICAgICAgdGhpcy5fc3ltbGlua1BhdGhzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLl93YXRjaGVkID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLl9wZW5kaW5nV3JpdGVzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLl9wZW5kaW5nVW5saW5rcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5fcmVhZHlDb3VudCA9IDA7XG4gICAgICAgIHRoaXMuX3JlYWR5RW1pdHRlZCA9IGZhbHNlO1xuICAgICAgICBjb25zdCBhd2YgPSBfb3B0cy5hd2FpdFdyaXRlRmluaXNoO1xuICAgICAgICBjb25zdCBERUZfQVdGID0geyBzdGFiaWxpdHlUaHJlc2hvbGQ6IDIwMDAsIHBvbGxJbnRlcnZhbDogMTAwIH07XG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XG4gICAgICAgICAgICAvLyBEZWZhdWx0c1xuICAgICAgICAgICAgcGVyc2lzdGVudDogdHJ1ZSxcbiAgICAgICAgICAgIGlnbm9yZUluaXRpYWw6IGZhbHNlLFxuICAgICAgICAgICAgaWdub3JlUGVybWlzc2lvbkVycm9yczogZmFsc2UsXG4gICAgICAgICAgICBpbnRlcnZhbDogMTAwLFxuICAgICAgICAgICAgYmluYXJ5SW50ZXJ2YWw6IDMwMCxcbiAgICAgICAgICAgIGZvbGxvd1N5bWxpbmtzOiB0cnVlLFxuICAgICAgICAgICAgdXNlUG9sbGluZzogZmFsc2UsXG4gICAgICAgICAgICAvLyB1c2VBc3luYzogZmFsc2UsXG4gICAgICAgICAgICBhdG9taWM6IHRydWUsIC8vIE5PVEU6IG92ZXJ3cml0dGVuIGxhdGVyIChkZXBlbmRzIG9uIHVzZVBvbGxpbmcpXG4gICAgICAgICAgICAuLi5fb3B0cyxcbiAgICAgICAgICAgIC8vIENoYW5nZSBmb3JtYXRcbiAgICAgICAgICAgIGlnbm9yZWQ6IF9vcHRzLmlnbm9yZWQgPyBhcnJpZnkoX29wdHMuaWdub3JlZCkgOiBhcnJpZnkoW10pLFxuICAgICAgICAgICAgYXdhaXRXcml0ZUZpbmlzaDogYXdmID09PSB0cnVlID8gREVGX0FXRiA6IHR5cGVvZiBhd2YgPT09ICdvYmplY3QnID8geyAuLi5ERUZfQVdGLCAuLi5hd2YgfSA6IGZhbHNlLFxuICAgICAgICB9O1xuICAgICAgICAvLyBBbHdheXMgZGVmYXVsdCB0byBwb2xsaW5nIG9uIElCTSBpIGJlY2F1c2UgZnMud2F0Y2goKSBpcyBub3QgYXZhaWxhYmxlIG9uIElCTSBpLlxuICAgICAgICBpZiAoaXNJQk1pKVxuICAgICAgICAgICAgb3B0cy51c2VQb2xsaW5nID0gdHJ1ZTtcbiAgICAgICAgLy8gRWRpdG9yIGF0b21pYyB3cml0ZSBub3JtYWxpemF0aW9uIGVuYWJsZWQgYnkgZGVmYXVsdCB3aXRoIGZzLndhdGNoXG4gICAgICAgIGlmIChvcHRzLmF0b21pYyA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgb3B0cy5hdG9taWMgPSAhb3B0cy51c2VQb2xsaW5nO1xuICAgICAgICAvLyBvcHRzLmF0b21pYyA9IHR5cGVvZiBfb3B0cy5hdG9taWMgPT09ICdudW1iZXInID8gX29wdHMuYXRvbWljIDogMTAwO1xuICAgICAgICAvLyBHbG9iYWwgb3ZlcnJpZGUuIFVzZWZ1bCBmb3IgZGV2ZWxvcGVycywgd2hvIG5lZWQgdG8gZm9yY2UgcG9sbGluZyBmb3IgYWxsXG4gICAgICAgIC8vIGluc3RhbmNlcyBvZiBjaG9raWRhciwgcmVnYXJkbGVzcyBvZiB1c2FnZSAvIGRlcGVuZGVuY3kgZGVwdGhcbiAgICAgICAgY29uc3QgZW52UG9sbCA9IHByb2Nlc3MuZW52LkNIT0tJREFSX1VTRVBPTExJTkc7XG4gICAgICAgIGlmIChlbnZQb2xsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGVudkxvd2VyID0gZW52UG9sbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgaWYgKGVudkxvd2VyID09PSAnZmFsc2UnIHx8IGVudkxvd2VyID09PSAnMCcpXG4gICAgICAgICAgICAgICAgb3B0cy51c2VQb2xsaW5nID0gZmFsc2U7XG4gICAgICAgICAgICBlbHNlIGlmIChlbnZMb3dlciA9PT0gJ3RydWUnIHx8IGVudkxvd2VyID09PSAnMScpXG4gICAgICAgICAgICAgICAgb3B0cy51c2VQb2xsaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBvcHRzLnVzZVBvbGxpbmcgPSAhIWVudkxvd2VyO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVudkludGVydmFsID0gcHJvY2Vzcy5lbnYuQ0hPS0lEQVJfSU5URVJWQUw7XG4gICAgICAgIGlmIChlbnZJbnRlcnZhbClcbiAgICAgICAgICAgIG9wdHMuaW50ZXJ2YWwgPSBOdW1iZXIucGFyc2VJbnQoZW52SW50ZXJ2YWwsIDEwKTtcbiAgICAgICAgLy8gVGhpcyBpcyBkb25lIHRvIGVtaXQgcmVhZHkgb25seSBvbmNlLCBidXQgZWFjaCAnYWRkJyB3aWxsIGluY3JlYXNlIHRoYXQ/XG4gICAgICAgIGxldCByZWFkeUNhbGxzID0gMDtcbiAgICAgICAgdGhpcy5fZW1pdFJlYWR5ID0gKCkgPT4ge1xuICAgICAgICAgICAgcmVhZHlDYWxscysrO1xuICAgICAgICAgICAgaWYgKHJlYWR5Q2FsbHMgPj0gdGhpcy5fcmVhZHlDb3VudCkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2VtaXRSZWFkeSA9IEVNUFRZX0ZOO1xuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWR5RW1pdHRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgLy8gdXNlIHByb2Nlc3MubmV4dFRpY2sgdG8gYWxsb3cgdGltZSBmb3IgbGlzdGVuZXIgdG8gYmUgYm91bmRcbiAgICAgICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKCgpID0+IHRoaXMuZW1pdChFVi5SRUFEWSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLl9lbWl0UmF3ID0gKC4uLmFyZ3MpID0+IHRoaXMuZW1pdChFVi5SQVcsIC4uLmFyZ3MpO1xuICAgICAgICB0aGlzLl9ib3VuZFJlbW92ZSA9IHRoaXMuX3JlbW92ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSBvcHRzO1xuICAgICAgICB0aGlzLl9ub2RlRnNIYW5kbGVyID0gbmV3IE5vZGVGc0hhbmRsZXIodGhpcyk7XG4gICAgICAgIC8vIFlvdVx1MjAxOXJlIGZyb3plbiB3aGVuIHlvdXIgaGVhcnRcdTIwMTlzIG5vdCBvcGVuLlxuICAgICAgICBPYmplY3QuZnJlZXplKG9wdHMpO1xuICAgIH1cbiAgICBfYWRkSWdub3JlZFBhdGgobWF0Y2hlcikge1xuICAgICAgICBpZiAoaXNNYXRjaGVyT2JqZWN0KG1hdGNoZXIpKSB7XG4gICAgICAgICAgICAvLyByZXR1cm4gZWFybHkgaWYgd2UgYWxyZWFkeSBoYXZlIGEgZGVlcGx5IGVxdWFsIG1hdGNoZXIgb2JqZWN0XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlnbm9yZWQgb2YgdGhpcy5faWdub3JlZFBhdGhzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzTWF0Y2hlck9iamVjdChpZ25vcmVkKSAmJlxuICAgICAgICAgICAgICAgICAgICBpZ25vcmVkLnBhdGggPT09IG1hdGNoZXIucGF0aCAmJlxuICAgICAgICAgICAgICAgICAgICBpZ25vcmVkLnJlY3Vyc2l2ZSA9PT0gbWF0Y2hlci5yZWN1cnNpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9pZ25vcmVkUGF0aHMuYWRkKG1hdGNoZXIpO1xuICAgIH1cbiAgICBfcmVtb3ZlSWdub3JlZFBhdGgobWF0Y2hlcikge1xuICAgICAgICB0aGlzLl9pZ25vcmVkUGF0aHMuZGVsZXRlKG1hdGNoZXIpO1xuICAgICAgICAvLyBub3cgZmluZCBhbnkgbWF0Y2hlciBvYmplY3RzIHdpdGggdGhlIG1hdGNoZXIgYXMgcGF0aFxuICAgICAgICBpZiAodHlwZW9mIG1hdGNoZXIgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlnbm9yZWQgb2YgdGhpcy5faWdub3JlZFBhdGhzKSB7XG4gICAgICAgICAgICAgICAgLy8gVE9ETyAoNDMwODFqKTogbWFrZSB0aGlzIG1vcmUgZWZmaWNpZW50LlxuICAgICAgICAgICAgICAgIC8vIHByb2JhYmx5IGp1c3QgbWFrZSBhIGB0aGlzLl9pZ25vcmVkRGlyZWN0b3JpZXNgIG9yIHNvbWVcbiAgICAgICAgICAgICAgICAvLyBzdWNoIHRoaW5nLlxuICAgICAgICAgICAgICAgIGlmIChpc01hdGNoZXJPYmplY3QoaWdub3JlZCkgJiYgaWdub3JlZC5wYXRoID09PSBtYXRjaGVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2lnbm9yZWRQYXRocy5kZWxldGUoaWdub3JlZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8vIFB1YmxpYyBtZXRob2RzXG4gICAgLyoqXG4gICAgICogQWRkcyBwYXRocyB0byBiZSB3YXRjaGVkIG9uIGFuIGV4aXN0aW5nIEZTV2F0Y2hlciBpbnN0YW5jZS5cbiAgICAgKiBAcGFyYW0gcGF0aHNfIGZpbGUgb3IgZmlsZSBsaXN0LiBPdGhlciBhcmd1bWVudHMgYXJlIHVudXNlZFxuICAgICAqL1xuICAgIGFkZChwYXRoc18sIF9vcmlnQWRkLCBfaW50ZXJuYWwpIHtcbiAgICAgICAgY29uc3QgeyBjd2QgfSA9IHRoaXMub3B0aW9ucztcbiAgICAgICAgdGhpcy5jbG9zZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fY2xvc2VQcm9taXNlID0gdW5kZWZpbmVkO1xuICAgICAgICBsZXQgcGF0aHMgPSB1bmlmeVBhdGhzKHBhdGhzXyk7XG4gICAgICAgIGlmIChjd2QpIHtcbiAgICAgICAgICAgIHBhdGhzID0gcGF0aHMubWFwKChwYXRoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYWJzUGF0aCA9IGdldEFic29sdXRlUGF0aChwYXRoLCBjd2QpO1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGBwYXRoYCBpbnN0ZWFkIG9mIGBhYnNQYXRoYCBiZWNhdXNlIHRoZSBjd2QgcG9ydGlvbiBjYW4ndCBiZSBhIGdsb2JcbiAgICAgICAgICAgICAgICByZXR1cm4gYWJzUGF0aDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHBhdGhzLmZvckVhY2goKHBhdGgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX3JlbW92ZUlnbm9yZWRQYXRoKHBhdGgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5fdXNlcklnbm9yZWQgPSB1bmRlZmluZWQ7XG4gICAgICAgIGlmICghdGhpcy5fcmVhZHlDb3VudClcbiAgICAgICAgICAgIHRoaXMuX3JlYWR5Q291bnQgPSAwO1xuICAgICAgICB0aGlzLl9yZWFkeUNvdW50ICs9IHBhdGhzLmxlbmd0aDtcbiAgICAgICAgUHJvbWlzZS5hbGwocGF0aHMubWFwKGFzeW5jIChwYXRoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXMgPSBhd2FpdCB0aGlzLl9ub2RlRnNIYW5kbGVyLl9hZGRUb05vZGVGcyhwYXRoLCAhX2ludGVybmFsLCB1bmRlZmluZWQsIDAsIF9vcmlnQWRkKTtcbiAgICAgICAgICAgIGlmIChyZXMpXG4gICAgICAgICAgICAgICAgdGhpcy5fZW1pdFJlYWR5KCk7XG4gICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9KSkudGhlbigocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuY2xvc2VkKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHJlc3VsdHMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChpdGVtKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZChzeXNQYXRoLmRpcm5hbWUoaXRlbSksIHN5c1BhdGguYmFzZW5hbWUoX29yaWdBZGQgfHwgaXRlbSkpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2xvc2Ugd2F0Y2hlcnMgb3Igc3RhcnQgaWdub3JpbmcgZXZlbnRzIGZyb20gc3BlY2lmaWVkIHBhdGhzLlxuICAgICAqL1xuICAgIHVud2F0Y2gocGF0aHNfKSB7XG4gICAgICAgIGlmICh0aGlzLmNsb3NlZClcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICBjb25zdCBwYXRocyA9IHVuaWZ5UGF0aHMocGF0aHNfKTtcbiAgICAgICAgY29uc3QgeyBjd2QgfSA9IHRoaXMub3B0aW9ucztcbiAgICAgICAgcGF0aHMuZm9yRWFjaCgocGF0aCkgPT4ge1xuICAgICAgICAgICAgLy8gY29udmVydCB0byBhYnNvbHV0ZSBwYXRoIHVubGVzcyByZWxhdGl2ZSBwYXRoIGFscmVhZHkgbWF0Y2hlc1xuICAgICAgICAgICAgaWYgKCFzeXNQYXRoLmlzQWJzb2x1dGUocGF0aCkgJiYgIXRoaXMuX2Nsb3NlcnMuaGFzKHBhdGgpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGN3ZClcbiAgICAgICAgICAgICAgICAgICAgcGF0aCA9IHN5c1BhdGguam9pbihjd2QsIHBhdGgpO1xuICAgICAgICAgICAgICAgIHBhdGggPSBzeXNQYXRoLnJlc29sdmUocGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jbG9zZVBhdGgocGF0aCk7XG4gICAgICAgICAgICB0aGlzLl9hZGRJZ25vcmVkUGF0aChwYXRoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLl93YXRjaGVkLmhhcyhwYXRoKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkZElnbm9yZWRQYXRoKHtcbiAgICAgICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVjdXJzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmVzZXQgdGhlIGNhY2hlZCB1c2VySWdub3JlZCBhbnltYXRjaCBmblxuICAgICAgICAgICAgLy8gdG8gbWFrZSBpZ25vcmVkUGF0aHMgY2hhbmdlcyBlZmZlY3RpdmVcbiAgICAgICAgICAgIHRoaXMuX3VzZXJJZ25vcmVkID0gdW5kZWZpbmVkO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENsb3NlIHdhdGNoZXJzIGFuZCByZW1vdmUgYWxsIGxpc3RlbmVycyBmcm9tIHdhdGNoZWQgcGF0aHMuXG4gICAgICovXG4gICAgY2xvc2UoKSB7XG4gICAgICAgIGlmICh0aGlzLl9jbG9zZVByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jbG9zZVByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbG9zZWQgPSB0cnVlO1xuICAgICAgICAvLyBNZW1vcnkgbWFuYWdlbWVudC5cbiAgICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcbiAgICAgICAgY29uc3QgY2xvc2VycyA9IFtdO1xuICAgICAgICB0aGlzLl9jbG9zZXJzLmZvckVhY2goKGNsb3Nlckxpc3QpID0+IGNsb3Nlckxpc3QuZm9yRWFjaCgoY2xvc2VyKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcm9taXNlID0gY2xvc2VyKCk7XG4gICAgICAgICAgICBpZiAocHJvbWlzZSBpbnN0YW5jZW9mIFByb21pc2UpXG4gICAgICAgICAgICAgICAgY2xvc2Vycy5wdXNoKHByb21pc2UpO1xuICAgICAgICB9KSk7XG4gICAgICAgIHRoaXMuX3N0cmVhbXMuZm9yRWFjaCgoc3RyZWFtKSA9PiBzdHJlYW0uZGVzdHJveSgpKTtcbiAgICAgICAgdGhpcy5fdXNlcklnbm9yZWQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuX3JlYWR5Q291bnQgPSAwO1xuICAgICAgICB0aGlzLl9yZWFkeUVtaXR0ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fd2F0Y2hlZC5mb3JFYWNoKChkaXJlbnQpID0+IGRpcmVudC5kaXNwb3NlKCkpO1xuICAgICAgICB0aGlzLl9jbG9zZXJzLmNsZWFyKCk7XG4gICAgICAgIHRoaXMuX3dhdGNoZWQuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5fc3RyZWFtcy5jbGVhcigpO1xuICAgICAgICB0aGlzLl9zeW1saW5rUGF0aHMuY2xlYXIoKTtcbiAgICAgICAgdGhpcy5fdGhyb3R0bGVkLmNsZWFyKCk7XG4gICAgICAgIHRoaXMuX2Nsb3NlUHJvbWlzZSA9IGNsb3NlcnMubGVuZ3RoXG4gICAgICAgICAgICA/IFByb21pc2UuYWxsKGNsb3NlcnMpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKVxuICAgICAgICAgICAgOiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2Nsb3NlUHJvbWlzZTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRXhwb3NlIGxpc3Qgb2Ygd2F0Y2hlZCBwYXRoc1xuICAgICAqIEByZXR1cm5zIGZvciBjaGFpbmluZ1xuICAgICAqL1xuICAgIGdldFdhdGNoZWQoKSB7XG4gICAgICAgIGNvbnN0IHdhdGNoTGlzdCA9IHt9O1xuICAgICAgICB0aGlzLl93YXRjaGVkLmZvckVhY2goKGVudHJ5LCBkaXIpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHRoaXMub3B0aW9ucy5jd2QgPyBzeXNQYXRoLnJlbGF0aXZlKHRoaXMub3B0aW9ucy5jd2QsIGRpcikgOiBkaXI7XG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IGtleSB8fCBPTkVfRE9UO1xuICAgICAgICAgICAgd2F0Y2hMaXN0W2luZGV4XSA9IGVudHJ5LmdldENoaWxkcmVuKCkuc29ydCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHdhdGNoTGlzdDtcbiAgICB9XG4gICAgZW1pdFdpdGhBbGwoZXZlbnQsIGFyZ3MpIHtcbiAgICAgICAgdGhpcy5lbWl0KGV2ZW50LCAuLi5hcmdzKTtcbiAgICAgICAgaWYgKGV2ZW50ICE9PSBFVi5FUlJPUilcbiAgICAgICAgICAgIHRoaXMuZW1pdChFVi5BTEwsIGV2ZW50LCAuLi5hcmdzKTtcbiAgICB9XG4gICAgLy8gQ29tbW9uIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS0tLVxuICAgIC8qKlxuICAgICAqIE5vcm1hbGl6ZSBhbmQgZW1pdCBldmVudHMuXG4gICAgICogQ2FsbGluZyBfZW1pdCBET0VTIE5PVCBNRUFOIGVtaXQoKSB3b3VsZCBiZSBjYWxsZWQhXG4gICAgICogQHBhcmFtIGV2ZW50IFR5cGUgb2YgZXZlbnRcbiAgICAgKiBAcGFyYW0gcGF0aCBGaWxlIG9yIGRpcmVjdG9yeSBwYXRoXG4gICAgICogQHBhcmFtIHN0YXRzIGFyZ3VtZW50cyB0byBiZSBwYXNzZWQgd2l0aCBldmVudFxuICAgICAqIEByZXR1cm5zIHRoZSBlcnJvciBpZiBkZWZpbmVkLCBvdGhlcndpc2UgdGhlIHZhbHVlIG9mIHRoZSBGU1dhdGNoZXIgaW5zdGFuY2UncyBgY2xvc2VkYCBmbGFnXG4gICAgICovXG4gICAgYXN5bmMgX2VtaXQoZXZlbnQsIHBhdGgsIHN0YXRzKSB7XG4gICAgICAgIGlmICh0aGlzLmNsb3NlZClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY29uc3Qgb3B0cyA9IHRoaXMub3B0aW9ucztcbiAgICAgICAgaWYgKGlzV2luZG93cylcbiAgICAgICAgICAgIHBhdGggPSBzeXNQYXRoLm5vcm1hbGl6ZShwYXRoKTtcbiAgICAgICAgaWYgKG9wdHMuY3dkKVxuICAgICAgICAgICAgcGF0aCA9IHN5c1BhdGgucmVsYXRpdmUob3B0cy5jd2QsIHBhdGgpO1xuICAgICAgICBjb25zdCBhcmdzID0gW3BhdGhdO1xuICAgICAgICBpZiAoc3RhdHMgIT0gbnVsbClcbiAgICAgICAgICAgIGFyZ3MucHVzaChzdGF0cyk7XG4gICAgICAgIGNvbnN0IGF3ZiA9IG9wdHMuYXdhaXRXcml0ZUZpbmlzaDtcbiAgICAgICAgbGV0IHB3O1xuICAgICAgICBpZiAoYXdmICYmIChwdyA9IHRoaXMuX3BlbmRpbmdXcml0ZXMuZ2V0KHBhdGgpKSkge1xuICAgICAgICAgICAgcHcubGFzdENoYW5nZSA9IG5ldyBEYXRlKCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5hdG9taWMpIHtcbiAgICAgICAgICAgIGlmIChldmVudCA9PT0gRVYuVU5MSU5LKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcGVuZGluZ1VubGlua3Muc2V0KHBhdGgsIFtldmVudCwgLi4uYXJnc10pO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wZW5kaW5nVW5saW5rcy5mb3JFYWNoKChlbnRyeSwgcGF0aCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KC4uLmVudHJ5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdChFVi5BTEwsIC4uLmVudHJ5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3BlbmRpbmdVbmxpbmtzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSwgdHlwZW9mIG9wdHMuYXRvbWljID09PSAnbnVtYmVyJyA/IG9wdHMuYXRvbWljIDogMTAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChldmVudCA9PT0gRVYuQUREICYmIHRoaXMuX3BlbmRpbmdVbmxpbmtzLmhhcyhwYXRoKSkge1xuICAgICAgICAgICAgICAgIGV2ZW50ID0gRVYuQ0hBTkdFO1xuICAgICAgICAgICAgICAgIHRoaXMuX3BlbmRpbmdVbmxpbmtzLmRlbGV0ZShwYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoYXdmICYmIChldmVudCA9PT0gRVYuQUREIHx8IGV2ZW50ID09PSBFVi5DSEFOR0UpICYmIHRoaXMuX3JlYWR5RW1pdHRlZCkge1xuICAgICAgICAgICAgY29uc3QgYXdmRW1pdCA9IChlcnIsIHN0YXRzKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICBldmVudCA9IEVWLkVSUk9SO1xuICAgICAgICAgICAgICAgICAgICBhcmdzWzBdID0gZXJyO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXRXaXRoQWxsKGV2ZW50LCBhcmdzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgc3RhdHMgZG9lc24ndCBleGlzdCB0aGUgZmlsZSBtdXN0IGhhdmUgYmVlbiBkZWxldGVkXG4gICAgICAgICAgICAgICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3NbMV0gPSBzdGF0cztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3MucHVzaChzdGF0cyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0V2l0aEFsbChldmVudCwgYXJncyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuX2F3YWl0V3JpdGVGaW5pc2gocGF0aCwgYXdmLnN0YWJpbGl0eVRocmVzaG9sZCwgZXZlbnQsIGF3ZkVtaXQpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV2ZW50ID09PSBFVi5DSEFOR0UpIHtcbiAgICAgICAgICAgIGNvbnN0IGlzVGhyb3R0bGVkID0gIXRoaXMuX3Rocm90dGxlKEVWLkNIQU5HRSwgcGF0aCwgNTApO1xuICAgICAgICAgICAgaWYgKGlzVGhyb3R0bGVkKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmFsd2F5c1N0YXQgJiZcbiAgICAgICAgICAgIHN0YXRzID09PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgIChldmVudCA9PT0gRVYuQUREIHx8IGV2ZW50ID09PSBFVi5BRERfRElSIHx8IGV2ZW50ID09PSBFVi5DSEFOR0UpKSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsUGF0aCA9IG9wdHMuY3dkID8gc3lzUGF0aC5qb2luKG9wdHMuY3dkLCBwYXRoKSA6IHBhdGg7XG4gICAgICAgICAgICBsZXQgc3RhdHM7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHN0YXRzID0gYXdhaXQgc3RhdChmdWxsUGF0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gbm90aGluZ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gU3VwcHJlc3MgZXZlbnQgd2hlbiBmc19zdGF0IGZhaWxzLCB0byBhdm9pZCBzZW5kaW5nIHVuZGVmaW5lZCAnc3RhdCdcbiAgICAgICAgICAgIGlmICghc3RhdHMgfHwgdGhpcy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgYXJncy5wdXNoKHN0YXRzKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVtaXRXaXRoQWxsKGV2ZW50LCBhcmdzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIENvbW1vbiBoYW5kbGVyIGZvciBlcnJvcnNcbiAgICAgKiBAcmV0dXJucyBUaGUgZXJyb3IgaWYgZGVmaW5lZCwgb3RoZXJ3aXNlIHRoZSB2YWx1ZSBvZiB0aGUgRlNXYXRjaGVyIGluc3RhbmNlJ3MgYGNsb3NlZGAgZmxhZ1xuICAgICAqL1xuICAgIF9oYW5kbGVFcnJvcihlcnJvcikge1xuICAgICAgICBjb25zdCBjb2RlID0gZXJyb3IgJiYgZXJyb3IuY29kZTtcbiAgICAgICAgaWYgKGVycm9yICYmXG4gICAgICAgICAgICBjb2RlICE9PSAnRU5PRU5UJyAmJlxuICAgICAgICAgICAgY29kZSAhPT0gJ0VOT1RESVInICYmXG4gICAgICAgICAgICAoIXRoaXMub3B0aW9ucy5pZ25vcmVQZXJtaXNzaW9uRXJyb3JzIHx8IChjb2RlICE9PSAnRVBFUk0nICYmIGNvZGUgIT09ICdFQUNDRVMnKSkpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdChFVi5FUlJPUiwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlcnJvciB8fCB0aGlzLmNsb3NlZDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSGVscGVyIHV0aWxpdHkgZm9yIHRocm90dGxpbmdcbiAgICAgKiBAcGFyYW0gYWN0aW9uVHlwZSB0eXBlIGJlaW5nIHRocm90dGxlZFxuICAgICAqIEBwYXJhbSBwYXRoIGJlaW5nIGFjdGVkIHVwb25cbiAgICAgKiBAcGFyYW0gdGltZW91dCBkdXJhdGlvbiBvZiB0aW1lIHRvIHN1cHByZXNzIGR1cGxpY2F0ZSBhY3Rpb25zXG4gICAgICogQHJldHVybnMgdHJhY2tpbmcgb2JqZWN0IG9yIGZhbHNlIGlmIGFjdGlvbiBzaG91bGQgYmUgc3VwcHJlc3NlZFxuICAgICAqL1xuICAgIF90aHJvdHRsZShhY3Rpb25UeXBlLCBwYXRoLCB0aW1lb3V0KSB7XG4gICAgICAgIGlmICghdGhpcy5fdGhyb3R0bGVkLmhhcyhhY3Rpb25UeXBlKSkge1xuICAgICAgICAgICAgdGhpcy5fdGhyb3R0bGVkLnNldChhY3Rpb25UeXBlLCBuZXcgTWFwKCkpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGFjdGlvbiA9IHRoaXMuX3Rocm90dGxlZC5nZXQoYWN0aW9uVHlwZSk7XG4gICAgICAgIGlmICghYWN0aW9uKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHRocm90dGxlJyk7XG4gICAgICAgIGNvbnN0IGFjdGlvblBhdGggPSBhY3Rpb24uZ2V0KHBhdGgpO1xuICAgICAgICBpZiAoYWN0aW9uUGF0aCkge1xuICAgICAgICAgICAgYWN0aW9uUGF0aC5jb3VudCsrO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBwcmVmZXItY29uc3RcbiAgICAgICAgbGV0IHRpbWVvdXRPYmplY3Q7XG4gICAgICAgIGNvbnN0IGNsZWFyID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaXRlbSA9IGFjdGlvbi5nZXQocGF0aCk7XG4gICAgICAgICAgICBjb25zdCBjb3VudCA9IGl0ZW0gPyBpdGVtLmNvdW50IDogMDtcbiAgICAgICAgICAgIGFjdGlvbi5kZWxldGUocGF0aCk7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dE9iamVjdCk7XG4gICAgICAgICAgICBpZiAoaXRlbSlcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQoaXRlbS50aW1lb3V0T2JqZWN0KTtcbiAgICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfTtcbiAgICAgICAgdGltZW91dE9iamVjdCA9IHNldFRpbWVvdXQoY2xlYXIsIHRpbWVvdXQpO1xuICAgICAgICBjb25zdCB0aHIgPSB7IHRpbWVvdXRPYmplY3QsIGNsZWFyLCBjb3VudDogMCB9O1xuICAgICAgICBhY3Rpb24uc2V0KHBhdGgsIHRocik7XG4gICAgICAgIHJldHVybiB0aHI7XG4gICAgfVxuICAgIF9pbmNyUmVhZHlDb3VudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JlYWR5Q291bnQrKztcbiAgICB9XG4gICAgLyoqXG4gICAgICogQXdhaXRzIHdyaXRlIG9wZXJhdGlvbiB0byBmaW5pc2guXG4gICAgICogUG9sbHMgYSBuZXdseSBjcmVhdGVkIGZpbGUgZm9yIHNpemUgdmFyaWF0aW9ucy4gV2hlbiBmaWxlcyBzaXplIGRvZXMgbm90IGNoYW5nZSBmb3IgJ3RocmVzaG9sZCcgbWlsbGlzZWNvbmRzIGNhbGxzIGNhbGxiYWNrLlxuICAgICAqIEBwYXJhbSBwYXRoIGJlaW5nIGFjdGVkIHVwb25cbiAgICAgKiBAcGFyYW0gdGhyZXNob2xkIFRpbWUgaW4gbWlsbGlzZWNvbmRzIGEgZmlsZSBzaXplIG11c3QgYmUgZml4ZWQgYmVmb3JlIGFja25vd2xlZGdpbmcgd3JpdGUgT1AgaXMgZmluaXNoZWRcbiAgICAgKiBAcGFyYW0gZXZlbnRcbiAgICAgKiBAcGFyYW0gYXdmRW1pdCBDYWxsYmFjayB0byBiZSBjYWxsZWQgd2hlbiByZWFkeSBmb3IgZXZlbnQgdG8gYmUgZW1pdHRlZC5cbiAgICAgKi9cbiAgICBfYXdhaXRXcml0ZUZpbmlzaChwYXRoLCB0aHJlc2hvbGQsIGV2ZW50LCBhd2ZFbWl0KSB7XG4gICAgICAgIGNvbnN0IGF3ZiA9IHRoaXMub3B0aW9ucy5hd2FpdFdyaXRlRmluaXNoO1xuICAgICAgICBpZiAodHlwZW9mIGF3ZiAhPT0gJ29iamVjdCcpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNvbnN0IHBvbGxJbnRlcnZhbCA9IGF3Zi5wb2xsSW50ZXJ2YWw7XG4gICAgICAgIGxldCB0aW1lb3V0SGFuZGxlcjtcbiAgICAgICAgbGV0IGZ1bGxQYXRoID0gcGF0aDtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5jd2QgJiYgIXN5c1BhdGguaXNBYnNvbHV0ZShwYXRoKSkge1xuICAgICAgICAgICAgZnVsbFBhdGggPSBzeXNQYXRoLmpvaW4odGhpcy5vcHRpb25zLmN3ZCwgcGF0aCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgICAgY29uc3Qgd3JpdGVzID0gdGhpcy5fcGVuZGluZ1dyaXRlcztcbiAgICAgICAgZnVuY3Rpb24gYXdhaXRXcml0ZUZpbmlzaEZuKHByZXZTdGF0KSB7XG4gICAgICAgICAgICBzdGF0Y2IoZnVsbFBhdGgsIChlcnIsIGN1clN0YXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyIHx8ICF3cml0ZXMuaGFzKHBhdGgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIgJiYgZXJyLmNvZGUgIT09ICdFTk9FTlQnKVxuICAgICAgICAgICAgICAgICAgICAgICAgYXdmRW1pdChlcnIpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdyA9IE51bWJlcihuZXcgRGF0ZSgpKTtcbiAgICAgICAgICAgICAgICBpZiAocHJldlN0YXQgJiYgY3VyU3RhdC5zaXplICE9PSBwcmV2U3RhdC5zaXplKSB7XG4gICAgICAgICAgICAgICAgICAgIHdyaXRlcy5nZXQocGF0aCkubGFzdENoYW5nZSA9IG5vdztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcHcgPSB3cml0ZXMuZ2V0KHBhdGgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRmID0gbm93IC0gcHcubGFzdENoYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAoZGYgPj0gdGhyZXNob2xkKSB7XG4gICAgICAgICAgICAgICAgICAgIHdyaXRlcy5kZWxldGUocGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIGF3ZkVtaXQodW5kZWZpbmVkLCBjdXJTdGF0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRIYW5kbGVyID0gc2V0VGltZW91dChhd2FpdFdyaXRlRmluaXNoRm4sIHBvbGxJbnRlcnZhbCwgY3VyU3RhdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF3cml0ZXMuaGFzKHBhdGgpKSB7XG4gICAgICAgICAgICB3cml0ZXMuc2V0KHBhdGgsIHtcbiAgICAgICAgICAgICAgICBsYXN0Q2hhbmdlOiBub3csXG4gICAgICAgICAgICAgICAgY2FuY2VsV2FpdDogKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB3cml0ZXMuZGVsZXRlKHBhdGgpO1xuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZXIpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXZlbnQ7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGltZW91dEhhbmRsZXIgPSBzZXRUaW1lb3V0KGF3YWl0V3JpdGVGaW5pc2hGbiwgcG9sbEludGVydmFsKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgdXNlciBoYXMgYXNrZWQgdG8gaWdub3JlIHRoaXMgcGF0aC5cbiAgICAgKi9cbiAgICBfaXNJZ25vcmVkKHBhdGgsIHN0YXRzKSB7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuYXRvbWljICYmIERPVF9SRS50ZXN0KHBhdGgpKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGlmICghdGhpcy5fdXNlcklnbm9yZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgY3dkIH0gPSB0aGlzLm9wdGlvbnM7XG4gICAgICAgICAgICBjb25zdCBpZ24gPSB0aGlzLm9wdGlvbnMuaWdub3JlZDtcbiAgICAgICAgICAgIGNvbnN0IGlnbm9yZWQgPSAoaWduIHx8IFtdKS5tYXAobm9ybWFsaXplSWdub3JlZChjd2QpKTtcbiAgICAgICAgICAgIGNvbnN0IGlnbm9yZWRQYXRocyA9IFsuLi50aGlzLl9pZ25vcmVkUGF0aHNdO1xuICAgICAgICAgICAgY29uc3QgbGlzdCA9IFsuLi5pZ25vcmVkUGF0aHMubWFwKG5vcm1hbGl6ZUlnbm9yZWQoY3dkKSksIC4uLmlnbm9yZWRdO1xuICAgICAgICAgICAgdGhpcy5fdXNlcklnbm9yZWQgPSBhbnltYXRjaChsaXN0LCB1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl91c2VySWdub3JlZChwYXRoLCBzdGF0cyk7XG4gICAgfVxuICAgIF9pc250SWdub3JlZChwYXRoLCBzdGF0KSB7XG4gICAgICAgIHJldHVybiAhdGhpcy5faXNJZ25vcmVkKHBhdGgsIHN0YXQpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBQcm92aWRlcyBhIHNldCBvZiBjb21tb24gaGVscGVycyBhbmQgcHJvcGVydGllcyByZWxhdGluZyB0byBzeW1saW5rIGhhbmRsaW5nLlxuICAgICAqIEBwYXJhbSBwYXRoIGZpbGUgb3IgZGlyZWN0b3J5IHBhdHRlcm4gYmVpbmcgd2F0Y2hlZFxuICAgICAqL1xuICAgIF9nZXRXYXRjaEhlbHBlcnMocGF0aCkge1xuICAgICAgICByZXR1cm4gbmV3IFdhdGNoSGVscGVyKHBhdGgsIHRoaXMub3B0aW9ucy5mb2xsb3dTeW1saW5rcywgdGhpcyk7XG4gICAgfVxuICAgIC8vIERpcmVjdG9yeSBoZWxwZXJzXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvKipcbiAgICAgKiBQcm92aWRlcyBkaXJlY3RvcnkgdHJhY2tpbmcgb2JqZWN0c1xuICAgICAqIEBwYXJhbSBkaXJlY3RvcnkgcGF0aCBvZiB0aGUgZGlyZWN0b3J5XG4gICAgICovXG4gICAgX2dldFdhdGNoZWREaXIoZGlyZWN0b3J5KSB7XG4gICAgICAgIGNvbnN0IGRpciA9IHN5c1BhdGgucmVzb2x2ZShkaXJlY3RvcnkpO1xuICAgICAgICBpZiAoIXRoaXMuX3dhdGNoZWQuaGFzKGRpcikpXG4gICAgICAgICAgICB0aGlzLl93YXRjaGVkLnNldChkaXIsIG5ldyBEaXJFbnRyeShkaXIsIHRoaXMuX2JvdW5kUmVtb3ZlKSk7XG4gICAgICAgIHJldHVybiB0aGlzLl93YXRjaGVkLmdldChkaXIpO1xuICAgIH1cbiAgICAvLyBGaWxlIGhlbHBlcnNcbiAgICAvLyAtLS0tLS0tLS0tLS1cbiAgICAvKipcbiAgICAgKiBDaGVjayBmb3IgcmVhZCBwZXJtaXNzaW9uczogaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzExNzgxNDA0LzEzNTg0MDVcbiAgICAgKi9cbiAgICBfaGFzUmVhZFBlcm1pc3Npb25zKHN0YXRzKSB7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMuaWdub3JlUGVybWlzc2lvbkVycm9ycylcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICByZXR1cm4gQm9vbGVhbihOdW1iZXIoc3RhdHMubW9kZSkgJiAwbzQwMCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEhhbmRsZXMgZW1pdHRpbmcgdW5saW5rIGV2ZW50cyBmb3JcbiAgICAgKiBmaWxlcyBhbmQgZGlyZWN0b3JpZXMsIGFuZCB2aWEgcmVjdXJzaW9uLCBmb3JcbiAgICAgKiBmaWxlcyBhbmQgZGlyZWN0b3JpZXMgd2l0aGluIGRpcmVjdG9yaWVzIHRoYXQgYXJlIHVubGlua2VkXG4gICAgICogQHBhcmFtIGRpcmVjdG9yeSB3aXRoaW4gd2hpY2ggdGhlIGZvbGxvd2luZyBpdGVtIGlzIGxvY2F0ZWRcbiAgICAgKiBAcGFyYW0gaXRlbSAgICAgIGJhc2UgcGF0aCBvZiBpdGVtL2RpcmVjdG9yeVxuICAgICAqL1xuICAgIF9yZW1vdmUoZGlyZWN0b3J5LCBpdGVtLCBpc0RpcmVjdG9yeSkge1xuICAgICAgICAvLyBpZiB3aGF0IGlzIGJlaW5nIGRlbGV0ZWQgaXMgYSBkaXJlY3RvcnksIGdldCB0aGF0IGRpcmVjdG9yeSdzIHBhdGhzXG4gICAgICAgIC8vIGZvciByZWN1cnNpdmUgZGVsZXRpbmcgYW5kIGNsZWFuaW5nIG9mIHdhdGNoZWQgb2JqZWN0XG4gICAgICAgIC8vIGlmIGl0IGlzIG5vdCBhIGRpcmVjdG9yeSwgbmVzdGVkRGlyZWN0b3J5Q2hpbGRyZW4gd2lsbCBiZSBlbXB0eSBhcnJheVxuICAgICAgICBjb25zdCBwYXRoID0gc3lzUGF0aC5qb2luKGRpcmVjdG9yeSwgaXRlbSk7XG4gICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gc3lzUGF0aC5yZXNvbHZlKHBhdGgpO1xuICAgICAgICBpc0RpcmVjdG9yeSA9XG4gICAgICAgICAgICBpc0RpcmVjdG9yeSAhPSBudWxsID8gaXNEaXJlY3RvcnkgOiB0aGlzLl93YXRjaGVkLmhhcyhwYXRoKSB8fCB0aGlzLl93YXRjaGVkLmhhcyhmdWxsUGF0aCk7XG4gICAgICAgIC8vIHByZXZlbnQgZHVwbGljYXRlIGhhbmRsaW5nIGluIGNhc2Ugb2YgYXJyaXZpbmcgaGVyZSBuZWFybHkgc2ltdWx0YW5lb3VzbHlcbiAgICAgICAgLy8gdmlhIG11bHRpcGxlIHBhdGhzIChzdWNoIGFzIF9oYW5kbGVGaWxlIGFuZCBfaGFuZGxlRGlyKVxuICAgICAgICBpZiAoIXRoaXMuX3Rocm90dGxlKCdyZW1vdmUnLCBwYXRoLCAxMDApKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAvLyBpZiB0aGUgb25seSB3YXRjaGVkIGZpbGUgaXMgcmVtb3ZlZCwgd2F0Y2ggZm9yIGl0cyByZXR1cm5cbiAgICAgICAgaWYgKCFpc0RpcmVjdG9yeSAmJiB0aGlzLl93YXRjaGVkLnNpemUgPT09IDEpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkKGRpcmVjdG9yeSwgaXRlbSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhpcyB3aWxsIGNyZWF0ZSBhIG5ldyBlbnRyeSBpbiB0aGUgd2F0Y2hlZCBvYmplY3QgaW4gZWl0aGVyIGNhc2VcbiAgICAgICAgLy8gc28gd2UgZ290IHRvIGRvIHRoZSBkaXJlY3RvcnkgY2hlY2sgYmVmb3JlaGFuZFxuICAgICAgICBjb25zdCB3cCA9IHRoaXMuX2dldFdhdGNoZWREaXIocGF0aCk7XG4gICAgICAgIGNvbnN0IG5lc3RlZERpcmVjdG9yeUNoaWxkcmVuID0gd3AuZ2V0Q2hpbGRyZW4oKTtcbiAgICAgICAgLy8gUmVjdXJzaXZlbHkgcmVtb3ZlIGNoaWxkcmVuIGRpcmVjdG9yaWVzIC8gZmlsZXMuXG4gICAgICAgIG5lc3RlZERpcmVjdG9yeUNoaWxkcmVuLmZvckVhY2goKG5lc3RlZCkgPT4gdGhpcy5fcmVtb3ZlKHBhdGgsIG5lc3RlZCkpO1xuICAgICAgICAvLyBDaGVjayBpZiBpdGVtIHdhcyBvbiB0aGUgd2F0Y2hlZCBsaXN0IGFuZCByZW1vdmUgaXRcbiAgICAgICAgY29uc3QgcGFyZW50ID0gdGhpcy5fZ2V0V2F0Y2hlZERpcihkaXJlY3RvcnkpO1xuICAgICAgICBjb25zdCB3YXNUcmFja2VkID0gcGFyZW50LmhhcyhpdGVtKTtcbiAgICAgICAgcGFyZW50LnJlbW92ZShpdGVtKTtcbiAgICAgICAgLy8gRml4ZXMgaXNzdWUgIzEwNDIgLT4gUmVsYXRpdmUgcGF0aHMgd2VyZSBkZXRlY3RlZCBhbmQgYWRkZWQgYXMgc3ltbGlua3NcbiAgICAgICAgLy8gKGh0dHBzOi8vZ2l0aHViLmNvbS9wYXVsbWlsbHIvY2hva2lkYXIvYmxvYi9lMTc1M2RkYmM5NTcxYmRjMzNiNGE0YWYxNzJkNTJjYjZlNjExYzEwL2xpYi9ub2RlZnMtaGFuZGxlci5qcyNMNjEyKSxcbiAgICAgICAgLy8gYnV0IG5ldmVyIHJlbW92ZWQgZnJvbSB0aGUgbWFwIGluIGNhc2UgdGhlIHBhdGggd2FzIGRlbGV0ZWQuXG4gICAgICAgIC8vIFRoaXMgbGVhZHMgdG8gYW4gaW5jb3JyZWN0IHN0YXRlIGlmIHRoZSBwYXRoIHdhcyByZWNyZWF0ZWQ6XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXVsbWlsbHIvY2hva2lkYXIvYmxvYi9lMTc1M2RkYmM5NTcxYmRjMzNiNGE0YWYxNzJkNTJjYjZlNjExYzEwL2xpYi9ub2RlZnMtaGFuZGxlci5qcyNMNTUzXG4gICAgICAgIGlmICh0aGlzLl9zeW1saW5rUGF0aHMuaGFzKGZ1bGxQYXRoKSkge1xuICAgICAgICAgICAgdGhpcy5fc3ltbGlua1BhdGhzLmRlbGV0ZShmdWxsUGF0aCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgd2Ugd2FpdCBmb3IgdGhpcyBmaWxlIHRvIGJlIGZ1bGx5IHdyaXR0ZW4sIGNhbmNlbCB0aGUgd2FpdC5cbiAgICAgICAgbGV0IHJlbFBhdGggPSBwYXRoO1xuICAgICAgICBpZiAodGhpcy5vcHRpb25zLmN3ZClcbiAgICAgICAgICAgIHJlbFBhdGggPSBzeXNQYXRoLnJlbGF0aXZlKHRoaXMub3B0aW9ucy5jd2QsIHBhdGgpO1xuICAgICAgICBpZiAodGhpcy5vcHRpb25zLmF3YWl0V3JpdGVGaW5pc2ggJiYgdGhpcy5fcGVuZGluZ1dyaXRlcy5oYXMocmVsUGF0aCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGV2ZW50ID0gdGhpcy5fcGVuZGluZ1dyaXRlcy5nZXQocmVsUGF0aCkuY2FuY2VsV2FpdCgpO1xuICAgICAgICAgICAgaWYgKGV2ZW50ID09PSBFVi5BREQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSBFbnRyeSB3aWxsIGVpdGhlciBiZSBhIGRpcmVjdG9yeSB0aGF0IGp1c3QgZ290IHJlbW92ZWRcbiAgICAgICAgLy8gb3IgYSBib2d1cyBlbnRyeSB0byBhIGZpbGUsIGluIGVpdGhlciBjYXNlIHdlIGhhdmUgdG8gcmVtb3ZlIGl0XG4gICAgICAgIHRoaXMuX3dhdGNoZWQuZGVsZXRlKHBhdGgpO1xuICAgICAgICB0aGlzLl93YXRjaGVkLmRlbGV0ZShmdWxsUGF0aCk7XG4gICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IGlzRGlyZWN0b3J5ID8gRVYuVU5MSU5LX0RJUiA6IEVWLlVOTElOSztcbiAgICAgICAgaWYgKHdhc1RyYWNrZWQgJiYgIXRoaXMuX2lzSWdub3JlZChwYXRoKSlcbiAgICAgICAgICAgIHRoaXMuX2VtaXQoZXZlbnROYW1lLCBwYXRoKTtcbiAgICAgICAgLy8gQXZvaWQgY29uZmxpY3RzIGlmIHdlIGxhdGVyIGNyZWF0ZSBhbm90aGVyIGZpbGUgd2l0aCB0aGUgc2FtZSBuYW1lXG4gICAgICAgIHRoaXMuX2Nsb3NlUGF0aChwYXRoKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQ2xvc2VzIGFsbCB3YXRjaGVycyBmb3IgYSBwYXRoXG4gICAgICovXG4gICAgX2Nsb3NlUGF0aChwYXRoKSB7XG4gICAgICAgIHRoaXMuX2Nsb3NlRmlsZShwYXRoKTtcbiAgICAgICAgY29uc3QgZGlyID0gc3lzUGF0aC5kaXJuYW1lKHBhdGgpO1xuICAgICAgICB0aGlzLl9nZXRXYXRjaGVkRGlyKGRpcikucmVtb3ZlKHN5c1BhdGguYmFzZW5hbWUocGF0aCkpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBDbG9zZXMgb25seSBmaWxlLXNwZWNpZmljIHdhdGNoZXJzXG4gICAgICovXG4gICAgX2Nsb3NlRmlsZShwYXRoKSB7XG4gICAgICAgIGNvbnN0IGNsb3NlcnMgPSB0aGlzLl9jbG9zZXJzLmdldChwYXRoKTtcbiAgICAgICAgaWYgKCFjbG9zZXJzKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjbG9zZXJzLmZvckVhY2goKGNsb3NlcikgPT4gY2xvc2VyKCkpO1xuICAgICAgICB0aGlzLl9jbG9zZXJzLmRlbGV0ZShwYXRoKTtcbiAgICB9XG4gICAgX2FkZFBhdGhDbG9zZXIocGF0aCwgY2xvc2VyKSB7XG4gICAgICAgIGlmICghY2xvc2VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBsZXQgbGlzdCA9IHRoaXMuX2Nsb3NlcnMuZ2V0KHBhdGgpO1xuICAgICAgICBpZiAoIWxpc3QpIHtcbiAgICAgICAgICAgIGxpc3QgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuX2Nsb3NlcnMuc2V0KHBhdGgsIGxpc3QpO1xuICAgICAgICB9XG4gICAgICAgIGxpc3QucHVzaChjbG9zZXIpO1xuICAgIH1cbiAgICBfcmVhZGRpcnAocm9vdCwgb3B0cykge1xuICAgICAgICBpZiAodGhpcy5jbG9zZWQpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7IHR5cGU6IEVWLkFMTCwgYWx3YXlzU3RhdDogdHJ1ZSwgbHN0YXQ6IHRydWUsIC4uLm9wdHMsIGRlcHRoOiAwIH07XG4gICAgICAgIGxldCBzdHJlYW0gPSByZWFkZGlycChyb290LCBvcHRpb25zKTtcbiAgICAgICAgdGhpcy5fc3RyZWFtcy5hZGQoc3RyZWFtKTtcbiAgICAgICAgc3RyZWFtLm9uY2UoU1RSX0NMT1NFLCAoKSA9PiB7XG4gICAgICAgICAgICBzdHJlYW0gPSB1bmRlZmluZWQ7XG4gICAgICAgIH0pO1xuICAgICAgICBzdHJlYW0ub25jZShTVFJfRU5ELCAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoc3RyZWFtKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3RyZWFtcy5kZWxldGUoc3RyZWFtKTtcbiAgICAgICAgICAgICAgICBzdHJlYW0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gc3RyZWFtO1xuICAgIH1cbn1cbi8qKlxuICogSW5zdGFudGlhdGVzIHdhdGNoZXIgd2l0aCBwYXRocyB0byBiZSB0cmFja2VkLlxuICogQHBhcmFtIHBhdGhzIGZpbGUgLyBkaXJlY3RvcnkgcGF0aHNcbiAqIEBwYXJhbSBvcHRpb25zIG9wdHMsIHN1Y2ggYXMgYGF0b21pY2AsIGBhd2FpdFdyaXRlRmluaXNoYCwgYGlnbm9yZWRgLCBhbmQgb3RoZXJzXG4gKiBAcmV0dXJucyBhbiBpbnN0YW5jZSBvZiBGU1dhdGNoZXIgZm9yIGNoYWluaW5nLlxuICogQGV4YW1wbGVcbiAqIGNvbnN0IHdhdGNoZXIgPSB3YXRjaCgnLicpLm9uKCdhbGwnLCAoZXZlbnQsIHBhdGgpID0+IHsgY29uc29sZS5sb2coZXZlbnQsIHBhdGgpOyB9KTtcbiAqIHdhdGNoKCcuJywgeyBhdG9taWM6IHRydWUsIGF3YWl0V3JpdGVGaW5pc2g6IHRydWUsIGlnbm9yZWQ6IChmLCBzdGF0cykgPT4gc3RhdHM/LmlzRmlsZSgpICYmICFmLmVuZHNXaXRoKCcuanMnKSB9KVxuICovXG5leHBvcnQgZnVuY3Rpb24gd2F0Y2gocGF0aHMsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IHdhdGNoZXIgPSBuZXcgRlNXYXRjaGVyKG9wdGlvbnMpO1xuICAgIHdhdGNoZXIuYWRkKHBhdGhzKTtcbiAgICByZXR1cm4gd2F0Y2hlcjtcbn1cbmV4cG9ydCBkZWZhdWx0IHsgd2F0Y2gsIEZTV2F0Y2hlciB9O1xuIiwgImltcG9ydCB7IHN0YXQsIGxzdGF0LCByZWFkZGlyLCByZWFscGF0aCB9IGZyb20gJ25vZGU6ZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgUmVhZGFibGUgfSBmcm9tICdub2RlOnN0cmVhbSc7XG5pbXBvcnQgeyByZXNvbHZlIGFzIHByZXNvbHZlLCByZWxhdGl2ZSBhcyBwcmVsYXRpdmUsIGpvaW4gYXMgcGpvaW4sIHNlcCBhcyBwc2VwIH0gZnJvbSAnbm9kZTpwYXRoJztcbmV4cG9ydCBjb25zdCBFbnRyeVR5cGVzID0ge1xuICAgIEZJTEVfVFlQRTogJ2ZpbGVzJyxcbiAgICBESVJfVFlQRTogJ2RpcmVjdG9yaWVzJyxcbiAgICBGSUxFX0RJUl9UWVBFOiAnZmlsZXNfZGlyZWN0b3JpZXMnLFxuICAgIEVWRVJZVEhJTkdfVFlQRTogJ2FsbCcsXG59O1xuY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgcm9vdDogJy4nLFxuICAgIGZpbGVGaWx0ZXI6IChfZW50cnlJbmZvKSA9PiB0cnVlLFxuICAgIGRpcmVjdG9yeUZpbHRlcjogKF9lbnRyeUluZm8pID0+IHRydWUsXG4gICAgdHlwZTogRW50cnlUeXBlcy5GSUxFX1RZUEUsXG4gICAgbHN0YXQ6IGZhbHNlLFxuICAgIGRlcHRoOiAyMTQ3NDgzNjQ4LFxuICAgIGFsd2F5c1N0YXQ6IGZhbHNlLFxuICAgIGhpZ2hXYXRlck1hcms6IDQwOTYsXG59O1xuT2JqZWN0LmZyZWV6ZShkZWZhdWx0T3B0aW9ucyk7XG5jb25zdCBSRUNVUlNJVkVfRVJST1JfQ09ERSA9ICdSRUFERElSUF9SRUNVUlNJVkVfRVJST1InO1xuY29uc3QgTk9STUFMX0ZMT1dfRVJST1JTID0gbmV3IFNldChbJ0VOT0VOVCcsICdFUEVSTScsICdFQUNDRVMnLCAnRUxPT1AnLCBSRUNVUlNJVkVfRVJST1JfQ09ERV0pO1xuY29uc3QgQUxMX1RZUEVTID0gW1xuICAgIEVudHJ5VHlwZXMuRElSX1RZUEUsXG4gICAgRW50cnlUeXBlcy5FVkVSWVRISU5HX1RZUEUsXG4gICAgRW50cnlUeXBlcy5GSUxFX0RJUl9UWVBFLFxuICAgIEVudHJ5VHlwZXMuRklMRV9UWVBFLFxuXTtcbmNvbnN0IERJUl9UWVBFUyA9IG5ldyBTZXQoW1xuICAgIEVudHJ5VHlwZXMuRElSX1RZUEUsXG4gICAgRW50cnlUeXBlcy5FVkVSWVRISU5HX1RZUEUsXG4gICAgRW50cnlUeXBlcy5GSUxFX0RJUl9UWVBFLFxuXSk7XG5jb25zdCBGSUxFX1RZUEVTID0gbmV3IFNldChbXG4gICAgRW50cnlUeXBlcy5FVkVSWVRISU5HX1RZUEUsXG4gICAgRW50cnlUeXBlcy5GSUxFX0RJUl9UWVBFLFxuICAgIEVudHJ5VHlwZXMuRklMRV9UWVBFLFxuXSk7XG5jb25zdCBpc05vcm1hbEZsb3dFcnJvciA9IChlcnJvcikgPT4gTk9STUFMX0ZMT1dfRVJST1JTLmhhcyhlcnJvci5jb2RlKTtcbmNvbnN0IHdhbnRCaWdpbnRGc1N0YXRzID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJztcbmNvbnN0IGVtcHR5Rm4gPSAoX2VudHJ5SW5mbykgPT4gdHJ1ZTtcbmNvbnN0IG5vcm1hbGl6ZUZpbHRlciA9IChmaWx0ZXIpID0+IHtcbiAgICBpZiAoZmlsdGVyID09PSB1bmRlZmluZWQpXG4gICAgICAgIHJldHVybiBlbXB0eUZuO1xuICAgIGlmICh0eXBlb2YgZmlsdGVyID09PSAnZnVuY3Rpb24nKVxuICAgICAgICByZXR1cm4gZmlsdGVyO1xuICAgIGlmICh0eXBlb2YgZmlsdGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCBmbCA9IGZpbHRlci50cmltKCk7XG4gICAgICAgIHJldHVybiAoZW50cnkpID0+IGVudHJ5LmJhc2VuYW1lID09PSBmbDtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZmlsdGVyKSkge1xuICAgICAgICBjb25zdCB0ckl0ZW1zID0gZmlsdGVyLm1hcCgoaXRlbSkgPT4gaXRlbS50cmltKCkpO1xuICAgICAgICByZXR1cm4gKGVudHJ5KSA9PiB0ckl0ZW1zLnNvbWUoKGYpID0+IGVudHJ5LmJhc2VuYW1lID09PSBmKTtcbiAgICB9XG4gICAgcmV0dXJuIGVtcHR5Rm47XG59O1xuLyoqIFJlYWRhYmxlIHJlYWRkaXIgc3RyZWFtLCBlbWl0dGluZyBuZXcgZmlsZXMgYXMgdGhleSdyZSBiZWluZyBsaXN0ZWQuICovXG5leHBvcnQgY2xhc3MgUmVhZGRpcnBTdHJlYW0gZXh0ZW5kcyBSZWFkYWJsZSB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIHN1cGVyKHtcbiAgICAgICAgICAgIG9iamVjdE1vZGU6IHRydWUsXG4gICAgICAgICAgICBhdXRvRGVzdHJveTogdHJ1ZSxcbiAgICAgICAgICAgIGhpZ2hXYXRlck1hcms6IG9wdGlvbnMuaGlnaFdhdGVyTWFyayxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IG9wdHMgPSB7IC4uLmRlZmF1bHRPcHRpb25zLCAuLi5vcHRpb25zIH07XG4gICAgICAgIGNvbnN0IHsgcm9vdCwgdHlwZSB9ID0gb3B0cztcbiAgICAgICAgdGhpcy5fZmlsZUZpbHRlciA9IG5vcm1hbGl6ZUZpbHRlcihvcHRzLmZpbGVGaWx0ZXIpO1xuICAgICAgICB0aGlzLl9kaXJlY3RvcnlGaWx0ZXIgPSBub3JtYWxpemVGaWx0ZXIob3B0cy5kaXJlY3RvcnlGaWx0ZXIpO1xuICAgICAgICBjb25zdCBzdGF0TWV0aG9kID0gb3B0cy5sc3RhdCA/IGxzdGF0IDogc3RhdDtcbiAgICAgICAgLy8gVXNlIGJpZ2ludCBzdGF0cyBpZiBpdCdzIHdpbmRvd3MgYW5kIHN0YXQoKSBzdXBwb3J0cyBvcHRpb25zIChub2RlIDEwKykuXG4gICAgICAgIGlmICh3YW50QmlnaW50RnNTdGF0cykge1xuICAgICAgICAgICAgdGhpcy5fc3RhdCA9IChwYXRoKSA9PiBzdGF0TWV0aG9kKHBhdGgsIHsgYmlnaW50OiB0cnVlIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fc3RhdCA9IHN0YXRNZXRob2Q7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fbWF4RGVwdGggPSBvcHRzLmRlcHRoID8/IGRlZmF1bHRPcHRpb25zLmRlcHRoO1xuICAgICAgICB0aGlzLl93YW50c0RpciA9IHR5cGUgPyBESVJfVFlQRVMuaGFzKHR5cGUpIDogZmFsc2U7XG4gICAgICAgIHRoaXMuX3dhbnRzRmlsZSA9IHR5cGUgPyBGSUxFX1RZUEVTLmhhcyh0eXBlKSA6IGZhbHNlO1xuICAgICAgICB0aGlzLl93YW50c0V2ZXJ5dGhpbmcgPSB0eXBlID09PSBFbnRyeVR5cGVzLkVWRVJZVEhJTkdfVFlQRTtcbiAgICAgICAgdGhpcy5fcm9vdCA9IHByZXNvbHZlKHJvb3QpO1xuICAgICAgICB0aGlzLl9pc0RpcmVudCA9ICFvcHRzLmFsd2F5c1N0YXQ7XG4gICAgICAgIHRoaXMuX3N0YXRzUHJvcCA9IHRoaXMuX2lzRGlyZW50ID8gJ2RpcmVudCcgOiAnc3RhdHMnO1xuICAgICAgICB0aGlzLl9yZE9wdGlvbnMgPSB7IGVuY29kaW5nOiAndXRmOCcsIHdpdGhGaWxlVHlwZXM6IHRoaXMuX2lzRGlyZW50IH07XG4gICAgICAgIC8vIExhdW5jaCBzdHJlYW0gd2l0aCBvbmUgcGFyZW50LCB0aGUgcm9vdCBkaXIuXG4gICAgICAgIHRoaXMucGFyZW50cyA9IFt0aGlzLl9leHBsb3JlRGlyKHJvb3QsIDEpXTtcbiAgICAgICAgdGhpcy5yZWFkaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMucGFyZW50ID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBhc3luYyBfcmVhZChiYXRjaCkge1xuICAgICAgICBpZiAodGhpcy5yZWFkaW5nKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB0aGlzLnJlYWRpbmcgPSB0cnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgd2hpbGUgKCF0aGlzLmRlc3Ryb3llZCAmJiBiYXRjaCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXIgPSB0aGlzLnBhcmVudDtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWwgPSBwYXIgJiYgcGFyLmZpbGVzO1xuICAgICAgICAgICAgICAgIGlmIChmaWwgJiYgZmlsLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeyBwYXRoLCBkZXB0aCB9ID0gcGFyO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzbGljZSA9IGZpbC5zcGxpY2UoMCwgYmF0Y2gpLm1hcCgoZGlyZW50KSA9PiB0aGlzLl9mb3JtYXRFbnRyeShkaXJlbnQsIHBhdGgpKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXdhaXRlZCA9IGF3YWl0IFByb21pc2UuYWxsKHNsaWNlKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBhd2FpdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWVudHJ5KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZGVzdHJveWVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5VHlwZSA9IGF3YWl0IHRoaXMuX2dldEVudHJ5VHlwZShlbnRyeSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZW50cnlUeXBlID09PSAnZGlyZWN0b3J5JyAmJiB0aGlzLl9kaXJlY3RvcnlGaWx0ZXIoZW50cnkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlcHRoIDw9IHRoaXMuX21heERlcHRoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGFyZW50cy5wdXNoKHRoaXMuX2V4cGxvcmVEaXIoZW50cnkuZnVsbFBhdGgsIGRlcHRoICsgMSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fd2FudHNEaXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdXNoKGVudHJ5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2gtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICgoZW50cnlUeXBlID09PSAnZmlsZScgfHwgdGhpcy5faW5jbHVkZUFzRmlsZShlbnRyeSkpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZmlsZUZpbHRlcihlbnRyeSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fd2FudHNGaWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHVzaChlbnRyeSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhdGNoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSB0aGlzLnBhcmVudHMucG9wKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1c2gobnVsbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhcmVudCA9IGF3YWl0IHBhcmVudDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZGVzdHJveWVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveShlcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLnJlYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhc3luYyBfZXhwbG9yZURpcihwYXRoLCBkZXB0aCkge1xuICAgICAgICBsZXQgZmlsZXM7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmaWxlcyA9IGF3YWl0IHJlYWRkaXIocGF0aCwgdGhpcy5fcmRPcHRpb25zKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHRoaXMuX29uRXJyb3IoZXJyb3IpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IGZpbGVzLCBkZXB0aCwgcGF0aCB9O1xuICAgIH1cbiAgICBhc3luYyBfZm9ybWF0RW50cnkoZGlyZW50LCBwYXRoKSB7XG4gICAgICAgIGxldCBlbnRyeTtcbiAgICAgICAgY29uc3QgYmFzZW5hbWUgPSB0aGlzLl9pc0RpcmVudCA/IGRpcmVudC5uYW1lIDogZGlyZW50O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwcmVzb2x2ZShwam9pbihwYXRoLCBiYXNlbmFtZSkpO1xuICAgICAgICAgICAgZW50cnkgPSB7IHBhdGg6IHByZWxhdGl2ZSh0aGlzLl9yb290LCBmdWxsUGF0aCksIGZ1bGxQYXRoLCBiYXNlbmFtZSB9O1xuICAgICAgICAgICAgZW50cnlbdGhpcy5fc3RhdHNQcm9wXSA9IHRoaXMuX2lzRGlyZW50ID8gZGlyZW50IDogYXdhaXQgdGhpcy5fc3RhdChmdWxsUGF0aCk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgdGhpcy5fb25FcnJvcihlcnIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlbnRyeTtcbiAgICB9XG4gICAgX29uRXJyb3IoZXJyKSB7XG4gICAgICAgIGlmIChpc05vcm1hbEZsb3dFcnJvcihlcnIpICYmICF0aGlzLmRlc3Ryb3llZCkge1xuICAgICAgICAgICAgdGhpcy5lbWl0KCd3YXJuJywgZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveShlcnIpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGFzeW5jIF9nZXRFbnRyeVR5cGUoZW50cnkpIHtcbiAgICAgICAgLy8gZW50cnkgbWF5IGJlIHVuZGVmaW5lZCwgYmVjYXVzZSBhIHdhcm5pbmcgb3IgYW4gZXJyb3Igd2VyZSBlbWl0dGVkXG4gICAgICAgIC8vIGFuZCB0aGUgc3RhdHNQcm9wIGlzIHVuZGVmaW5lZFxuICAgICAgICBpZiAoIWVudHJ5ICYmIHRoaXMuX3N0YXRzUHJvcCBpbiBlbnRyeSkge1xuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN0YXRzID0gZW50cnlbdGhpcy5fc3RhdHNQcm9wXTtcbiAgICAgICAgaWYgKHN0YXRzLmlzRmlsZSgpKVxuICAgICAgICAgICAgcmV0dXJuICdmaWxlJztcbiAgICAgICAgaWYgKHN0YXRzLmlzRGlyZWN0b3J5KCkpXG4gICAgICAgICAgICByZXR1cm4gJ2RpcmVjdG9yeSc7XG4gICAgICAgIGlmIChzdGF0cyAmJiBzdGF0cy5pc1N5bWJvbGljTGluaygpKSB7XG4gICAgICAgICAgICBjb25zdCBmdWxsID0gZW50cnkuZnVsbFBhdGg7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5UmVhbFBhdGggPSBhd2FpdCByZWFscGF0aChmdWxsKTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbnRyeVJlYWxQYXRoU3RhdHMgPSBhd2FpdCBsc3RhdChlbnRyeVJlYWxQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAoZW50cnlSZWFsUGF0aFN0YXRzLmlzRmlsZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAnZmlsZSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChlbnRyeVJlYWxQYXRoU3RhdHMuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsZW4gPSBlbnRyeVJlYWxQYXRoLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZ1bGwuc3RhcnRzV2l0aChlbnRyeVJlYWxQYXRoKSAmJiBmdWxsLnN1YnN0cihsZW4sIDEpID09PSBwc2VwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZWN1cnNpdmVFcnJvciA9IG5ldyBFcnJvcihgQ2lyY3VsYXIgc3ltbGluayBkZXRlY3RlZDogXCIke2Z1bGx9XCIgcG9pbnRzIHRvIFwiJHtlbnRyeVJlYWxQYXRofVwiYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgICAgICAgICAgICAgICByZWN1cnNpdmVFcnJvci5jb2RlID0gUkVDVVJTSVZFX0VSUk9SX0NPREU7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fb25FcnJvcihyZWN1cnNpdmVFcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdkaXJlY3RvcnknO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIHRoaXMuX29uRXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBfaW5jbHVkZUFzRmlsZShlbnRyeSkge1xuICAgICAgICBjb25zdCBzdGF0cyA9IGVudHJ5ICYmIGVudHJ5W3RoaXMuX3N0YXRzUHJvcF07XG4gICAgICAgIHJldHVybiBzdGF0cyAmJiB0aGlzLl93YW50c0V2ZXJ5dGhpbmcgJiYgIXN0YXRzLmlzRGlyZWN0b3J5KCk7XG4gICAgfVxufVxuLyoqXG4gKiBTdHJlYW1pbmcgdmVyc2lvbjogUmVhZHMgYWxsIGZpbGVzIGFuZCBkaXJlY3RvcmllcyBpbiBnaXZlbiByb290IHJlY3Vyc2l2ZWx5LlxuICogQ29uc3VtZXMgfmNvbnN0YW50IHNtYWxsIGFtb3VudCBvZiBSQU0uXG4gKiBAcGFyYW0gcm9vdCBSb290IGRpcmVjdG9yeVxuICogQHBhcmFtIG9wdGlvbnMgT3B0aW9ucyB0byBzcGVjaWZ5IHJvb3QgKHN0YXJ0IGRpcmVjdG9yeSksIGZpbHRlcnMgYW5kIHJlY3Vyc2lvbiBkZXB0aFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGRpcnAocm9vdCwgb3B0aW9ucyA9IHt9KSB7XG4gICAgLy8gQHRzLWlnbm9yZVxuICAgIGxldCB0eXBlID0gb3B0aW9ucy5lbnRyeVR5cGUgfHwgb3B0aW9ucy50eXBlO1xuICAgIGlmICh0eXBlID09PSAnYm90aCcpXG4gICAgICAgIHR5cGUgPSBFbnRyeVR5cGVzLkZJTEVfRElSX1RZUEU7IC8vIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5XG4gICAgaWYgKHR5cGUpXG4gICAgICAgIG9wdGlvbnMudHlwZSA9IHR5cGU7XG4gICAgaWYgKCFyb290KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigncmVhZGRpcnA6IHJvb3QgYXJndW1lbnQgaXMgcmVxdWlyZWQuIFVzYWdlOiByZWFkZGlycChyb290LCBvcHRpb25zKScpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2Ygcm9vdCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVhZGRpcnA6IHJvb3QgYXJndW1lbnQgbXVzdCBiZSBhIHN0cmluZy4gVXNhZ2U6IHJlYWRkaXJwKHJvb3QsIG9wdGlvbnMpJyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgJiYgIUFMTF9UWVBFUy5pbmNsdWRlcyh0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYHJlYWRkaXJwOiBJbnZhbGlkIHR5cGUgcGFzc2VkLiBVc2Ugb25lIG9mICR7QUxMX1RZUEVTLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIG9wdGlvbnMucm9vdCA9IHJvb3Q7XG4gICAgcmV0dXJuIG5ldyBSZWFkZGlycFN0cmVhbShvcHRpb25zKTtcbn1cbi8qKlxuICogUHJvbWlzZSB2ZXJzaW9uOiBSZWFkcyBhbGwgZmlsZXMgYW5kIGRpcmVjdG9yaWVzIGluIGdpdmVuIHJvb3QgcmVjdXJzaXZlbHkuXG4gKiBDb21wYXJlZCB0byBzdHJlYW1pbmcgdmVyc2lvbiwgd2lsbCBjb25zdW1lIGEgbG90IG9mIFJBTSBlLmcuIHdoZW4gMSBtaWxsaW9uIGZpbGVzIGFyZSBsaXN0ZWQuXG4gKiBAcmV0dXJucyBhcnJheSBvZiBwYXRocyBhbmQgdGhlaXIgZW50cnkgaW5mb3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRkaXJwUHJvbWlzZShyb290LCBvcHRpb25zID0ge30pIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCBmaWxlcyA9IFtdO1xuICAgICAgICByZWFkZGlycChyb290LCBvcHRpb25zKVxuICAgICAgICAgICAgLm9uKCdkYXRhJywgKGVudHJ5KSA9PiBmaWxlcy5wdXNoKGVudHJ5KSlcbiAgICAgICAgICAgIC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShmaWxlcykpXG4gICAgICAgICAgICAub24oJ2Vycm9yJywgKGVycm9yKSA9PiByZWplY3QoZXJyb3IpKTtcbiAgICB9KTtcbn1cbmV4cG9ydCBkZWZhdWx0IHJlYWRkaXJwO1xuIiwgImltcG9ydCB7IHdhdGNoRmlsZSwgdW53YXRjaEZpbGUsIHdhdGNoIGFzIGZzX3dhdGNoIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgb3Blbiwgc3RhdCwgbHN0YXQsIHJlYWxwYXRoIGFzIGZzcmVhbHBhdGggfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgKiBhcyBzeXNQYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgdHlwZSBhcyBvc1R5cGUgfSBmcm9tICdvcyc7XG5leHBvcnQgY29uc3QgU1RSX0RBVEEgPSAnZGF0YSc7XG5leHBvcnQgY29uc3QgU1RSX0VORCA9ICdlbmQnO1xuZXhwb3J0IGNvbnN0IFNUUl9DTE9TRSA9ICdjbG9zZSc7XG5leHBvcnQgY29uc3QgRU1QVFlfRk4gPSAoKSA9PiB7IH07XG5leHBvcnQgY29uc3QgSURFTlRJVFlfRk4gPSAodmFsKSA9PiB2YWw7XG5jb25zdCBwbCA9IHByb2Nlc3MucGxhdGZvcm07XG5leHBvcnQgY29uc3QgaXNXaW5kb3dzID0gcGwgPT09ICd3aW4zMic7XG5leHBvcnQgY29uc3QgaXNNYWNvcyA9IHBsID09PSAnZGFyd2luJztcbmV4cG9ydCBjb25zdCBpc0xpbnV4ID0gcGwgPT09ICdsaW51eCc7XG5leHBvcnQgY29uc3QgaXNGcmVlQlNEID0gcGwgPT09ICdmcmVlYnNkJztcbmV4cG9ydCBjb25zdCBpc0lCTWkgPSBvc1R5cGUoKSA9PT0gJ09TNDAwJztcbmV4cG9ydCBjb25zdCBFVkVOVFMgPSB7XG4gICAgQUxMOiAnYWxsJyxcbiAgICBSRUFEWTogJ3JlYWR5JyxcbiAgICBBREQ6ICdhZGQnLFxuICAgIENIQU5HRTogJ2NoYW5nZScsXG4gICAgQUREX0RJUjogJ2FkZERpcicsXG4gICAgVU5MSU5LOiAndW5saW5rJyxcbiAgICBVTkxJTktfRElSOiAndW5saW5rRGlyJyxcbiAgICBSQVc6ICdyYXcnLFxuICAgIEVSUk9SOiAnZXJyb3InLFxufTtcbmNvbnN0IEVWID0gRVZFTlRTO1xuY29uc3QgVEhST1RUTEVfTU9ERV9XQVRDSCA9ICd3YXRjaCc7XG5jb25zdCBzdGF0TWV0aG9kcyA9IHsgbHN0YXQsIHN0YXQgfTtcbmNvbnN0IEtFWV9MSVNURU5FUlMgPSAnbGlzdGVuZXJzJztcbmNvbnN0IEtFWV9FUlIgPSAnZXJySGFuZGxlcnMnO1xuY29uc3QgS0VZX1JBVyA9ICdyYXdFbWl0dGVycyc7XG5jb25zdCBIQU5ETEVSX0tFWVMgPSBbS0VZX0xJU1RFTkVSUywgS0VZX0VSUiwgS0VZX1JBV107XG4vLyBwcmV0dGllci1pZ25vcmVcbmNvbnN0IGJpbmFyeUV4dGVuc2lvbnMgPSBuZXcgU2V0KFtcbiAgICAnM2RtJywgJzNkcycsICczZzInLCAnM2dwJywgJzd6JywgJ2EnLCAnYWFjJywgJ2FkcCcsICdhZmRlc2lnbicsICdhZnBob3RvJywgJ2FmcHViJywgJ2FpJyxcbiAgICAnYWlmJywgJ2FpZmYnLCAnYWx6JywgJ2FwZScsICdhcGsnLCAnYXBwaW1hZ2UnLCAnYXInLCAnYXJqJywgJ2FzZicsICdhdScsICdhdmknLFxuICAgICdiYWsnLCAnYmFtbCcsICdiaCcsICdiaW4nLCAnYmsnLCAnYm1wJywgJ2J0aWYnLCAnYnoyJywgJ2J6aXAyJyxcbiAgICAnY2FiJywgJ2NhZicsICdjZ20nLCAnY2xhc3MnLCAnY214JywgJ2NwaW8nLCAnY3IyJywgJ2N1cicsICdkYXQnLCAnZGNtJywgJ2RlYicsICdkZXgnLCAnZGp2dScsXG4gICAgJ2RsbCcsICdkbWcnLCAnZG5nJywgJ2RvYycsICdkb2NtJywgJ2RvY3gnLCAnZG90JywgJ2RvdG0nLCAnZHJhJywgJ0RTX1N0b3JlJywgJ2RzaycsICdkdHMnLFxuICAgICdkdHNoZCcsICdkdmInLCAnZHdnJywgJ2R4ZicsXG4gICAgJ2VjZWxwNDgwMCcsICdlY2VscDc0NzAnLCAnZWNlbHA5NjAwJywgJ2VnZycsICdlb2wnLCAnZW90JywgJ2VwdWInLCAnZXhlJyxcbiAgICAnZjR2JywgJ2ZicycsICdmaCcsICdmbGEnLCAnZmxhYycsICdmbGF0cGFrJywgJ2ZsaScsICdmbHYnLCAnZnB4JywgJ2ZzdCcsICdmdnQnLFxuICAgICdnMycsICdnaCcsICdnaWYnLCAnZ3JhZmZsZScsICdneicsICdnemlwJyxcbiAgICAnaDI2MScsICdoMjYzJywgJ2gyNjQnLCAnaWNucycsICdpY28nLCAnaWVmJywgJ2ltZycsICdpcGEnLCAnaXNvJyxcbiAgICAnamFyJywgJ2pwZWcnLCAnanBnJywgJ2pwZ3YnLCAnanBtJywgJ2p4cicsICdrZXknLCAna3R4JyxcbiAgICAnbGhhJywgJ2xpYicsICdsdnAnLCAnbHonLCAnbHpoJywgJ2x6bWEnLCAnbHpvJyxcbiAgICAnbTN1JywgJ200YScsICdtNHYnLCAnbWFyJywgJ21kaScsICdtaHQnLCAnbWlkJywgJ21pZGknLCAnbWoyJywgJ21rYScsICdta3YnLCAnbW1yJywgJ21uZycsXG4gICAgJ21vYmknLCAnbW92JywgJ21vdmllJywgJ21wMycsXG4gICAgJ21wNCcsICdtcDRhJywgJ21wZWcnLCAnbXBnJywgJ21wZ2EnLCAnbXh1JyxcbiAgICAnbmVmJywgJ25weCcsICdudW1iZXJzJywgJ251cGtnJyxcbiAgICAnbycsICdvZHAnLCAnb2RzJywgJ29kdCcsICdvZ2EnLCAnb2dnJywgJ29ndicsICdvdGYnLCAnb3R0JyxcbiAgICAncGFnZXMnLCAncGJtJywgJ3BjeCcsICdwZGInLCAncGRmJywgJ3BlYScsICdwZ20nLCAncGljJywgJ3BuZycsICdwbm0nLCAncG90JywgJ3BvdG0nLFxuICAgICdwb3R4JywgJ3BwYScsICdwcGFtJyxcbiAgICAncHBtJywgJ3BwcycsICdwcHNtJywgJ3Bwc3gnLCAncHB0JywgJ3BwdG0nLCAncHB0eCcsICdwc2QnLCAncHlhJywgJ3B5YycsICdweW8nLCAncHl2JyxcbiAgICAncXQnLFxuICAgICdyYXInLCAncmFzJywgJ3JhdycsICdyZXNvdXJjZXMnLCAncmdiJywgJ3JpcCcsICdybGMnLCAncm1mJywgJ3JtdmInLCAncnBtJywgJ3J0ZicsICdyeicsXG4gICAgJ3MzbScsICdzN3onLCAnc2NwdCcsICdzZ2knLCAnc2hhcicsICdzbmFwJywgJ3NpbCcsICdza2V0Y2gnLCAnc2xrJywgJ3NtdicsICdzbmsnLCAnc28nLFxuICAgICdzdGwnLCAnc3VvJywgJ3N1YicsICdzd2YnLFxuICAgICd0YXInLCAndGJ6JywgJ3RiejInLCAndGdhJywgJ3RneicsICd0aG14JywgJ3RpZicsICd0aWZmJywgJ3RseicsICd0dGMnLCAndHRmJywgJ3R4eicsXG4gICAgJ3VkZicsICd1dmgnLCAndXZpJywgJ3V2bScsICd1dnAnLCAndXZzJywgJ3V2dScsXG4gICAgJ3ZpdicsICd2b2InLFxuICAgICd3YXInLCAnd2F2JywgJ3dheCcsICd3Ym1wJywgJ3dkcCcsICd3ZWJhJywgJ3dlYm0nLCAnd2VicCcsICd3aGwnLCAnd2ltJywgJ3dtJywgJ3dtYScsXG4gICAgJ3dtdicsICd3bXgnLCAnd29mZicsICd3b2ZmMicsICd3cm0nLCAnd3Z4JyxcbiAgICAneGJtJywgJ3hpZicsICd4bGEnLCAneGxhbScsICd4bHMnLCAneGxzYicsICd4bHNtJywgJ3hsc3gnLCAneGx0JywgJ3hsdG0nLCAneGx0eCcsICd4bScsXG4gICAgJ3htaW5kJywgJ3hwaScsICd4cG0nLCAneHdkJywgJ3h6JyxcbiAgICAneicsICd6aXAnLCAnemlweCcsXG5dKTtcbmNvbnN0IGlzQmluYXJ5UGF0aCA9IChmaWxlUGF0aCkgPT4gYmluYXJ5RXh0ZW5zaW9ucy5oYXMoc3lzUGF0aC5leHRuYW1lKGZpbGVQYXRoKS5zbGljZSgxKS50b0xvd2VyQ2FzZSgpKTtcbi8vIFRPRE86IGVtaXQgZXJyb3JzIHByb3Blcmx5LiBFeGFtcGxlOiBFTUZJTEUgb24gTWFjb3MuXG5jb25zdCBmb3JlYWNoID0gKHZhbCwgZm4pID0+IHtcbiAgICBpZiAodmFsIGluc3RhbmNlb2YgU2V0KSB7XG4gICAgICAgIHZhbC5mb3JFYWNoKGZuKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGZuKHZhbCk7XG4gICAgfVxufTtcbmNvbnN0IGFkZEFuZENvbnZlcnQgPSAobWFpbiwgcHJvcCwgaXRlbSkgPT4ge1xuICAgIGxldCBjb250YWluZXIgPSBtYWluW3Byb3BdO1xuICAgIGlmICghKGNvbnRhaW5lciBpbnN0YW5jZW9mIFNldCkpIHtcbiAgICAgICAgbWFpbltwcm9wXSA9IGNvbnRhaW5lciA9IG5ldyBTZXQoW2NvbnRhaW5lcl0pO1xuICAgIH1cbiAgICBjb250YWluZXIuYWRkKGl0ZW0pO1xufTtcbmNvbnN0IGNsZWFySXRlbSA9IChjb250KSA9PiAoa2V5KSA9PiB7XG4gICAgY29uc3Qgc2V0ID0gY29udFtrZXldO1xuICAgIGlmIChzZXQgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICAgICAgc2V0LmNsZWFyKCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBkZWxldGUgY29udFtrZXldO1xuICAgIH1cbn07XG5jb25zdCBkZWxGcm9tU2V0ID0gKG1haW4sIHByb3AsIGl0ZW0pID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPSBtYWluW3Byb3BdO1xuICAgIGlmIChjb250YWluZXIgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICAgICAgY29udGFpbmVyLmRlbGV0ZShpdGVtKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoY29udGFpbmVyID09PSBpdGVtKSB7XG4gICAgICAgIGRlbGV0ZSBtYWluW3Byb3BdO1xuICAgIH1cbn07XG5jb25zdCBpc0VtcHR5U2V0ID0gKHZhbCkgPT4gKHZhbCBpbnN0YW5jZW9mIFNldCA/IHZhbC5zaXplID09PSAwIDogIXZhbCk7XG5jb25zdCBGc1dhdGNoSW5zdGFuY2VzID0gbmV3IE1hcCgpO1xuLyoqXG4gKiBJbnN0YW50aWF0ZXMgdGhlIGZzX3dhdGNoIGludGVyZmFjZVxuICogQHBhcmFtIHBhdGggdG8gYmUgd2F0Y2hlZFxuICogQHBhcmFtIG9wdGlvbnMgdG8gYmUgcGFzc2VkIHRvIGZzX3dhdGNoXG4gKiBAcGFyYW0gbGlzdGVuZXIgbWFpbiBldmVudCBoYW5kbGVyXG4gKiBAcGFyYW0gZXJySGFuZGxlciBlbWl0cyBpbmZvIGFib3V0IGVycm9yc1xuICogQHBhcmFtIGVtaXRSYXcgZW1pdHMgcmF3IGV2ZW50IGRhdGFcbiAqIEByZXR1cm5zIHtOYXRpdmVGc1dhdGNoZXJ9XG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUZzV2F0Y2hJbnN0YW5jZShwYXRoLCBvcHRpb25zLCBsaXN0ZW5lciwgZXJySGFuZGxlciwgZW1pdFJhdykge1xuICAgIGNvbnN0IGhhbmRsZUV2ZW50ID0gKHJhd0V2ZW50LCBldlBhdGgpID0+IHtcbiAgICAgICAgbGlzdGVuZXIocGF0aCk7XG4gICAgICAgIGVtaXRSYXcocmF3RXZlbnQsIGV2UGF0aCwgeyB3YXRjaGVkUGF0aDogcGF0aCB9KTtcbiAgICAgICAgLy8gZW1pdCBiYXNlZCBvbiBldmVudHMgb2NjdXJyaW5nIGZvciBmaWxlcyBmcm9tIGEgZGlyZWN0b3J5J3Mgd2F0Y2hlciBpblxuICAgICAgICAvLyBjYXNlIHRoZSBmaWxlJ3Mgd2F0Y2hlciBtaXNzZXMgaXQgKGFuZCByZWx5IG9uIHRocm90dGxpbmcgdG8gZGUtZHVwZSlcbiAgICAgICAgaWYgKGV2UGF0aCAmJiBwYXRoICE9PSBldlBhdGgpIHtcbiAgICAgICAgICAgIGZzV2F0Y2hCcm9hZGNhc3Qoc3lzUGF0aC5yZXNvbHZlKHBhdGgsIGV2UGF0aCksIEtFWV9MSVNURU5FUlMsIHN5c1BhdGguam9pbihwYXRoLCBldlBhdGgpKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGZzX3dhdGNoKHBhdGgsIHtcbiAgICAgICAgICAgIHBlcnNpc3RlbnQ6IG9wdGlvbnMucGVyc2lzdGVudCxcbiAgICAgICAgfSwgaGFuZGxlRXZlbnQpO1xuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgZXJySGFuZGxlcihlcnJvcik7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxufVxuLyoqXG4gKiBIZWxwZXIgZm9yIHBhc3NpbmcgZnNfd2F0Y2ggZXZlbnQgZGF0YSB0byBhIGNvbGxlY3Rpb24gb2YgbGlzdGVuZXJzXG4gKiBAcGFyYW0gZnVsbFBhdGggYWJzb2x1dGUgcGF0aCBib3VuZCB0byBmc193YXRjaCBpbnN0YW5jZVxuICovXG5jb25zdCBmc1dhdGNoQnJvYWRjYXN0ID0gKGZ1bGxQYXRoLCBsaXN0ZW5lclR5cGUsIHZhbDEsIHZhbDIsIHZhbDMpID0+IHtcbiAgICBjb25zdCBjb250ID0gRnNXYXRjaEluc3RhbmNlcy5nZXQoZnVsbFBhdGgpO1xuICAgIGlmICghY29udClcbiAgICAgICAgcmV0dXJuO1xuICAgIGZvcmVhY2goY29udFtsaXN0ZW5lclR5cGVdLCAobGlzdGVuZXIpID0+IHtcbiAgICAgICAgbGlzdGVuZXIodmFsMSwgdmFsMiwgdmFsMyk7XG4gICAgfSk7XG59O1xuLyoqXG4gKiBJbnN0YW50aWF0ZXMgdGhlIGZzX3dhdGNoIGludGVyZmFjZSBvciBiaW5kcyBsaXN0ZW5lcnNcbiAqIHRvIGFuIGV4aXN0aW5nIG9uZSBjb3ZlcmluZyB0aGUgc2FtZSBmaWxlIHN5c3RlbSBlbnRyeVxuICogQHBhcmFtIHBhdGhcbiAqIEBwYXJhbSBmdWxsUGF0aCBhYnNvbHV0ZSBwYXRoXG4gKiBAcGFyYW0gb3B0aW9ucyB0byBiZSBwYXNzZWQgdG8gZnNfd2F0Y2hcbiAqIEBwYXJhbSBoYW5kbGVycyBjb250YWluZXIgZm9yIGV2ZW50IGxpc3RlbmVyIGZ1bmN0aW9uc1xuICovXG5jb25zdCBzZXRGc1dhdGNoTGlzdGVuZXIgPSAocGF0aCwgZnVsbFBhdGgsIG9wdGlvbnMsIGhhbmRsZXJzKSA9PiB7XG4gICAgY29uc3QgeyBsaXN0ZW5lciwgZXJySGFuZGxlciwgcmF3RW1pdHRlciB9ID0gaGFuZGxlcnM7XG4gICAgbGV0IGNvbnQgPSBGc1dhdGNoSW5zdGFuY2VzLmdldChmdWxsUGF0aCk7XG4gICAgbGV0IHdhdGNoZXI7XG4gICAgaWYgKCFvcHRpb25zLnBlcnNpc3RlbnQpIHtcbiAgICAgICAgd2F0Y2hlciA9IGNyZWF0ZUZzV2F0Y2hJbnN0YW5jZShwYXRoLCBvcHRpb25zLCBsaXN0ZW5lciwgZXJySGFuZGxlciwgcmF3RW1pdHRlcik7XG4gICAgICAgIGlmICghd2F0Y2hlcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgcmV0dXJuIHdhdGNoZXIuY2xvc2UuYmluZCh3YXRjaGVyKTtcbiAgICB9XG4gICAgaWYgKGNvbnQpIHtcbiAgICAgICAgYWRkQW5kQ29udmVydChjb250LCBLRVlfTElTVEVORVJTLCBsaXN0ZW5lcik7XG4gICAgICAgIGFkZEFuZENvbnZlcnQoY29udCwgS0VZX0VSUiwgZXJySGFuZGxlcik7XG4gICAgICAgIGFkZEFuZENvbnZlcnQoY29udCwgS0VZX1JBVywgcmF3RW1pdHRlcik7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB3YXRjaGVyID0gY3JlYXRlRnNXYXRjaEluc3RhbmNlKHBhdGgsIG9wdGlvbnMsIGZzV2F0Y2hCcm9hZGNhc3QuYmluZChudWxsLCBmdWxsUGF0aCwgS0VZX0xJU1RFTkVSUyksIGVyckhhbmRsZXIsIC8vIG5vIG5lZWQgdG8gdXNlIGJyb2FkY2FzdCBoZXJlXG4gICAgICAgIGZzV2F0Y2hCcm9hZGNhc3QuYmluZChudWxsLCBmdWxsUGF0aCwgS0VZX1JBVykpO1xuICAgICAgICBpZiAoIXdhdGNoZXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHdhdGNoZXIub24oRVYuRVJST1IsIGFzeW5jIChlcnJvcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnJvYWRjYXN0RXJyID0gZnNXYXRjaEJyb2FkY2FzdC5iaW5kKG51bGwsIGZ1bGxQYXRoLCBLRVlfRVJSKTtcbiAgICAgICAgICAgIGlmIChjb250KVxuICAgICAgICAgICAgICAgIGNvbnQud2F0Y2hlclVudXNhYmxlID0gdHJ1ZTsgLy8gZG9jdW1lbnRlZCBzaW5jZSBOb2RlIDEwLjQuMVxuICAgICAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy80MzM3XG4gICAgICAgICAgICBpZiAoaXNXaW5kb3dzICYmIGVycm9yLmNvZGUgPT09ICdFUEVSTScpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmZCA9IGF3YWl0IG9wZW4ocGF0aCwgJ3InKTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZmQuY2xvc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJvYWRjYXN0RXJyKGVycm9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAvLyBkbyBub3RoaW5nXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYnJvYWRjYXN0RXJyKGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnQgPSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnM6IGxpc3RlbmVyLFxuICAgICAgICAgICAgZXJySGFuZGxlcnM6IGVyckhhbmRsZXIsXG4gICAgICAgICAgICByYXdFbWl0dGVyczogcmF3RW1pdHRlcixcbiAgICAgICAgICAgIHdhdGNoZXIsXG4gICAgICAgIH07XG4gICAgICAgIEZzV2F0Y2hJbnN0YW5jZXMuc2V0KGZ1bGxQYXRoLCBjb250KTtcbiAgICB9XG4gICAgLy8gY29uc3QgaW5kZXggPSBjb250Lmxpc3RlbmVycy5pbmRleE9mKGxpc3RlbmVyKTtcbiAgICAvLyByZW1vdmVzIHRoaXMgaW5zdGFuY2UncyBsaXN0ZW5lcnMgYW5kIGNsb3NlcyB0aGUgdW5kZXJseWluZyBmc193YXRjaFxuICAgIC8vIGluc3RhbmNlIGlmIHRoZXJlIGFyZSBubyBtb3JlIGxpc3RlbmVycyBsZWZ0XG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgZGVsRnJvbVNldChjb250LCBLRVlfTElTVEVORVJTLCBsaXN0ZW5lcik7XG4gICAgICAgIGRlbEZyb21TZXQoY29udCwgS0VZX0VSUiwgZXJySGFuZGxlcik7XG4gICAgICAgIGRlbEZyb21TZXQoY29udCwgS0VZX1JBVywgcmF3RW1pdHRlcik7XG4gICAgICAgIGlmIChpc0VtcHR5U2V0KGNvbnQubGlzdGVuZXJzKSkge1xuICAgICAgICAgICAgLy8gQ2hlY2sgdG8gcHJvdGVjdCBhZ2FpbnN0IGlzc3VlIGdoLTczMC5cbiAgICAgICAgICAgIC8vIGlmIChjb250LndhdGNoZXJVbnVzYWJsZSkge1xuICAgICAgICAgICAgY29udC53YXRjaGVyLmNsb3NlKCk7XG4gICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICBGc1dhdGNoSW5zdGFuY2VzLmRlbGV0ZShmdWxsUGF0aCk7XG4gICAgICAgICAgICBIQU5ETEVSX0tFWVMuZm9yRWFjaChjbGVhckl0ZW0oY29udCkpO1xuICAgICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgICAgY29udC53YXRjaGVyID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgT2JqZWN0LmZyZWV6ZShjb250KTtcbiAgICAgICAgfVxuICAgIH07XG59O1xuLy8gZnNfd2F0Y2hGaWxlIGhlbHBlcnNcbi8vIG9iamVjdCB0byBob2xkIHBlci1wcm9jZXNzIGZzX3dhdGNoRmlsZSBpbnN0YW5jZXNcbi8vIChtYXkgYmUgc2hhcmVkIGFjcm9zcyBjaG9raWRhciBGU1dhdGNoZXIgaW5zdGFuY2VzKVxuY29uc3QgRnNXYXRjaEZpbGVJbnN0YW5jZXMgPSBuZXcgTWFwKCk7XG4vKipcbiAqIEluc3RhbnRpYXRlcyB0aGUgZnNfd2F0Y2hGaWxlIGludGVyZmFjZSBvciBiaW5kcyBsaXN0ZW5lcnNcbiAqIHRvIGFuIGV4aXN0aW5nIG9uZSBjb3ZlcmluZyB0aGUgc2FtZSBmaWxlIHN5c3RlbSBlbnRyeVxuICogQHBhcmFtIHBhdGggdG8gYmUgd2F0Y2hlZFxuICogQHBhcmFtIGZ1bGxQYXRoIGFic29sdXRlIHBhdGhcbiAqIEBwYXJhbSBvcHRpb25zIG9wdGlvbnMgdG8gYmUgcGFzc2VkIHRvIGZzX3dhdGNoRmlsZVxuICogQHBhcmFtIGhhbmRsZXJzIGNvbnRhaW5lciBmb3IgZXZlbnQgbGlzdGVuZXIgZnVuY3Rpb25zXG4gKiBAcmV0dXJucyBjbG9zZXJcbiAqL1xuY29uc3Qgc2V0RnNXYXRjaEZpbGVMaXN0ZW5lciA9IChwYXRoLCBmdWxsUGF0aCwgb3B0aW9ucywgaGFuZGxlcnMpID0+IHtcbiAgICBjb25zdCB7IGxpc3RlbmVyLCByYXdFbWl0dGVyIH0gPSBoYW5kbGVycztcbiAgICBsZXQgY29udCA9IEZzV2F0Y2hGaWxlSW5zdGFuY2VzLmdldChmdWxsUGF0aCk7XG4gICAgLy8gbGV0IGxpc3RlbmVycyA9IG5ldyBTZXQoKTtcbiAgICAvLyBsZXQgcmF3RW1pdHRlcnMgPSBuZXcgU2V0KCk7XG4gICAgY29uc3QgY29wdHMgPSBjb250ICYmIGNvbnQub3B0aW9ucztcbiAgICBpZiAoY29wdHMgJiYgKGNvcHRzLnBlcnNpc3RlbnQgPCBvcHRpb25zLnBlcnNpc3RlbnQgfHwgY29wdHMuaW50ZXJ2YWwgPiBvcHRpb25zLmludGVydmFsKSkge1xuICAgICAgICAvLyBcIlVwZ3JhZGVcIiB0aGUgd2F0Y2hlciB0byBwZXJzaXN0ZW5jZSBvciBhIHF1aWNrZXIgaW50ZXJ2YWwuXG4gICAgICAgIC8vIFRoaXMgY3JlYXRlcyBzb21lIHVubGlrZWx5IGVkZ2UgY2FzZSBpc3N1ZXMgaWYgdGhlIHVzZXIgbWl4ZXNcbiAgICAgICAgLy8gc2V0dGluZ3MgaW4gYSB2ZXJ5IHdlaXJkIHdheSwgYnV0IHNvbHZpbmcgZm9yIHRob3NlIGNhc2VzXG4gICAgICAgIC8vIGRvZXNuJ3Qgc2VlbSB3b3J0aHdoaWxlIGZvciB0aGUgYWRkZWQgY29tcGxleGl0eS5cbiAgICAgICAgLy8gbGlzdGVuZXJzID0gY29udC5saXN0ZW5lcnM7XG4gICAgICAgIC8vIHJhd0VtaXR0ZXJzID0gY29udC5yYXdFbWl0dGVycztcbiAgICAgICAgdW53YXRjaEZpbGUoZnVsbFBhdGgpO1xuICAgICAgICBjb250ID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBpZiAoY29udCkge1xuICAgICAgICBhZGRBbmRDb252ZXJ0KGNvbnQsIEtFWV9MSVNURU5FUlMsIGxpc3RlbmVyKTtcbiAgICAgICAgYWRkQW5kQ29udmVydChjb250LCBLRVlfUkFXLCByYXdFbWl0dGVyKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIC8vIFRPRE9cbiAgICAgICAgLy8gbGlzdGVuZXJzLmFkZChsaXN0ZW5lcik7XG4gICAgICAgIC8vIHJhd0VtaXR0ZXJzLmFkZChyYXdFbWl0dGVyKTtcbiAgICAgICAgY29udCA9IHtcbiAgICAgICAgICAgIGxpc3RlbmVyczogbGlzdGVuZXIsXG4gICAgICAgICAgICByYXdFbWl0dGVyczogcmF3RW1pdHRlcixcbiAgICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICAgICB3YXRjaGVyOiB3YXRjaEZpbGUoZnVsbFBhdGgsIG9wdGlvbnMsIChjdXJyLCBwcmV2KSA9PiB7XG4gICAgICAgICAgICAgICAgZm9yZWFjaChjb250LnJhd0VtaXR0ZXJzLCAocmF3RW1pdHRlcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICByYXdFbWl0dGVyKEVWLkNIQU5HRSwgZnVsbFBhdGgsIHsgY3VyciwgcHJldiB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJybXRpbWUgPSBjdXJyLm10aW1lTXM7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnIuc2l6ZSAhPT0gcHJldi5zaXplIHx8IGN1cnJtdGltZSA+IHByZXYubXRpbWVNcyB8fCBjdXJybXRpbWUgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yZWFjaChjb250Lmxpc3RlbmVycywgKGxpc3RlbmVyKSA9PiBsaXN0ZW5lcihwYXRoLCBjdXJyKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSksXG4gICAgICAgIH07XG4gICAgICAgIEZzV2F0Y2hGaWxlSW5zdGFuY2VzLnNldChmdWxsUGF0aCwgY29udCk7XG4gICAgfVxuICAgIC8vIGNvbnN0IGluZGV4ID0gY29udC5saXN0ZW5lcnMuaW5kZXhPZihsaXN0ZW5lcik7XG4gICAgLy8gUmVtb3ZlcyB0aGlzIGluc3RhbmNlJ3MgbGlzdGVuZXJzIGFuZCBjbG9zZXMgdGhlIHVuZGVybHlpbmcgZnNfd2F0Y2hGaWxlXG4gICAgLy8gaW5zdGFuY2UgaWYgdGhlcmUgYXJlIG5vIG1vcmUgbGlzdGVuZXJzIGxlZnQuXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgICAgZGVsRnJvbVNldChjb250LCBLRVlfTElTVEVORVJTLCBsaXN0ZW5lcik7XG4gICAgICAgIGRlbEZyb21TZXQoY29udCwgS0VZX1JBVywgcmF3RW1pdHRlcik7XG4gICAgICAgIGlmIChpc0VtcHR5U2V0KGNvbnQubGlzdGVuZXJzKSkge1xuICAgICAgICAgICAgRnNXYXRjaEZpbGVJbnN0YW5jZXMuZGVsZXRlKGZ1bGxQYXRoKTtcbiAgICAgICAgICAgIHVud2F0Y2hGaWxlKGZ1bGxQYXRoKTtcbiAgICAgICAgICAgIGNvbnQub3B0aW9ucyA9IGNvbnQud2F0Y2hlciA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIE9iamVjdC5mcmVlemUoY29udCk7XG4gICAgICAgIH1cbiAgICB9O1xufTtcbi8qKlxuICogQG1peGluXG4gKi9cbmV4cG9ydCBjbGFzcyBOb2RlRnNIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3Rvcihmc1cpIHtcbiAgICAgICAgdGhpcy5mc3cgPSBmc1c7XG4gICAgICAgIHRoaXMuX2JvdW5kSGFuZGxlRXJyb3IgPSAoZXJyb3IpID0+IGZzVy5faGFuZGxlRXJyb3IoZXJyb3IpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXYXRjaCBmaWxlIGZvciBjaGFuZ2VzIHdpdGggZnNfd2F0Y2hGaWxlIG9yIGZzX3dhdGNoLlxuICAgICAqIEBwYXJhbSBwYXRoIHRvIGZpbGUgb3IgZGlyXG4gICAgICogQHBhcmFtIGxpc3RlbmVyIG9uIGZzIGNoYW5nZVxuICAgICAqIEByZXR1cm5zIGNsb3NlciBmb3IgdGhlIHdhdGNoZXIgaW5zdGFuY2VcbiAgICAgKi9cbiAgICBfd2F0Y2hXaXRoTm9kZUZzKHBhdGgsIGxpc3RlbmVyKSB7XG4gICAgICAgIGNvbnN0IG9wdHMgPSB0aGlzLmZzdy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkaXJlY3RvcnkgPSBzeXNQYXRoLmRpcm5hbWUocGF0aCk7XG4gICAgICAgIGNvbnN0IGJhc2VuYW1lID0gc3lzUGF0aC5iYXNlbmFtZShwYXRoKTtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gdGhpcy5mc3cuX2dldFdhdGNoZWREaXIoZGlyZWN0b3J5KTtcbiAgICAgICAgcGFyZW50LmFkZChiYXNlbmFtZSk7XG4gICAgICAgIGNvbnN0IGFic29sdXRlUGF0aCA9IHN5c1BhdGgucmVzb2x2ZShwYXRoKTtcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHBlcnNpc3RlbnQ6IG9wdHMucGVyc2lzdGVudCxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFsaXN0ZW5lcilcbiAgICAgICAgICAgIGxpc3RlbmVyID0gRU1QVFlfRk47XG4gICAgICAgIGxldCBjbG9zZXI7XG4gICAgICAgIGlmIChvcHRzLnVzZVBvbGxpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IGVuYWJsZUJpbiA9IG9wdHMuaW50ZXJ2YWwgIT09IG9wdHMuYmluYXJ5SW50ZXJ2YWw7XG4gICAgICAgICAgICBvcHRpb25zLmludGVydmFsID0gZW5hYmxlQmluICYmIGlzQmluYXJ5UGF0aChiYXNlbmFtZSkgPyBvcHRzLmJpbmFyeUludGVydmFsIDogb3B0cy5pbnRlcnZhbDtcbiAgICAgICAgICAgIGNsb3NlciA9IHNldEZzV2F0Y2hGaWxlTGlzdGVuZXIocGF0aCwgYWJzb2x1dGVQYXRoLCBvcHRpb25zLCB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIsXG4gICAgICAgICAgICAgICAgcmF3RW1pdHRlcjogdGhpcy5mc3cuX2VtaXRSYXcsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNsb3NlciA9IHNldEZzV2F0Y2hMaXN0ZW5lcihwYXRoLCBhYnNvbHV0ZVBhdGgsIG9wdGlvbnMsIHtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcixcbiAgICAgICAgICAgICAgICBlcnJIYW5kbGVyOiB0aGlzLl9ib3VuZEhhbmRsZUVycm9yLFxuICAgICAgICAgICAgICAgIHJhd0VtaXR0ZXI6IHRoaXMuZnN3Ll9lbWl0UmF3LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNsb3NlcjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogV2F0Y2ggYSBmaWxlIGFuZCBlbWl0IGFkZCBldmVudCBpZiB3YXJyYW50ZWQuXG4gICAgICogQHJldHVybnMgY2xvc2VyIGZvciB0aGUgd2F0Y2hlciBpbnN0YW5jZVxuICAgICAqL1xuICAgIF9oYW5kbGVGaWxlKGZpbGUsIHN0YXRzLCBpbml0aWFsQWRkKSB7XG4gICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkaXJuYW1lID0gc3lzUGF0aC5kaXJuYW1lKGZpbGUpO1xuICAgICAgICBjb25zdCBiYXNlbmFtZSA9IHN5c1BhdGguYmFzZW5hbWUoZmlsZSk7XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHRoaXMuZnN3Ll9nZXRXYXRjaGVkRGlyKGRpcm5hbWUpO1xuICAgICAgICAvLyBzdGF0cyBpcyBhbHdheXMgcHJlc2VudFxuICAgICAgICBsZXQgcHJldlN0YXRzID0gc3RhdHM7XG4gICAgICAgIC8vIGlmIHRoZSBmaWxlIGlzIGFscmVhZHkgYmVpbmcgd2F0Y2hlZCwgZG8gbm90aGluZ1xuICAgICAgICBpZiAocGFyZW50LmhhcyhiYXNlbmFtZSkpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGNvbnN0IGxpc3RlbmVyID0gYXN5bmMgKHBhdGgsIG5ld1N0YXRzKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuZnN3Ll90aHJvdHRsZShUSFJPVFRMRV9NT0RFX1dBVENILCBmaWxlLCA1KSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBpZiAoIW5ld1N0YXRzIHx8IG5ld1N0YXRzLm10aW1lTXMgPT09IDApIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdTdGF0cyA9IGF3YWl0IHN0YXQoZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIHRoYXQgY2hhbmdlIGV2ZW50IHdhcyBub3QgZmlyZWQgYmVjYXVzZSBvZiBjaGFuZ2VkIG9ubHkgYWNjZXNzVGltZS5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXQgPSBuZXdTdGF0cy5hdGltZU1zO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtdCA9IG5ld1N0YXRzLm10aW1lTXM7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXQgfHwgYXQgPD0gbXQgfHwgbXQgIT09IHByZXZTdGF0cy5tdGltZU1zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fZW1pdChFVi5DSEFOR0UsIGZpbGUsIG5ld1N0YXRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoKGlzTWFjb3MgfHwgaXNMaW51eCB8fCBpc0ZyZWVCU0QpICYmIHByZXZTdGF0cy5pbm8gIT09IG5ld1N0YXRzLmlubykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX2Nsb3NlRmlsZShwYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXZTdGF0cyA9IG5ld1N0YXRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xvc2VyID0gdGhpcy5fd2F0Y2hXaXRoTm9kZUZzKGZpbGUsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbG9zZXIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX2FkZFBhdGhDbG9zZXIocGF0aCwgY2xvc2VyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXZTdGF0cyA9IG5ld1N0YXRzO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXggaXNzdWVzIHdoZXJlIG10aW1lIGlzIG51bGwgYnV0IGZpbGUgaXMgc3RpbGwgcHJlc2VudFxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fcmVtb3ZlKGRpcm5hbWUsIGJhc2VuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gYWRkIGlzIGFib3V0IHRvIGJlIGVtaXR0ZWQgaWYgZmlsZSBub3QgYWxyZWFkeSB0cmFja2VkIGluIHBhcmVudFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAocGFyZW50LmhhcyhiYXNlbmFtZSkpIHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayB0aGF0IGNoYW5nZSBldmVudCB3YXMgbm90IGZpcmVkIGJlY2F1c2Ugb2YgY2hhbmdlZCBvbmx5IGFjY2Vzc1RpbWUuXG4gICAgICAgICAgICAgICAgY29uc3QgYXQgPSBuZXdTdGF0cy5hdGltZU1zO1xuICAgICAgICAgICAgICAgIGNvbnN0IG10ID0gbmV3U3RhdHMubXRpbWVNcztcbiAgICAgICAgICAgICAgICBpZiAoIWF0IHx8IGF0IDw9IG10IHx8IG10ICE9PSBwcmV2U3RhdHMubXRpbWVNcykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fZW1pdChFVi5DSEFOR0UsIGZpbGUsIG5ld1N0YXRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldlN0YXRzID0gbmV3U3RhdHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIGtpY2sgb2ZmIHRoZSB3YXRjaGVyXG4gICAgICAgIGNvbnN0IGNsb3NlciA9IHRoaXMuX3dhdGNoV2l0aE5vZGVGcyhmaWxlLCBsaXN0ZW5lcik7XG4gICAgICAgIC8vIGVtaXQgYW4gYWRkIGV2ZW50IGlmIHdlJ3JlIHN1cHBvc2VkIHRvXG4gICAgICAgIGlmICghKGluaXRpYWxBZGQgJiYgdGhpcy5mc3cub3B0aW9ucy5pZ25vcmVJbml0aWFsKSAmJiB0aGlzLmZzdy5faXNudElnbm9yZWQoZmlsZSkpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5mc3cuX3Rocm90dGxlKEVWLkFERCwgZmlsZSwgMCkpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXQoRVYuQURELCBmaWxlLCBzdGF0cyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNsb3NlcjtcbiAgICB9XG4gICAgLyoqXG4gICAgICogSGFuZGxlIHN5bWxpbmtzIGVuY291bnRlcmVkIHdoaWxlIHJlYWRpbmcgYSBkaXIuXG4gICAgICogQHBhcmFtIGVudHJ5IHJldHVybmVkIGJ5IHJlYWRkaXJwXG4gICAgICogQHBhcmFtIGRpcmVjdG9yeSBwYXRoIG9mIGRpciBiZWluZyByZWFkXG4gICAgICogQHBhcmFtIHBhdGggb2YgdGhpcyBpdGVtXG4gICAgICogQHBhcmFtIGl0ZW0gYmFzZW5hbWUgb2YgdGhpcyBpdGVtXG4gICAgICogQHJldHVybnMgdHJ1ZSBpZiBubyBtb3JlIHByb2Nlc3NpbmcgaXMgbmVlZGVkIGZvciB0aGlzIGVudHJ5LlxuICAgICAqL1xuICAgIGFzeW5jIF9oYW5kbGVTeW1saW5rKGVudHJ5LCBkaXJlY3RvcnksIHBhdGgsIGl0ZW0pIHtcbiAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZ1bGwgPSBlbnRyeS5mdWxsUGF0aDtcbiAgICAgICAgY29uc3QgZGlyID0gdGhpcy5mc3cuX2dldFdhdGNoZWREaXIoZGlyZWN0b3J5KTtcbiAgICAgICAgaWYgKCF0aGlzLmZzdy5vcHRpb25zLmZvbGxvd1N5bWxpbmtzKSB7XG4gICAgICAgICAgICAvLyB3YXRjaCBzeW1saW5rIGRpcmVjdGx5IChkb24ndCBmb2xsb3cpIGFuZCBkZXRlY3QgY2hhbmdlc1xuICAgICAgICAgICAgdGhpcy5mc3cuX2luY3JSZWFkeUNvdW50KCk7XG4gICAgICAgICAgICBsZXQgbGlua1BhdGg7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGxpbmtQYXRoID0gYXdhaXQgZnNyZWFscGF0aChwYXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXRSZWFkeSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBpZiAoZGlyLmhhcyhpdGVtKSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5fc3ltbGlua1BhdGhzLmdldChmdWxsKSAhPT0gbGlua1BhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX3N5bWxpbmtQYXRocy5zZXQoZnVsbCwgbGlua1BhdGgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmZzdy5fZW1pdChFVi5DSEFOR0UsIHBhdGgsIGVudHJ5LnN0YXRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkaXIuYWRkKGl0ZW0pO1xuICAgICAgICAgICAgICAgIHRoaXMuZnN3Ll9zeW1saW5rUGF0aHMuc2V0KGZ1bGwsIGxpbmtQYXRoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZzdy5fZW1pdChFVi5BREQsIHBhdGgsIGVudHJ5LnN0YXRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZnN3Ll9lbWl0UmVhZHkoKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGRvbid0IGZvbGxvdyB0aGUgc2FtZSBzeW1saW5rIG1vcmUgdGhhbiBvbmNlXG4gICAgICAgIGlmICh0aGlzLmZzdy5fc3ltbGlua1BhdGhzLmhhcyhmdWxsKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5mc3cuX3N5bWxpbmtQYXRocy5zZXQoZnVsbCwgdHJ1ZSk7XG4gICAgfVxuICAgIF9oYW5kbGVSZWFkKGRpcmVjdG9yeSwgaW5pdGlhbEFkZCwgd2gsIHRhcmdldCwgZGlyLCBkZXB0aCwgdGhyb3R0bGVyKSB7XG4gICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgZGlyZWN0b3J5IG5hbWUgb24gV2luZG93c1xuICAgICAgICBkaXJlY3RvcnkgPSBzeXNQYXRoLmpvaW4oZGlyZWN0b3J5LCAnJyk7XG4gICAgICAgIHRocm90dGxlciA9IHRoaXMuZnN3Ll90aHJvdHRsZSgncmVhZGRpcicsIGRpcmVjdG9yeSwgMTAwMCk7XG4gICAgICAgIGlmICghdGhyb3R0bGVyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IHRoaXMuZnN3Ll9nZXRXYXRjaGVkRGlyKHdoLnBhdGgpO1xuICAgICAgICBjb25zdCBjdXJyZW50ID0gbmV3IFNldCgpO1xuICAgICAgICBsZXQgc3RyZWFtID0gdGhpcy5mc3cuX3JlYWRkaXJwKGRpcmVjdG9yeSwge1xuICAgICAgICAgICAgZmlsZUZpbHRlcjogKGVudHJ5KSA9PiB3aC5maWx0ZXJQYXRoKGVudHJ5KSxcbiAgICAgICAgICAgIGRpcmVjdG9yeUZpbHRlcjogKGVudHJ5KSA9PiB3aC5maWx0ZXJEaXIoZW50cnkpLFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCFzdHJlYW0pXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHN0cmVhbVxuICAgICAgICAgICAgLm9uKFNUUl9EQVRBLCBhc3luYyAoZW50cnkpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpIHtcbiAgICAgICAgICAgICAgICBzdHJlYW0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaXRlbSA9IGVudHJ5LnBhdGg7XG4gICAgICAgICAgICBsZXQgcGF0aCA9IHN5c1BhdGguam9pbihkaXJlY3RvcnksIGl0ZW0pO1xuICAgICAgICAgICAgY3VycmVudC5hZGQoaXRlbSk7XG4gICAgICAgICAgICBpZiAoZW50cnkuc3RhdHMuaXNTeW1ib2xpY0xpbmsoKSAmJlxuICAgICAgICAgICAgICAgIChhd2FpdCB0aGlzLl9oYW5kbGVTeW1saW5rKGVudHJ5LCBkaXJlY3RvcnksIHBhdGgsIGl0ZW0pKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpIHtcbiAgICAgICAgICAgICAgICBzdHJlYW0gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRmlsZXMgdGhhdCBwcmVzZW50IGluIGN1cnJlbnQgZGlyZWN0b3J5IHNuYXBzaG90XG4gICAgICAgICAgICAvLyBidXQgYWJzZW50IGluIHByZXZpb3VzIGFyZSBhZGRlZCB0byB3YXRjaCBsaXN0IGFuZFxuICAgICAgICAgICAgLy8gZW1pdCBgYWRkYCBldmVudC5cbiAgICAgICAgICAgIGlmIChpdGVtID09PSB0YXJnZXQgfHwgKCF0YXJnZXQgJiYgIXByZXZpb3VzLmhhcyhpdGVtKSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZzdy5faW5jclJlYWR5Q291bnQoKTtcbiAgICAgICAgICAgICAgICAvLyBlbnN1cmUgcmVsYXRpdmVuZXNzIG9mIHBhdGggaXMgcHJlc2VydmVkIGluIGNhc2Ugb2Ygd2F0Y2hlciByZXVzZVxuICAgICAgICAgICAgICAgIHBhdGggPSBzeXNQYXRoLmpvaW4oZGlyLCBzeXNQYXRoLnJlbGF0aXZlKGRpciwgcGF0aCkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkZFRvTm9kZUZzKHBhdGgsIGluaXRpYWxBZGQsIHdoLCBkZXB0aCArIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAgICAgLm9uKEVWLkVSUk9SLCB0aGlzLl9ib3VuZEhhbmRsZUVycm9yKTtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGlmICghc3RyZWFtKVxuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoKTtcbiAgICAgICAgICAgIHN0cmVhbS5vbmNlKFNUUl9FTkQsICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0cmVhbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCB3YXNUaHJvdHRsZWQgPSB0aHJvdHRsZXIgPyB0aHJvdHRsZXIuY2xlYXIoKSA6IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJlc29sdmUodW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICAvLyBGaWxlcyB0aGF0IGFic2VudCBpbiBjdXJyZW50IGRpcmVjdG9yeSBzbmFwc2hvdFxuICAgICAgICAgICAgICAgIC8vIGJ1dCBwcmVzZW50IGluIHByZXZpb3VzIGVtaXQgYHJlbW92ZWAgZXZlbnRcbiAgICAgICAgICAgICAgICAvLyBhbmQgYXJlIHJlbW92ZWQgZnJvbSBAd2F0Y2hlZFtkaXJlY3RvcnldLlxuICAgICAgICAgICAgICAgIHByZXZpb3VzXG4gICAgICAgICAgICAgICAgICAgIC5nZXRDaGlsZHJlbigpXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW0gIT09IGRpcmVjdG9yeSAmJiAhY3VycmVudC5oYXMoaXRlbSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX3JlbW92ZShkaXJlY3RvcnksIGl0ZW0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN0cmVhbSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAvLyBvbmUgbW9yZSB0aW1lIGZvciBhbnkgbWlzc2VkIGluIGNhc2UgY2hhbmdlcyBjYW1lIGluIGV4dHJlbWVseSBxdWlja2x5XG4gICAgICAgICAgICAgICAgaWYgKHdhc1Rocm90dGxlZClcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faGFuZGxlUmVhZChkaXJlY3RvcnksIGZhbHNlLCB3aCwgdGFyZ2V0LCBkaXIsIGRlcHRoLCB0aHJvdHRsZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGRpcmVjdG9yeSB0byBhZGQgLyByZW1vdmUgZmlsZXMgZnJvbSBgQHdhdGNoZWRgIGxpc3QgYW5kIHJlLXJlYWQgaXQgb24gY2hhbmdlLlxuICAgICAqIEBwYXJhbSBkaXIgZnMgcGF0aFxuICAgICAqIEBwYXJhbSBzdGF0c1xuICAgICAqIEBwYXJhbSBpbml0aWFsQWRkXG4gICAgICogQHBhcmFtIGRlcHRoIHJlbGF0aXZlIHRvIHVzZXItc3VwcGxpZWQgcGF0aFxuICAgICAqIEBwYXJhbSB0YXJnZXQgY2hpbGQgcGF0aCB0YXJnZXRlZCBmb3Igd2F0Y2hcbiAgICAgKiBAcGFyYW0gd2ggQ29tbW9uIHdhdGNoIGhlbHBlcnMgZm9yIHRoaXMgcGF0aFxuICAgICAqIEBwYXJhbSByZWFscGF0aFxuICAgICAqIEByZXR1cm5zIGNsb3NlciBmb3IgdGhlIHdhdGNoZXIgaW5zdGFuY2UuXG4gICAgICovXG4gICAgYXN5bmMgX2hhbmRsZURpcihkaXIsIHN0YXRzLCBpbml0aWFsQWRkLCBkZXB0aCwgdGFyZ2V0LCB3aCwgcmVhbHBhdGgpIHtcbiAgICAgICAgY29uc3QgcGFyZW50RGlyID0gdGhpcy5mc3cuX2dldFdhdGNoZWREaXIoc3lzUGF0aC5kaXJuYW1lKGRpcikpO1xuICAgICAgICBjb25zdCB0cmFja2VkID0gcGFyZW50RGlyLmhhcyhzeXNQYXRoLmJhc2VuYW1lKGRpcikpO1xuICAgICAgICBpZiAoIShpbml0aWFsQWRkICYmIHRoaXMuZnN3Lm9wdGlvbnMuaWdub3JlSW5pdGlhbCkgJiYgIXRhcmdldCAmJiAhdHJhY2tlZCkge1xuICAgICAgICAgICAgdGhpcy5mc3cuX2VtaXQoRVYuQUREX0RJUiwgZGlyLCBzdGF0cyk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gZW5zdXJlIGRpciBpcyB0cmFja2VkIChoYXJtbGVzcyBpZiByZWR1bmRhbnQpXG4gICAgICAgIHBhcmVudERpci5hZGQoc3lzUGF0aC5iYXNlbmFtZShkaXIpKTtcbiAgICAgICAgdGhpcy5mc3cuX2dldFdhdGNoZWREaXIoZGlyKTtcbiAgICAgICAgbGV0IHRocm90dGxlcjtcbiAgICAgICAgbGV0IGNsb3NlcjtcbiAgICAgICAgY29uc3Qgb0RlcHRoID0gdGhpcy5mc3cub3B0aW9ucy5kZXB0aDtcbiAgICAgICAgaWYgKChvRGVwdGggPT0gbnVsbCB8fCBkZXB0aCA8PSBvRGVwdGgpICYmICF0aGlzLmZzdy5fc3ltbGlua1BhdGhzLmhhcyhyZWFscGF0aCkpIHtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5faGFuZGxlUmVhZChkaXIsIGluaXRpYWxBZGQsIHdoLCB0YXJnZXQsIGRpciwgZGVwdGgsIHRocm90dGxlcik7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZnN3LmNsb3NlZClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2xvc2VyID0gdGhpcy5fd2F0Y2hXaXRoTm9kZUZzKGRpciwgKGRpclBhdGgsIHN0YXRzKSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gaWYgY3VycmVudCBkaXJlY3RvcnkgaXMgcmVtb3ZlZCwgZG8gbm90aGluZ1xuICAgICAgICAgICAgICAgIGlmIChzdGF0cyAmJiBzdGF0cy5tdGltZU1zID09PSAwKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgdGhpcy5faGFuZGxlUmVhZChkaXJQYXRoLCBmYWxzZSwgd2gsIHRhcmdldCwgZGlyLCBkZXB0aCwgdGhyb3R0bGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjbG9zZXI7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEhhbmRsZSBhZGRlZCBmaWxlLCBkaXJlY3RvcnksIG9yIGdsb2IgcGF0dGVybi5cbiAgICAgKiBEZWxlZ2F0ZXMgY2FsbCB0byBfaGFuZGxlRmlsZSAvIF9oYW5kbGVEaXIgYWZ0ZXIgY2hlY2tzLlxuICAgICAqIEBwYXJhbSBwYXRoIHRvIGZpbGUgb3IgaXJcbiAgICAgKiBAcGFyYW0gaW5pdGlhbEFkZCB3YXMgdGhlIGZpbGUgYWRkZWQgYXQgd2F0Y2ggaW5zdGFudGlhdGlvbj9cbiAgICAgKiBAcGFyYW0gcHJpb3JXaCBkZXB0aCByZWxhdGl2ZSB0byB1c2VyLXN1cHBsaWVkIHBhdGhcbiAgICAgKiBAcGFyYW0gZGVwdGggQ2hpbGQgcGF0aCBhY3R1YWxseSB0YXJnZXRlZCBmb3Igd2F0Y2hcbiAgICAgKiBAcGFyYW0gdGFyZ2V0IENoaWxkIHBhdGggYWN0dWFsbHkgdGFyZ2V0ZWQgZm9yIHdhdGNoXG4gICAgICovXG4gICAgYXN5bmMgX2FkZFRvTm9kZUZzKHBhdGgsIGluaXRpYWxBZGQsIHByaW9yV2gsIGRlcHRoLCB0YXJnZXQpIHtcbiAgICAgICAgY29uc3QgcmVhZHkgPSB0aGlzLmZzdy5fZW1pdFJlYWR5O1xuICAgICAgICBpZiAodGhpcy5mc3cuX2lzSWdub3JlZChwYXRoKSB8fCB0aGlzLmZzdy5jbG9zZWQpIHtcbiAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgd2ggPSB0aGlzLmZzdy5fZ2V0V2F0Y2hIZWxwZXJzKHBhdGgpO1xuICAgICAgICBpZiAocHJpb3JXaCkge1xuICAgICAgICAgICAgd2guZmlsdGVyUGF0aCA9IChlbnRyeSkgPT4gcHJpb3JXaC5maWx0ZXJQYXRoKGVudHJ5KTtcbiAgICAgICAgICAgIHdoLmZpbHRlckRpciA9IChlbnRyeSkgPT4gcHJpb3JXaC5maWx0ZXJEaXIoZW50cnkpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGV2YWx1YXRlIHdoYXQgaXMgYXQgdGhlIHBhdGggd2UncmUgYmVpbmcgYXNrZWQgdG8gd2F0Y2hcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgc3RhdE1ldGhvZHNbd2guc3RhdE1ldGhvZF0od2gud2F0Y2hQYXRoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHRoaXMuZnN3Ll9pc0lnbm9yZWQod2gud2F0Y2hQYXRoLCBzdGF0cykpIHtcbiAgICAgICAgICAgICAgICByZWFkeSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGZvbGxvdyA9IHRoaXMuZnN3Lm9wdGlvbnMuZm9sbG93U3ltbGlua3M7XG4gICAgICAgICAgICBsZXQgY2xvc2VyO1xuICAgICAgICAgICAgaWYgKHN0YXRzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhYnNQYXRoID0gc3lzUGF0aC5yZXNvbHZlKHBhdGgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBmb2xsb3cgPyBhd2FpdCBmc3JlYWxwYXRoKHBhdGgpIDogcGF0aDtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgY2xvc2VyID0gYXdhaXQgdGhpcy5faGFuZGxlRGlyKHdoLndhdGNoUGF0aCwgc3RhdHMsIGluaXRpYWxBZGQsIGRlcHRoLCB0YXJnZXQsIHdoLCB0YXJnZXRQYXRoKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgLy8gcHJlc2VydmUgdGhpcyBzeW1saW5rJ3MgdGFyZ2V0IHBhdGhcbiAgICAgICAgICAgICAgICBpZiAoYWJzUGF0aCAhPT0gdGFyZ2V0UGF0aCAmJiB0YXJnZXRQYXRoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX3N5bWxpbmtQYXRocy5zZXQoYWJzUGF0aCwgdGFyZ2V0UGF0aCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc3RhdHMuaXNTeW1ib2xpY0xpbmsoKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFBhdGggPSBmb2xsb3cgPyBhd2FpdCBmc3JlYWxwYXRoKHBhdGgpIDogcGF0aDtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5mc3cuY2xvc2VkKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gc3lzUGF0aC5kaXJuYW1lKHdoLndhdGNoUGF0aCk7XG4gICAgICAgICAgICAgICAgdGhpcy5mc3cuX2dldFdhdGNoZWREaXIocGFyZW50KS5hZGQod2gud2F0Y2hQYXRoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZzdy5fZW1pdChFVi5BREQsIHdoLndhdGNoUGF0aCwgc3RhdHMpO1xuICAgICAgICAgICAgICAgIGNsb3NlciA9IGF3YWl0IHRoaXMuX2hhbmRsZURpcihwYXJlbnQsIHN0YXRzLCBpbml0aWFsQWRkLCBkZXB0aCwgcGF0aCwgd2gsIHRhcmdldFBhdGgpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZzdy5jbG9zZWQpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAvLyBwcmVzZXJ2ZSB0aGlzIHN5bWxpbmsncyB0YXJnZXQgcGF0aFxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRQYXRoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5mc3cuX3N5bWxpbmtQYXRocy5zZXQoc3lzUGF0aC5yZXNvbHZlKHBhdGgpLCB0YXJnZXRQYXRoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjbG9zZXIgPSB0aGlzLl9oYW5kbGVGaWxlKHdoLndhdGNoUGF0aCwgc3RhdHMsIGluaXRpYWxBZGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgIGlmIChjbG9zZXIpXG4gICAgICAgICAgICAgICAgdGhpcy5mc3cuX2FkZFBhdGhDbG9zZXIocGF0aCwgY2xvc2VyKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmZzdy5faGFuZGxlRXJyb3IoZXJyb3IpKSB7XG4gICAgICAgICAgICAgICAgcmVhZHkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbiIsICIvKipcclxuICogRGlzY292ZXIgdHdlYWtzIHVuZGVyIDx1c2VyUm9vdD4vdHdlYWtzLiBFYWNoIHR3ZWFrIGlzIGEgZGlyZWN0b3J5IHdpdGggYVxyXG4gKiBtYW5pZmVzdC5qc29uIGFuZCBhbiBlbnRyeSBzY3JpcHQuIEVudHJ5IHJlc29sdXRpb24gaXMgbWFuaWZlc3QubWFpbiBmaXJzdCxcclxuICogdGhlbiBpbmRleC5qcywgaW5kZXgubWpzLCBhbmQgaW5kZXguY2pzLlxyXG4gKlxyXG4gKiBUaGUgbWFuaWZlc3QgZ2F0ZSBpcyBpbnRlbnRpb25hbGx5IHN0cmljdC4gQSB0d2VhayBtdXN0IGlkZW50aWZ5IGl0cyBHaXRIdWJcclxuICogcmVwb3NpdG9yeSBzbyB0aGUgbWFuYWdlciBjYW4gY2hlY2sgcmVsZWFzZXMgd2l0aG91dCBncmFudGluZyB0aGUgdHdlYWsgYW5cclxuICogdXBkYXRlL2luc3RhbGwgY2hhbm5lbC4gVXBkYXRlIGNoZWNrcyBhcmUgYWR2aXNvcnkgb25seS5cclxuICovXHJcbmltcG9ydCB7IHJlYWRkaXJTeW5jLCBzdGF0U3luYywgcmVhZEZpbGVTeW5jLCBleGlzdHNTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5pbXBvcnQgdHlwZSB7IFR3ZWFrTWFuaWZlc3QgfSBmcm9tIFwiQGNvZGV4LXBsdXNwbHVzL3Nka1wiO1xuaW1wb3J0IHsgcmVzb2x2ZUluc2lkZSB9IGZyb20gXCIuL3BhdGgtc2VjdXJpdHlcIjtcbmltcG9ydCB7IG1pblJ1bnRpbWVFcnJvciB9IGZyb20gXCIuL3ZlcnNpb25cIjtcblxyXG5leHBvcnQgaW50ZXJmYWNlIERpc2NvdmVyZWRUd2VhayB7XG4gIGRpcjogc3RyaW5nO1xuICBlbnRyeTogc3RyaW5nO1xuICBtYW5pZmVzdDogVHdlYWtNYW5pZmVzdDtcbiAgbG9hZGFibGU6IGJvb2xlYW47XG4gIGxvYWRFcnJvcj86IHN0cmluZztcbiAgY2FwYWJpbGl0aWVzOiBzdHJpbmdbXTtcbn1cblxyXG5jb25zdCBFTlRSWV9DQU5ESURBVEVTID0gW1wiaW5kZXguanNcIiwgXCJpbmRleC5janNcIiwgXCJpbmRleC5tanNcIl07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGlzY292ZXJUd2Vha3ModHdlYWtzRGlyOiBzdHJpbmcpOiBEaXNjb3ZlcmVkVHdlYWtbXSB7XHJcbiAgaWYgKCFleGlzdHNTeW5jKHR3ZWFrc0RpcikpIHJldHVybiBbXTtcclxuICBjb25zdCBvdXQ6IERpc2NvdmVyZWRUd2Vha1tdID0gW107XHJcbiAgZm9yIChjb25zdCBuYW1lIG9mIHJlYWRkaXJTeW5jKHR3ZWFrc0RpcikpIHtcclxuICAgIGNvbnN0IGRpciA9IGpvaW4odHdlYWtzRGlyLCBuYW1lKTtcclxuICAgIGlmICghc3RhdFN5bmMoZGlyKS5pc0RpcmVjdG9yeSgpKSBjb250aW51ZTtcclxuICAgIGNvbnN0IG1hbmlmZXN0UGF0aCA9IGpvaW4oZGlyLCBcIm1hbmlmZXN0Lmpzb25cIik7XHJcbiAgICBpZiAoIWV4aXN0c1N5bmMobWFuaWZlc3RQYXRoKSkgY29udGludWU7XHJcbiAgICBsZXQgbWFuaWZlc3Q6IFR3ZWFrTWFuaWZlc3Q7XHJcbiAgICB0cnkge1xyXG4gICAgICBtYW5pZmVzdCA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKG1hbmlmZXN0UGF0aCwgXCJ1dGY4XCIpKSBhcyBUd2Vha01hbmlmZXN0O1xyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgaWYgKCFpc1ZhbGlkTWFuaWZlc3QobWFuaWZlc3QpKSBjb250aW51ZTtcclxuICAgIGNvbnN0IGVudHJ5ID0gcmVzb2x2ZUVudHJ5KGRpciwgbWFuaWZlc3QpO1xyXG4gICAgaWYgKCFlbnRyeSkgY29udGludWU7XHJcbiAgICBjb25zdCBsb2FkRXJyb3IgPSBtaW5SdW50aW1lRXJyb3IobWFuaWZlc3QubWluUnVudGltZSk7XG4gICAgb3V0LnB1c2goe1xuICAgICAgZGlyLFxuICAgICAgZW50cnksXG4gICAgICBtYW5pZmVzdCxcbiAgICAgIGxvYWRhYmxlOiAhbG9hZEVycm9yLFxuICAgICAgLi4uKGxvYWRFcnJvciA/IHsgbG9hZEVycm9yIH0gOiB7fSksXG4gICAgICBjYXBhYmlsaXRpZXM6IG1hbmlmZXN0Q2FwYWJpbGl0aWVzKG1hbmlmZXN0KSxcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXHJcbmZ1bmN0aW9uIGlzVmFsaWRNYW5pZmVzdChtOiBUd2Vha01hbmlmZXN0KTogYm9vbGVhbiB7XHJcbiAgaWYgKCFtLmlkIHx8ICFtLm5hbWUgfHwgIW0udmVyc2lvbiB8fCAhbS5naXRodWJSZXBvKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCEvXlthLXpBLVowLTkuXy1dK1xcL1thLXpBLVowLTkuXy1dKyQvLnRlc3QobS5naXRodWJSZXBvKSkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmIChtLnNjb3BlICYmICFbXCJyZW5kZXJlclwiLCBcIm1haW5cIiwgXCJib3RoXCJdLmluY2x1ZGVzKG0uc2NvcGUpKSByZXR1cm4gZmFsc2U7XHJcbiAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmVFbnRyeShkaXI6IHN0cmluZywgbTogVHdlYWtNYW5pZmVzdCk6IHN0cmluZyB8IG51bGwge1xuICBpZiAobS5tYWluKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiByZXNvbHZlSW5zaWRlKGRpciwgbS5tYWluLCB7IG11c3RFeGlzdDogdHJ1ZSwgcmVxdWlyZUZpbGU6IHRydWUgfSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBjIG9mIEVOVFJZX0NBTkRJREFURVMpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHJlc29sdmVJbnNpZGUoZGlyLCBjLCB7IG11c3RFeGlzdDogdHJ1ZSwgcmVxdWlyZUZpbGU6IHRydWUgfSk7XG4gICAgfSBjYXRjaCB7fVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBtYW5pZmVzdENhcGFiaWxpdGllcyhtYW5pZmVzdDogVHdlYWtNYW5pZmVzdCk6IHN0cmluZ1tdIHtcbiAgY29uc3Qgc2NvcGUgPSBtYW5pZmVzdC5zY29wZSA/PyBcImJvdGhcIjtcbiAgY29uc3QgY2FwcyA9IFtcImlzb2xhdGVkIHN0b3JhZ2VcIiwgXCJzY29wZWQgSVBDXCJdO1xuICBpZiAoc2NvcGUgPT09IFwibWFpblwiIHx8IHNjb3BlID09PSBcImJvdGhcIikgY2Fwcy51bnNoaWZ0KFwibWFpbiBwcm9jZXNzXCIpO1xuICBpZiAoc2NvcGUgPT09IFwicmVuZGVyZXJcIiB8fCBzY29wZSA9PT0gXCJib3RoXCIpIGNhcHMudW5zaGlmdChcInJlbmRlcmVyIFVJXCIpO1xuICBpZiAobWFuaWZlc3QubWFpbikgY2Fwcy5wdXNoKFwiY3VzdG9tIGVudHJ5XCIpO1xuICBpZiAobWFuaWZlc3QubWluUnVudGltZSkgY2Fwcy5wdXNoKFwicnVudGltZSBnYXRlXCIpO1xuICByZXR1cm4gY2Fwcztcbn1cbiIsICJpbXBvcnQge1xuICBleGlzdHNTeW5jLFxuICByZWFscGF0aFN5bmMsXG4gIHN0YXRTeW5jLFxufSBmcm9tIFwibm9kZTpmc1wiO1xuaW1wb3J0IHtcbiAgZGlybmFtZSxcbiAgaXNBYnNvbHV0ZSxcbiAgcmVsYXRpdmUsXG4gIHJlc29sdmUsXG59IGZyb20gXCJub2RlOnBhdGhcIjtcblxuZXhwb3J0IGludGVyZmFjZSBSZXNvbHZlSW5zaWRlT3B0aW9ucyB7XG4gIGFsbG93QmFzZT86IGJvb2xlYW47XG4gIG11c3RFeGlzdD86IGJvb2xlYW47XG4gIHJlcXVpcmVGaWxlPzogYm9vbGVhbjtcbiAgcmVxdWlyZURpcmVjdG9yeT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0luc2lkZVBhdGgoYmFzZURpcjogc3RyaW5nLCBjYW5kaWRhdGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCByZWwgPSByZWxhdGl2ZShiYXNlRGlyLCBjYW5kaWRhdGUpO1xuICByZXR1cm4gcmVsID09PSBcIlwiIHx8ICghIXJlbCAmJiAhcmVsLnN0YXJ0c1dpdGgoXCIuLlwiKSAmJiAhaXNBYnNvbHV0ZShyZWwpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVJbnNpZGUoXG4gIGJhc2VEaXI6IHN0cmluZyxcbiAgaW5wdXRQYXRoOiBzdHJpbmcsXG4gIG9wdHM6IFJlc29sdmVJbnNpZGVPcHRpb25zID0ge30sXG4pOiBzdHJpbmcge1xuICBpZiAodHlwZW9mIGlucHV0UGF0aCAhPT0gXCJzdHJpbmdcIiB8fCBpbnB1dFBhdGgudHJpbSgpID09PSBcIlwiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiZW1wdHkgcGF0aFwiKTtcbiAgfVxuXG4gIGNvbnN0IGJhc2UgPSBjYW5vbmljYWxFeGlzdGluZ1BhdGgocmVzb2x2ZShiYXNlRGlyKSk7XG4gIGNvbnN0IHJhdyA9IHJlc29sdmUoYmFzZSwgaW5wdXRQYXRoKTtcbiAgaWYgKCFvcHRzLmFsbG93QmFzZSAmJiByYXcgPT09IGJhc2UpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJwYXRoIG11c3QgYmUgaW5zaWRlIGJhc2UgZGlyZWN0b3J5XCIpO1xuICB9XG4gIGlmICghaXNJbnNpZGVQYXRoKGJhc2UsIHJhdykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJwYXRoIG91dHNpZGUgYmFzZSBkaXJlY3RvcnlcIik7XG4gIH1cblxuICBpZiAoZXhpc3RzU3luYyhyYXcpKSB7XG4gICAgY29uc3QgY2Fub25pY2FsID0gY2Fub25pY2FsRXhpc3RpbmdQYXRoKHJhdyk7XG4gICAgaWYgKCFpc0luc2lkZVBhdGgoYmFzZSwgY2Fub25pY2FsKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwicGF0aCBvdXRzaWRlIGJhc2UgZGlyZWN0b3J5XCIpO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ID0gc3RhdFN5bmMoY2Fub25pY2FsKTtcbiAgICBpZiAob3B0cy5yZXF1aXJlRmlsZSAmJiAhc3RhdC5pc0ZpbGUoKSkgdGhyb3cgbmV3IEVycm9yKFwicGF0aCBpcyBub3QgYSBmaWxlXCIpO1xuICAgIGlmIChvcHRzLnJlcXVpcmVEaXJlY3RvcnkgJiYgIXN0YXQuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwicGF0aCBpcyBub3QgYSBkaXJlY3RvcnlcIik7XG4gICAgfVxuICAgIHJldHVybiBjYW5vbmljYWw7XG4gIH1cblxuICBpZiAob3B0cy5tdXN0RXhpc3QpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJwYXRoIGRvZXMgbm90IGV4aXN0XCIpO1xuICB9XG5cbiAgY29uc3QgcGFyZW50ID0gbmVhcmVzdEV4aXN0aW5nUGFyZW50KHJhdyk7XG4gIGNvbnN0IGNhbm9uaWNhbFBhcmVudCA9IGNhbm9uaWNhbEV4aXN0aW5nUGF0aChwYXJlbnQpO1xuICBpZiAoIWlzSW5zaWRlUGF0aChiYXNlLCBjYW5vbmljYWxQYXJlbnQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwicGF0aCBvdXRzaWRlIGJhc2UgZGlyZWN0b3J5XCIpO1xuICB9XG4gIHJldHVybiByYXc7XG59XG5cbmZ1bmN0aW9uIGNhbm9uaWNhbEV4aXN0aW5nUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcmVhbHBhdGhTeW5jLm5hdGl2ZShwYXRoKTtcbn1cblxuZnVuY3Rpb24gbmVhcmVzdEV4aXN0aW5nUGFyZW50KHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBjdXJyZW50ID0gcGF0aDtcbiAgd2hpbGUgKCFleGlzdHNTeW5jKGN1cnJlbnQpKSB7XG4gICAgY29uc3QgbmV4dCA9IGRpcm5hbWUoY3VycmVudCk7XG4gICAgaWYgKG5leHQgPT09IGN1cnJlbnQpIHJldHVybiBjdXJyZW50O1xuICAgIGN1cnJlbnQgPSBuZXh0O1xuICB9XG4gIHJldHVybiBjdXJyZW50O1xufVxuIiwgImV4cG9ydCBjb25zdCBDT0RFWF9QTFVTUExVU19WRVJTSU9OID0gXCIwLjEuMFwiO1xuXG5jb25zdCBWRVJTSU9OX1JFID0gL152PyhcXGQrKVxcLihcXGQrKVxcLihcXGQrKSg/OlstK10uKik/JC87XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVWZXJzaW9uKHY6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2LnRyaW0oKS5yZXBsYWNlKC9edi9pLCBcIlwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBhcmVWZXJzaW9ucyhhOiBzdHJpbmcsIGI6IHN0cmluZyk6IG51bWJlciB8IG51bGwge1xuICBjb25zdCBhdiA9IFZFUlNJT05fUkUuZXhlYyhub3JtYWxpemVWZXJzaW9uKGEpKTtcbiAgY29uc3QgYnYgPSBWRVJTSU9OX1JFLmV4ZWMobm9ybWFsaXplVmVyc2lvbihiKSk7XG4gIGlmICghYXYgfHwgIWJ2KSByZXR1cm4gbnVsbDtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPD0gMzsgaSsrKSB7XG4gICAgY29uc3QgZGlmZiA9IE51bWJlcihhdltpXSkgLSBOdW1iZXIoYnZbaV0pO1xuICAgIGlmIChkaWZmICE9PSAwKSByZXR1cm4gZGlmZjtcbiAgfVxuICByZXR1cm4gMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1pblJ1bnRpbWVFcnJvcihcbiAgbWluUnVudGltZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICBjdXJyZW50VmVyc2lvbiA9IENPREVYX1BMVVNQTFVTX1ZFUlNJT04sXG4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBpZiAoIW1pblJ1bnRpbWUpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IGNvbXBhcmlzb24gPSBjb21wYXJlVmVyc2lvbnMoY3VycmVudFZlcnNpb24sIG1pblJ1bnRpbWUpO1xuICBpZiAoY29tcGFyaXNvbiA9PT0gbnVsbCkge1xuICAgIHJldHVybiBgSW52YWxpZCBtaW5SdW50aW1lIFwiJHttaW5SdW50aW1lfVwiYDtcbiAgfVxuICBpZiAoY29tcGFyaXNvbiA8IDApIHtcbiAgICByZXR1cm4gYFJlcXVpcmVzIENvZGV4KysgJHtub3JtYWxpemVWZXJzaW9uKG1pblJ1bnRpbWUpfSBvciBuZXdlcmA7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cbiIsICIvKipcclxuICogRGlzay1iYWNrZWQga2V5L3ZhbHVlIHN0b3JhZ2UgZm9yIG1haW4tcHJvY2VzcyB0d2Vha3MuXHJcbiAqXHJcbiAqIEVhY2ggdHdlYWsgZ2V0cyBvbmUgSlNPTiBmaWxlIHVuZGVyIGA8dXNlclJvb3Q+L3N0b3JhZ2UvPGlkPi5qc29uYC5cclxuICogV3JpdGVzIGFyZSBkZWJvdW5jZWQgKDUwIG1zKSBhbmQgYXRvbWljICh3cml0ZSB0byA8ZmlsZT4udG1wIHRoZW4gcmVuYW1lKS5cclxuICogUmVhZHMgYXJlIGVhZ2VyICsgY2FjaGVkIGluLW1lbW9yeTsgd2UgbG9hZCBvbiBmaXJzdCBhY2Nlc3MuXHJcbiAqL1xyXG5pbXBvcnQge1xyXG4gIGV4aXN0c1N5bmMsXHJcbiAgbWtkaXJTeW5jLFxyXG4gIHJlYWRGaWxlU3luYyxcclxuICByZW5hbWVTeW5jLFxyXG4gIHdyaXRlRmlsZVN5bmMsXHJcbn0gZnJvbSBcIm5vZGU6ZnNcIjtcclxuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJub2RlOnBhdGhcIjtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGlza1N0b3JhZ2Uge1xyXG4gIGdldDxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogVCk6IFQ7XHJcbiAgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQ7XHJcbiAgZGVsZXRlKGtleTogc3RyaW5nKTogdm9pZDtcclxuICBhbGwoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XHJcbiAgZmx1c2goKTogdm9pZDtcclxufVxyXG5cclxuY29uc3QgRkxVU0hfREVMQVlfTVMgPSA1MDtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEaXNrU3RvcmFnZShyb290RGlyOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBEaXNrU3RvcmFnZSB7XHJcbiAgY29uc3QgZGlyID0gam9pbihyb290RGlyLCBcInN0b3JhZ2VcIik7XHJcbiAgbWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcbiAgY29uc3QgZmlsZSA9IGpvaW4oZGlyLCBgJHtzYW5pdGl6ZShpZCl9Lmpzb25gKTtcclxuXHJcbiAgbGV0IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XHJcbiAgaWYgKGV4aXN0c1N5bmMoZmlsZSkpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGRhdGEgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhmaWxlLCBcInV0ZjhcIikpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgIC8vIENvcnJ1cHQgZmlsZSBcdTIwMTQgc3RhcnQgZnJlc2gsIGJ1dCBkb24ndCBjbG9iYmVyIHRoZSBvcmlnaW5hbCB1bnRpbCB3ZVxyXG4gICAgICAvLyBzdWNjZXNzZnVsbHkgd3JpdGUgYWdhaW4uIChNb3ZlIGl0IGFzaWRlIGZvciBmb3JlbnNpY3MuKVxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHJlbmFtZVN5bmMoZmlsZSwgYCR7ZmlsZX0uY29ycnVwdC0ke0RhdGUubm93KCl9YCk7XHJcbiAgICAgIH0gY2F0Y2gge31cclxuICAgICAgZGF0YSA9IHt9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbGV0IGRpcnR5ID0gZmFsc2U7XHJcbiAgbGV0IHRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xyXG5cclxuICBjb25zdCBzY2hlZHVsZUZsdXNoID0gKCkgPT4ge1xyXG4gICAgZGlydHkgPSB0cnVlO1xyXG4gICAgaWYgKHRpbWVyKSByZXR1cm47XHJcbiAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICB0aW1lciA9IG51bGw7XHJcbiAgICAgIGlmIChkaXJ0eSkgZmx1c2goKTtcclxuICAgIH0sIEZMVVNIX0RFTEFZX01TKTtcclxuICB9O1xyXG5cclxuICBjb25zdCBmbHVzaCA9ICgpOiB2b2lkID0+IHtcclxuICAgIGlmICghZGlydHkpIHJldHVybjtcclxuICAgIGNvbnN0IHRtcCA9IGAke2ZpbGV9LnRtcGA7XHJcbiAgICB0cnkge1xyXG4gICAgICB3cml0ZUZpbGVTeW5jKHRtcCwgSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgMiksIFwidXRmOFwiKTtcclxuICAgICAgcmVuYW1lU3luYyh0bXAsIGZpbGUpO1xyXG4gICAgICBkaXJ0eSA9IGZhbHNlO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAvLyBMZWF2ZSBkaXJ0eT10cnVlIHNvIGEgZnV0dXJlIGZsdXNoIHJldHJpZXMuXHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJbY29kZXgtcGx1c3BsdXNdIHN0b3JhZ2UgZmx1c2ggZmFpbGVkOlwiLCBpZCwgZSk7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGdldDogPFQ+KGs6IHN0cmluZywgZD86IFQpOiBUID0+XHJcbiAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChkYXRhLCBrKSA/IChkYXRhW2tdIGFzIFQpIDogKGQgYXMgVCksXHJcbiAgICBzZXQoaywgdikge1xyXG4gICAgICBkYXRhW2tdID0gdjtcclxuICAgICAgc2NoZWR1bGVGbHVzaCgpO1xyXG4gICAgfSxcclxuICAgIGRlbGV0ZShrKSB7XHJcbiAgICAgIGlmIChrIGluIGRhdGEpIHtcclxuICAgICAgICBkZWxldGUgZGF0YVtrXTtcclxuICAgICAgICBzY2hlZHVsZUZsdXNoKCk7XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBhbGw6ICgpID0+ICh7IC4uLmRhdGEgfSksXHJcbiAgICBmbHVzaCxcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzYW5pdGl6ZShpZDogc3RyaW5nKTogc3RyaW5nIHtcclxuICAvLyBUd2VhayBpZHMgYXJlIGF1dGhvci1jb250cm9sbGVkOyBjbGFtcCB0byBhIHNhZmUgZmlsZW5hbWUuXHJcbiAgcmV0dXJuIGlkLnJlcGxhY2UoL1teYS16QS1aMC05Ll9ALV0vZywgXCJfXCIpO1xyXG59XHJcbiIsICJleHBvcnQgaW50ZXJmYWNlIFN0b3BwYWJsZVR3ZWFrIHtcbiAgc3RvcD86ICgpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xuICBkaXNwb3NlcnM/OiBBcnJheTwoKSA9PiB2b2lkPjtcbiAgc3RvcmFnZT86IHtcbiAgICBmbHVzaCgpOiB2b2lkO1xuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3BMb2dnZXIge1xuICBpbmZvPyhtZXNzYWdlOiBzdHJpbmcpOiB2b2lkO1xuICB3YXJuPyhtZXNzYWdlOiBzdHJpbmcsIGVycm9yPzogdW5rbm93bik6IHZvaWQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdG9wTG9hZGVkVHdlYWtzKFxuICBsb2FkZWQ6IE1hcDxzdHJpbmcsIFN0b3BwYWJsZVR3ZWFrPixcbiAgbG9nZ2VyOiBTdG9wTG9nZ2VyID0ge30sXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgZm9yIChjb25zdCBbaWQsIHR3ZWFrXSBvZiBsb2FkZWQpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdHdlYWsuc3RvcD8uKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbG9nZ2VyLndhcm4/Lihgc3RvcCBmYWlsZWQgZm9yICR7aWR9OmAsIGUpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZGlzcG9zZSBvZiB0d2Vhay5kaXNwb3NlcnMgPz8gW10pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4/LihgZGlzcG9zZSBmYWlsZWQgZm9yICR7aWR9OmAsIGUpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAodHdlYWsuZGlzcG9zZXJzKSB0d2Vhay5kaXNwb3NlcnMubGVuZ3RoID0gMDtcblxuICAgIHRyeSB7XG4gICAgICB0d2Vhay5zdG9yYWdlPy5mbHVzaCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci53YXJuPy4oYHN0b3JhZ2UgZmx1c2ggZmFpbGVkIGZvciAke2lkfTpgLCBlKTtcbiAgICB9XG5cbiAgICBsb2dnZXIuaW5mbz8uKGBzdG9wcGVkIHR3ZWFrOiAke2lkfWApO1xuICB9XG4gIGxvYWRlZC5jbGVhcigpO1xufVxuIiwgImV4cG9ydCBpbnRlcmZhY2UgSXBjTWFpbkxpa2Uge1xuICBvbihjaGFubmVsOiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdm9pZDtcbiAgcmVtb3ZlTGlzdGVuZXIoY2hhbm5lbDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCk6IHZvaWQ7XG4gIGhhbmRsZShjaGFubmVsOiBzdHJpbmcsIGhhbmRsZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHVua25vd24pOiB2b2lkO1xuICByZW1vdmVIYW5kbGVyKGNoYW5uZWw6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIERpc3Bvc2VyID0gKCkgPT4gdm9pZDtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1haW5JcGMoXG4gIHR3ZWFrSWQ6IHN0cmluZyxcbiAgaXBjTWFpbjogSXBjTWFpbkxpa2UsXG4gIGRpc3Bvc2VyczogRGlzcG9zZXJbXSxcbiAgcmVnaXN0ZXJlZEhhbmRsZXM6IE1hcDxzdHJpbmcsIERpc3Bvc2VyPixcbikge1xuICBjb25zdCBjaCA9IChjaGFubmVsOiBzdHJpbmcpID0+IGBjb2RleHBwOiR7dHdlYWtJZH06JHtjaGFubmVsfWA7XG4gIHJldHVybiB7XG4gICAgb246IChjaGFubmVsOiBzdHJpbmcsIGhhbmRsZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpOiBEaXNwb3NlciA9PiB7XG4gICAgICBjb25zdCBmdWxsID0gY2goY2hhbm5lbCk7XG4gICAgICBjb25zdCB3cmFwcGVkID0gKF9ldmVudDogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiBoYW5kbGVyKC4uLmFyZ3MpO1xuICAgICAgaXBjTWFpbi5vbihmdWxsLCB3cmFwcGVkKTtcbiAgICAgIGNvbnN0IGRpc3Bvc2UgPSBvbmNlKCgpID0+IGlwY01haW4ucmVtb3ZlTGlzdGVuZXIoZnVsbCwgd3JhcHBlZCkpO1xuICAgICAgZGlzcG9zZXJzLnB1c2goZGlzcG9zZSk7XG4gICAgICByZXR1cm4gZGlzcG9zZTtcbiAgICB9LFxuICAgIHNlbmQ6IChfY2hhbm5lbDogc3RyaW5nKSA9PiB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpcGMuc2VuZCBpcyByZW5kZXJlclx1MjE5Mm1haW47IG1haW4gc2lkZSB1c2VzIGhhbmRsZS9vblwiKTtcbiAgICB9LFxuICAgIGludm9rZTogKF9jaGFubmVsOiBzdHJpbmcpID0+IHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcImlwYy5pbnZva2UgaXMgcmVuZGVyZXJcdTIxOTJtYWluOyBtYWluIHNpZGUgdXNlcyBoYW5kbGVcIik7XG4gICAgfSxcbiAgICBoYW5kbGU6IChjaGFubmVsOiBzdHJpbmcsIGhhbmRsZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHVua25vd24pOiBEaXNwb3NlciA9PiB7XG4gICAgICBjb25zdCBmdWxsID0gY2goY2hhbm5lbCk7XG4gICAgICByZWdpc3RlcmVkSGFuZGxlcy5nZXQoZnVsbCk/LigpO1xuICAgICAgY29uc3Qgd3JhcHBlZCA9IChfZXZlbnQ6IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gaGFuZGxlciguLi5hcmdzKTtcbiAgICAgIGlwY01haW4uaGFuZGxlKGZ1bGwsIHdyYXBwZWQpO1xuICAgICAgY29uc3QgZGlzcG9zZSA9IG9uY2UoKCkgPT4ge1xuICAgICAgICBpZiAocmVnaXN0ZXJlZEhhbmRsZXMuZ2V0KGZ1bGwpID09PSBkaXNwb3NlKSB7XG4gICAgICAgICAgcmVnaXN0ZXJlZEhhbmRsZXMuZGVsZXRlKGZ1bGwpO1xuICAgICAgICAgIGlwY01haW4ucmVtb3ZlSGFuZGxlcihmdWxsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZWdpc3RlcmVkSGFuZGxlcy5zZXQoZnVsbCwgZGlzcG9zZSk7XG4gICAgICBkaXNwb3NlcnMucHVzaChkaXNwb3NlKTtcbiAgICAgIHJldHVybiBkaXNwb3NlO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIG9uY2UoZm46ICgpID0+IHZvaWQpOiBEaXNwb3NlciB7XG4gIGxldCBjYWxsZWQgPSBmYWxzZTtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBpZiAoY2FsbGVkKSByZXR1cm47XG4gICAgY2FsbGVkID0gdHJ1ZTtcbiAgICBmbigpO1xuICB9O1xufVxuIiwgImV4cG9ydCBpbnRlcmZhY2UgUnVudGltZUhlYWx0aElucHV0IHtcbiAgdmVyc2lvbjogc3RyaW5nO1xuICB1c2VyUm9vdDogc3RyaW5nO1xuICBydW50aW1lRGlyOiBzdHJpbmc7XG4gIHR3ZWFrc0Rpcjogc3RyaW5nO1xuICBsb2dEaXI6IHN0cmluZztcbiAgZGlzY292ZXJlZFR3ZWFrczogbnVtYmVyO1xuICBsb2FkZWRNYWluVHdlYWtzOiBudW1iZXI7XG4gIGxvYWRlZFJlbmRlcmVyVHdlYWtzPzogbnVtYmVyIHwgbnVsbDtcbiAgc3RhcnRlZEF0OiBzdHJpbmc7XG4gIGxhc3RSZWxvYWQ6IFJ1bnRpbWVSZWxvYWRTdGF0dXMgfCBudWxsO1xuICByZWNlbnRFcnJvcnM6IFJ1bnRpbWVIZWFsdGhFdmVudFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVSZWxvYWRTdGF0dXMge1xuICBhdDogc3RyaW5nO1xuICByZWFzb246IHN0cmluZztcbiAgb2s6IGJvb2xlYW47XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVIZWFsdGhFdmVudCB7XG4gIGF0OiBzdHJpbmc7XG4gIGxldmVsOiBcIndhcm5cIiB8IFwiZXJyb3JcIjtcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ1bnRpbWVIZWFsdGgge1xuICB2ZXJzaW9uOiBzdHJpbmc7XG4gIHBhdGhzOiB7XG4gICAgdXNlclJvb3Q6IHN0cmluZztcbiAgICBydW50aW1lRGlyOiBzdHJpbmc7XG4gICAgdHdlYWtzRGlyOiBzdHJpbmc7XG4gICAgbG9nRGlyOiBzdHJpbmc7XG4gIH07XG4gIHR3ZWFrczoge1xuICAgIGRpc2NvdmVyZWQ6IG51bWJlcjtcbiAgICBsb2FkZWRNYWluOiBudW1iZXI7XG4gICAgbG9hZGVkUmVuZGVyZXI6IG51bWJlciB8IG51bGw7XG4gIH07XG4gIHN0YXJ0ZWRBdDogc3RyaW5nO1xuICBsYXN0UmVsb2FkOiBSdW50aW1lUmVsb2FkU3RhdHVzIHwgbnVsbDtcbiAgcmVjZW50RXJyb3JzOiBSdW50aW1lSGVhbHRoRXZlbnRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJ1bnRpbWVIZWFsdGgoaW5wdXQ6IFJ1bnRpbWVIZWFsdGhJbnB1dCk6IFJ1bnRpbWVIZWFsdGgge1xuICByZXR1cm4ge1xuICAgIHZlcnNpb246IGlucHV0LnZlcnNpb24sXG4gICAgcGF0aHM6IHtcbiAgICAgIHVzZXJSb290OiBpbnB1dC51c2VyUm9vdCxcbiAgICAgIHJ1bnRpbWVEaXI6IGlucHV0LnJ1bnRpbWVEaXIsXG4gICAgICB0d2Vha3NEaXI6IGlucHV0LnR3ZWFrc0RpcixcbiAgICAgIGxvZ0RpcjogaW5wdXQubG9nRGlyLFxuICAgIH0sXG4gICAgdHdlYWtzOiB7XG4gICAgICBkaXNjb3ZlcmVkOiBpbnB1dC5kaXNjb3ZlcmVkVHdlYWtzLFxuICAgICAgbG9hZGVkTWFpbjogaW5wdXQubG9hZGVkTWFpblR3ZWFrcyxcbiAgICAgIGxvYWRlZFJlbmRlcmVyOiBpbnB1dC5sb2FkZWRSZW5kZXJlclR3ZWFrcyA/PyBudWxsLFxuICAgIH0sXG4gICAgc3RhcnRlZEF0OiBpbnB1dC5zdGFydGVkQXQsXG4gICAgbGFzdFJlbG9hZDogaW5wdXQubGFzdFJlbG9hZCxcbiAgICByZWNlbnRFcnJvcnM6IGlucHV0LnJlY2VudEVycm9ycy5zbGljZSgtMTApLFxuICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVNBLHNCQUFvRjtBQUNwRixJQUFBQSxrQkFBbUY7QUFDbkYsSUFBQUMsb0JBQThCOzs7QUNWOUIsSUFBQUMsYUFBK0I7QUFDL0IsSUFBQUMsbUJBQThCO0FBQzlCLG9CQUE2QjtBQUM3QixJQUFBQyxXQUF5Qjs7O0FDSnpCLHNCQUErQztBQUMvQyx5QkFBeUI7QUFDekIsdUJBQXVGO0FBQ2hGLElBQU0sYUFBYTtBQUFBLEVBQ3RCLFdBQVc7QUFBQSxFQUNYLFVBQVU7QUFBQSxFQUNWLGVBQWU7QUFBQSxFQUNmLGlCQUFpQjtBQUNyQjtBQUNBLElBQU0saUJBQWlCO0FBQUEsRUFDbkIsTUFBTTtBQUFBLEVBQ04sWUFBWSxDQUFDLGVBQWU7QUFBQSxFQUM1QixpQkFBaUIsQ0FBQyxlQUFlO0FBQUEsRUFDakMsTUFBTSxXQUFXO0FBQUEsRUFDakIsT0FBTztBQUFBLEVBQ1AsT0FBTztBQUFBLEVBQ1AsWUFBWTtBQUFBLEVBQ1osZUFBZTtBQUNuQjtBQUNBLE9BQU8sT0FBTyxjQUFjO0FBQzVCLElBQU0sdUJBQXVCO0FBQzdCLElBQU0scUJBQXFCLG9CQUFJLElBQUksQ0FBQyxVQUFVLFNBQVMsVUFBVSxTQUFTLG9CQUFvQixDQUFDO0FBQy9GLElBQU0sWUFBWTtBQUFBLEVBQ2QsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUNmO0FBQ0EsSUFBTSxZQUFZLG9CQUFJLElBQUk7QUFBQSxFQUN0QixXQUFXO0FBQUEsRUFDWCxXQUFXO0FBQUEsRUFDWCxXQUFXO0FBQ2YsQ0FBQztBQUNELElBQU0sYUFBYSxvQkFBSSxJQUFJO0FBQUEsRUFDdkIsV0FBVztBQUFBLEVBQ1gsV0FBVztBQUFBLEVBQ1gsV0FBVztB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QUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUNwRTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTTtBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFBVztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUMxRTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTztBQUFBLEVBQVc7QUFBQSxFQUFNO0FBQUEsRUFDcEM7QUFBQSxFQUFRO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQzVEO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ25EO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTTtBQUFBLEVBQU87QUFBQSxFQUFRO0FBQUEsRUFDMUM7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUNyRjtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUztBQUFBLEVBQ3hCO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUN0QztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3pCO0FBQUEsRUFBSztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUN0RDtBQUFBLEVBQVM7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDL0U7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQ2Y7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ2pGO0FBQUEsRUFDQTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQWE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDcEY7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBVTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ25GO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDckI7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQ2hGO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFDMUM7QUFBQSxFQUFPO0FBQUEsRUFDUDtBQUFBLEVBQU87QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFPO0FBQUEsRUFBUTtBQUFBLEVBQVE7QUFBQSxFQUFRO0FBQUEsRUFBTztBQUFBLEVBQU87QUFBQSxFQUFNO0FBQUEsRUFDaEY7QUFBQSxFQUFPO0FBQUEsRUFBTztBQUFBLEVBQVE7QUFBQSxFQUFTO0FBQUEsRUFBTztBQUFBLEVBQ3RDO0FBQUEsRUFBTztB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QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfbm9kZV9mcyIsICJpbXBvcnRfbm9kZV9wYXRoIiwgImltcG9ydF9mcyIsICJpbXBvcnRfcHJvbWlzZXMiLCAic3lzUGF0aCIsICJwcmVzb2x2ZSIsICJiYXNlbmFtZSIsICJwam9pbiIsICJwcmVsYXRpdmUiLCAicHNlcCIsICJpbXBvcnRfcHJvbWlzZXMiLCAib3NUeXBlIiwgImZzX3dhdGNoIiwgInJhd0VtaXR0ZXIiLCAibGlzdGVuZXIiLCAiYmFzZW5hbWUiLCAiZGlybmFtZSIsICJuZXdTdGF0cyIsICJjbG9zZXIiLCAiZnNyZWFscGF0aCIsICJyZXNvbHZlIiwgInJlYWxwYXRoIiwgInN0YXRzIiwgInJlbGF0aXZlIiwgIkRPVUJMRV9TTEFTSF9SRSIsICJ0ZXN0U3RyaW5nIiwgInBhdGgiLCAic3RhdHMiLCAic3RhdGNiIiwgIm5vdyIsICJzdGF0IiwgImltcG9ydF9ub2RlX2ZzIiwgImltcG9ydF9ub2RlX3BhdGgiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJzdGF0IiwgImltcG9ydF9ub2RlX2ZzIiwgImltcG9ydF9ub2RlX3BhdGgiLCAiaXBjTWFpbiIsICJzdGF0Il0KfQo=
