# Adapter faithfulness sweep

207 source functions compared: named functions, methods, constructors, arrow callbacks, and default runners. Test-only functions and generated shell-script functions are excluded from this TS inventory. Index-only re-exports have no execution steps.

Each body below is the ordered checklist, retained verbatim so file modes, flags, catch conditions, output text, callback ordering, requests, and cleanup cannot be lost in a summary. Each was traced to the Rust correspondence listed directly below it, including its nested callbacks. Static native bindings replace Bun dynamic FFI binding, and native Windows SID queries replace PowerShell SID queries. Those language-specific implementations were compared by their operations and outcomes.

No adapter in this slice prompts, retries, acquires an application lock, or explicitly wipes secrets in TS. Rust must not introduce those steps. File handles/descriptors close on every return through RAII where TS uses finally. Temporary-file cleanup and errors were compared separately from descriptor closing. JS text reads are lossy UTF-8; edits preserve Latin-1 bytes. JS trimming, newline conversion, modes 0700/0600, pathname/descriptor identity checks, and error code/message/cause boundaries were checked.

Regression evidence is in red-*.log and green-*.log in this directory. Windows source comparison and cross-compilation do not claim Windows runtime execution.

## packages/adapters/placement/fs/src/adapter.ts:9 :: createFsPlacementAdapter [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/adapter.rs; windows/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function createFsPlacementAdapter(
  mode: TPlacementMode,
  checkoutRoot: string,
  backupDirectory: string | undefined,
  now: () => number,
): IPlacementAdapter {
  const root = resolve(checkoutRoot);

  return {
    mode,
    supported: (dir) => supported(mode, dir).catch(placementFailure),
    place: (storePath, checkoutPath, prepareTemporary, replacingLink) =>
      place(
        mode,
        root,
        storePath,
        checkoutPath,
        backupDirectory,
        undefined,
        prepareTemporary,
        now,
        replacingLink,
      ).catch(placementFailure),
    remove: (storePath, checkoutPath) =>
      remove(root, storePath, checkoutPath).catch(placementFailure),
    inspect: (storePath, checkoutPath) =>
      inspect(mode, root, storePath, checkoutPath).catch(placementFailure),
  };
}
```


## packages/adapters/placement/fs/src/adapter.ts:19 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/adapter.rs; windows/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(dir) => supported(mode, dir).catch(placementFailure)
```


## packages/adapters/placement/fs/src/adapter.ts:20 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/adapter.rs; windows/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(storePath, checkoutPath, prepareTemporary, replacingLink) =>
      place(
        mode,
        root,
        storePath,
        checkoutPath,
        backupDirectory,
        undefined,
        prepareTemporary,
        now,
        replacingLink,
      ).catch(placementFailure)
```


## packages/adapters/placement/fs/src/adapter.ts:32 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/adapter.rs; windows/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(storePath, checkoutPath) =>
      remove(root, storePath, checkoutPath).catch(placementFailure)
```


## packages/adapters/placement/fs/src/adapter.ts:34 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/adapter.rs; windows/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(storePath, checkoutPath) =>
      inspect(mode, root, storePath, checkoutPath).catch(placementFailure)
```


## packages/adapters/placement/fs/src/backups/prune-at.ts:5 :: pruneAt [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/prune.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function pruneAt(fd: number, name: string) {
  const before = identity(fd, name);
  if (!before) return;
  const link = Buffer.alloc(1);
  if (Number(libc!.symbols.readlinkat(fd, cstring(name), link, 1)) >= 0) return;
  const file = openAt(fd, name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    const stat = fstatSync(file);
    if (!stat.isFile()) return;
    assertIdentity(fd, name, before);
    checked(libc!.symbols.unlinkat(fd, cstring(name), 0));
  } finally {
    closeSync(file);
  }
}
```


## packages/adapters/placement/fs/src/backups/prune.ts:10 :: pruneBackups [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/prune.rs; windows/prune.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function pruneBackups(dir: string, now: number, maxAgeDays = 30): Promise<void> {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeDays) || maxAgeDays < 0)
    throw new EnvdenError("INVALID_INPUT", "Invalid backup retention");

  const directory = await statOrMissing(dir);
  if (!directory) return;

  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe backup directory");

  const cutoff = now - maxAgeDays * 86400000;
  const fd = libc ? openParent(dir, ".entry", false) : undefined;

  try {
    for (const name of await readdir(dir)) {
      const match = /^\.envden-backup-(\d+)-[0-9a-f-]{36}$/.exec(name);
      if (!match || Number(match[1]) >= cutoff) continue;

      if (fd !== undefined) pruneAt(fd, name);
      else await pruneWindows(join(dir, name));
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
```


## packages/adapters/placement/fs/src/backups/prune.ts:36 :: pruneWindows [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/prune.rs; windows/prune.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function pruneWindows(path: string) {
  const stat = await statOrMissing(path);

  if (stat?.isFile() && !stat.isSymbolicLink())
    await unlink(path).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    });
}
```


## packages/adapters/placement/fs/src/backups/prune.ts:40 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/prune.rs; windows/prune.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
```


## packages/adapters/placement/fs/src/backups/write.ts:19 :: backupContents [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/backup.rs; windows/backup.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function backupContents(
  root: string,
  directory: string | undefined,
  contents: Uint8Array,
  runtime = {
    libc,
    spawn: (args: string[]) => spawnTrusted("icacls", args, { sync: true }).exitCode,
  },
  now: () => number,
) {
  if (!directory) throw new EnvdenError("INVALID_INPUT", "Backup directory is required");
  const path = resolve(directory);
  assertOutside(root, path);

  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertOutside(realpathSync(root), realpathSync(path));
  const name = `.envden-backup-${now()}-${randomUUID()}`;

  if (runtime.libc) {
    const fd = openParent(path, name, false);

    try {
      fchmodSync(fd, 0o700);
      writeAt(fd, name, contents);
    } finally {
      closeSync(fd);
    }
  } else {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe backup directory");

    chmodSync(path, 0o700);

    const result = runtime.spawn([
      path,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:(OI)(CI)F`,
    ]);

    if (result !== 0) throw new EnvdenError("INVALID_INPUT", "Could not restrict backup access");

    writeFileSync(join(path, name), contents, { flag: "wx", mode: 0o600 });
  }
}
```


## packages/adapters/placement/fs/src/backups/write.ts:25 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/backup.rs; windows/backup.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(args: string[]) => spawnTrusted("icacls", args, { sync: true }).exitCode
```


## packages/adapters/placement/fs/src/backups/write.ts:65 :: assertOutside [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/backup.rs; windows/backup.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function assertOutside(root: string, path: string) {
  if (placeInRoot(root, path) !== "outside")
    throw new EnvdenError("INVALID_INPUT", "Backup directory must be outside checkout");
}
```


## packages/adapters/placement/fs/src/failures/operation.ts:3 :: placementFailure [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function placementFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("CONFLICT", "Placement operation failed", { cause });
}
```


## packages/adapters/placement/fs/src/native/directory.ts:5 :: openParent [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function openParent(root: string, path: string, create = true) {
  let fd = checked(libc!.symbols.open(cstring(root), directoryFlags, 0));

  try {
    for (const part of path.split("/").slice(0, -1)) {
      if (create) libc!.symbols.mkdirat(fd, cstring(part), 0o700);
      const next = libc!.symbols.openat(fd, cstring(part), directoryFlags, 0, 0, 0, 0, 0, 0);

      if (next < 0 && !create && libc!.errno() === 2)
        throw new EnvdenError("NOT_FOUND", "Checkout parent is missing");

      checked(next);
      closeSync(fd);
      fd = next;
    }

    return fd;
  } catch (cause) {
    closeSync(fd);
    if (cause instanceof EnvdenError && cause.code === "NOT_FOUND") throw cause;
    throw new EnvdenError("CONFLICT", "Unsafe checkout parent", { cause });
  }
}
```


## packages/adapters/placement/fs/src/native/directory.ts:29 :: readAt [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function readAt(fd: number, name: string) {
  const source = openAt(fd, name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    if (!fstatSync(source).isFile())
      throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

    return readFileSync(source);
  } finally {
    closeSync(source);
  }
}
```


## packages/adapters/placement/fs/src/native/directory.ts:42 :: writeAt [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function writeAt(fd: number, name: string, contents: Uint8Array) {
  const file = openAt(
    fd,
    name,
    constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY,
    0o600,
  );

  try {
    let offset = 0;

    while (offset < contents.length) {
      const written = writeSync(file, contents, offset, contents.length - offset);
      if (!written) throw new EnvdenError("CONFLICT", "Placement write failed");
      offset += written;
    }

    fsyncSync(file);
  } finally {
    closeSync(file);
  }
}
```


## packages/adapters/placement/fs/src/native/directory.ts:65 :: linkTarget [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function linkTarget(fd: number, name: string) {
  const buffer = Buffer.alloc(4096);
  const length = Number(libc!.symbols.readlinkat(fd, cstring(name), buffer, buffer.length));

  return length < 0 ? undefined : buffer.subarray(0, length).toString();
}
```


## packages/adapters/placement/fs/src/native/directory.ts:72 :: assertIdentity [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function assertIdentity(fd: number, name: string, before: Buffer | undefined) {
  const current = identity(fd, name);

  if (before === undefined ? current !== undefined : !current?.equals(before))
    throw new EnvdenError("CONFLICT", "Placement entry changed");
}
```


## packages/adapters/placement/fs/src/native/libc.ts:5 :: loadFfi [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function loadFfi(importFfi = () => import("bun:ffi")) {
  try {
    return await importFfi();
  } catch {
    return undefined;
  }
}
```


## packages/adapters/placement/fs/src/native/libc.ts:5 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => import("bun:ffi")
```


## packages/adapters/placement/fs/src/native/libc.ts:36 :: loadLibc [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function loadLibc(bind = bindLibc) {
  const candidates = libraryPaths[process.platform];
  if (!ffi || !candidates || !["arm64", "x64"].includes(process.arch)) return undefined;

  for (const path of candidates) {
    try {
      return bind(path);
    } catch {
      // Try the next libc candidate; callers retain the non-native fallback.
    }
  }

  return undefined;
}
```


## packages/adapters/placement/fs/src/native/libc.ts:51 :: bindLibc [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function bindLibc(path: string) {
  const library = ffi!.dlopen(path, definitions);

  const statName =
    process.platform === "darwin" && process.arch === "x64" ? "fstatat$INODE64" : "fstatat";

  const stat = bindStat(path, statName);

  if (!stat) {
    library.close();
    throw new EnvdenError("NOT_IMPLEMENTED", "Native stat symbols are unavailable");
  }

  const errorName = process.platform === "darwin" ? "__error" : "__errno_location";
  const errorLibrary = ffi!.dlopen(path, { [errorName]: { args: [], returns: "ptr" } });
  const errno = errorLibrary.symbols[errorName]!;

  return {
    symbols: library.symbols,
    fstatat: stat.call,
    handles: [library, stat.library, errorLibrary],
    errno: () => new Int32Array(ffi!.toArrayBuffer(errno!()!, 0, 4))[0],
  };
}
```


## packages/adapters/placement/fs/src/native/libc.ts:72 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => new Int32Array(ffi!.toArrayBuffer(errno!()!, 0, 4))[0]
```


## packages/adapters/placement/fs/src/native/libc.ts:76 :: bindStat [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function bindStat(path: string, preferred: string) {
  for (const name of [preferred, "__fxstatat"]) {
    const choice = statSymbol([name], process.platform, process.arch);
    if (!choice) continue;

    try {
      const library = ffi!.dlopen(path, {
        [name]: {
          args:
            choice.version === undefined
              ? ["i32", "ptr", "ptr", "i32"]
              : ["i32", "i32", "ptr", "ptr", "i32"],
          returns: "i32",
        },
      });

      const symbol = library.symbols[name]!;

      return {
        library,
        call: (fd: number, path: Buffer, buffer: Buffer, flags: number) =>
          choice.version === undefined
            ? symbol(fd, path, buffer, flags)
            : symbol(choice.version, fd, path, buffer, flags),
      };
    } catch {
      // Older glibc exposes only the versioned entry point.
    }
  }

  return undefined;
}
```


## packages/adapters/placement/fs/src/native/libc.ts:96 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(fd: number, path: Buffer, buffer: Buffer, flags: number) =>
          choice.version === undefined
            ? symbol(fd, path, buffer, flags)
            : symbol(choice.version, fd, path, buffer, flags)
```


## packages/adapters/placement/fs/src/native/libc.ts:117 :: cstring [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function cstring(value: string) {
  return Buffer.from(`${value}\0`);
}
```


## packages/adapters/placement/fs/src/native/libc.ts:121 :: checked [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function checked(result: number) {
  if (result < 0) throw new EnvdenError("CONFLICT", "Descriptor-relative operation failed");

  return result;
}
```


## packages/adapters/placement/fs/src/native/libc.ts:127 :: identity [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function identity(fd: number, name: string) {
  const buffer = Buffer.alloc(256);

  const result = libc!.fstatat(
    fd,
    cstring(name),
    buffer,
    process.platform === "darwin" ? 0x20 : 0x100,
  );

  if (result < 0 && libc!.errno() === 2) return undefined;
  checked(result);

  // Access times change on reads; compare only device, inode, size, mtime and ctime.
  return process.platform === "darwin"
    ? Buffer.concat([
        buffer.subarray(0, 4),
        buffer.subarray(8, 16),
        buffer.subarray(48, 80),
        buffer.subarray(96, 104),
      ])
    : Buffer.concat([buffer.subarray(0, 16), buffer.subarray(48, 56), buffer.subarray(88, 120)]);
}
```


## packages/adapters/placement/fs/src/native/libc.ts:151 :: openAt [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs, rustix syscalls (static binding replaces Bun FFI discovery)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function openAt(fd: number, name: string, flags: number, mode = 0) {
  // Apple arm64 passes openat's variadic mode on the stack, after eight register arguments.
  return checked(
    libc!.symbols.openat(
      fd,
      cstring(name),
      flags,
      paddedOpen ? 0 : mode,
      0,
      0,
      0,
      0,
      paddedOpen ? mode : 0,
    ),
  );
}
```


## packages/adapters/placement/fs/src/native/place.ts:11 :: placeNative [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function placeNative(
  mode: TPlacementMode,
  root: string,
  path: string,
  storePath: string,
  beforeRename: (() => void) | undefined,
  backupDirectory: string | undefined,
  now: () => number,
  replacingLink?: string,
) {
  const fd = openParent(root, path);
  const name = basename(path);
  const temporary = temporaryName(path);
  let staged: Buffer | undefined;

  try {
    const before = identity(fd, name);
    let previous: Buffer | undefined;

    if (before) {
      const target = linkTarget(fd, name);

      if (
        target !== undefined &&
        target !== replacingLink &&
        !sameTarget(resolve(root, dirname(path), target), storePath)
      )
        throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");

      if (target === undefined) previous = readAt(fd, name);
    }

    const contents = readStore(storePath);
    if (identity(fd, temporary)) checked(libc!.symbols.unlinkat(fd, cstring(temporary), 0));

    if (mode === "link")
      checked(libc!.symbols.symlinkat(cstring(resolve(storePath)), fd, cstring(temporary)));
    else writeAt(fd, temporary, contents);

    staged = identity(fd, temporary);
    assertIdentity(fd, name, before);

    if (previous && !previous.equals(contents))
      backupContents(root, backupDirectory, previous, undefined, now);

    assertIdentity(fd, name, before);
    assertIdentity(fd, temporary, staged);
    beforeRename?.();
    checked(libc!.symbols.renameat(fd, cstring(temporary), fd, cstring(name)));
  } finally {
    try {
      if (staged && identity(fd, temporary)?.equals(staged))
        checked(libc!.symbols.unlinkat(fd, cstring(temporary), 0));
    } finally {
      closeSync(fd);
    }
  }
}
```


## packages/adapters/placement/fs/src/native/place.ts:70 :: readStore [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function readStore(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    if (!fstatSync(fd).isFile())
      throw new EnvdenError("INVALID_INPUT", "Store source is not a regular file");

    fchmodSync(fd, 0o600);

    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
```


## packages/adapters/placement/fs/src/native/remove.ts:8 :: removeNative [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/remove.rs; native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function removeNative(
  root: string,
  path: string,
  storePath: string | undefined,
  beforeUnlink?: () => void,
) {
  const fd = openParent(root, path, false);
  const name = basename(path);

  try {
    const before = identity(fd, name);
    if (!before) return;
    const target = linkTarget(fd, name);

    if (target !== undefined) {
      if (!storePath || !sameTarget(resolve(root, dirname(path), target), storePath))
        throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");
    } else readAt(fd, name);

    assertIdentity(fd, name, before);
    beforeUnlink?.();
    checked(libc!.symbols.unlinkat(fd, cstring(name), 0));
  } finally {
    closeSync(fd);
  }
}
```


## packages/adapters/placement/fs/src/native/stat.ts:1 :: statSymbol [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/rustix target-specific stat bindings`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function statSymbol(
  available: readonly string[],
  platform: NodeJS.Platform,
  arch: string,
): { name: string; version?: number } | undefined {
  const name = platform === "darwin" && arch === "x64" ? "fstatat$INODE64" : "fstatat";
  if (available.includes(name)) return { name };
  if (platform !== "linux" || !available.includes("__fxstatat")) return undefined;
  if (arch === "x64") return { name: "__fxstatat", version: 1 };
  if (arch === "arm64") return { name: "__fxstatat", version: 0 };

  return undefined;
}
```


## packages/adapters/placement/fs/src/operations/inspect.ts:9 :: inspect [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/inspect.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function inspect(
  mode: TPlacementMode,
  root: string,
  storePath: string,
  checkoutPath: string,
): ReturnType<IPlacementAdapter["inspect"]> {
  const path = checkoutRelative(root, checkoutPath);
  const rootStat = await lstat(root);

  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe checkout root");

  // Inspect parents without creating missing checkout folders.
  let parent = root;

  for (const part of path.split("/").slice(0, -1)) {
    parent = join(parent, part);
    const stat = await statOrMissing(parent);
    if (!stat) return "missing";

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe checkout parent");
  }

  const stat = await statOrMissing(checkoutPath);
  if (!stat) return "missing";

  if (stat.isSymbolicLink())
    return (await isStoreLink(storePath, checkoutPath)) ? "linked" : "detached";

  if (!stat.isFile()) return "detached";

  return inspectRegular(mode, storePath, checkoutPath);
}
```


## packages/adapters/placement/fs/src/operations/inspect.ts:44 :: inspectRegular [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/inspect.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function inspectRegular(mode: TPlacementMode, storePath: string, checkoutPath: string) {
  if (!(await statOrMissing(storePath))) return "detached";

  const matches = (await readFile(checkoutPath)).equals(await readFile(storePath));
  if (!matches) return "detached";

  return mode === "link" ? "relinkable" : "linked";
}
```


## packages/adapters/placement/fs/src/operations/link.ts:5 :: isStoreLink [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/inspect.rs; paths.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function isStoreLink(storePath: string, checkoutPath: string): Promise<boolean> {
  return sameTarget(resolve(dirname(checkoutPath), await readlink(checkoutPath)), storePath);
}
```


## packages/adapters/placement/fs/src/operations/place.ts:18 :: place [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; windows/place.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function place(
  mode: TPlacementMode,
  root: string,
  storePath: string,
  checkoutPath: string,
  backupDirectory: string | undefined,
  runtime = { platform: process.platform, libc },
  prepareTemporary: ((path: string) => Promise<void>) | undefined,
  now: () => number,
  replacingLink?: string,
): Promise<void> {
  const path = validatePulledPath(checkoutRelative(root, checkoutPath));

  await prepareTemporaryFile(mode, path, prepareTemporary);

  if (runtime.libc) {
    placeNative(mode, root, path, storePath, undefined, backupDirectory, now, replacingLink);

    return;
  }

  await safeParents(root, path);
  const destination = resolve(checkoutPath);
  const parents = await parentIdentity(root, destination);
  const existing = await statOrMissing(destination);

  if (
    existing?.isSymbolicLink() &&
    !(await isStoreLink(storePath, destination)) &&
    (replacingLink === undefined || (await readlink(destination)) !== replacingLink)
  )
    throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");

  if (existing && !existing.isFile() && !existing.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

  const storeStat = await lstat(storePath);

  if (!storeStat.isFile() || storeStat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Store source is not a regular file");

  await restrictAccess(storePath);
  const temporary = join(dirname(destination), temporaryName(path));

  await rm(temporary, { force: true });

  let staged;

  try {
    if (mode === "link") {
      await symlink(resolve(storePath), temporary);
      staged = await lstat(temporary);
    } else {
      const file = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );

      try {
        staged = await file.stat();
        await restrictAccess(temporary);
        await verifyParents(parents, destination);
        const source = await open(storePath, constants.O_RDONLY | constants.O_NOFOLLOW);

        try {
          await file.writeFile(await source.readFile());
        } finally {
          await source.close();
        }
      } finally {
        await file.close();
      }
    }

    await verifyParents(parents, destination);
    await backupDestination(root, backupDirectory, destination, existing, storePath, parents, now);
    await verifyParents(parents, destination);

    if (!sameIdentity(existing, await statOrMissing(destination)))
      throw new EnvdenError("CONFLICT", "Destination changed during placement");

    const current = await lstat(temporary);

    if (staged?.dev !== current.dev || staged.ino !== current.ino)
      throw new EnvdenError("CONFLICT", "Staged file changed");

    // Windows: parent replacement after this check remains possible.
    await rename(temporary, destination);
  } finally {
    const leftover = await statOrMissing(temporary);

    if (staged && leftover?.dev === staged.dev && leftover.ino === staged.ino)
      await rm(temporary, { force: true });
  }
}
```


## packages/adapters/placement/fs/src/operations/place.ts:115 :: sameIdentity [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; windows/place.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function sameIdentity(
  before: Awaited<ReturnType<typeof statOrMissing>>,
  after: Awaited<ReturnType<typeof statOrMissing>>,
) {
  if (!before || !after) return before === after;

  return (["dev", "ino", "size", "mtimeMs", "ctimeMs"] as const).every(
    (key) => before[key] === after[key],
  );
}
```


## packages/adapters/placement/fs/src/operations/place.ts:122 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; windows/place.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(key) => before[key] === after[key]
```


## packages/adapters/placement/fs/src/operations/place.ts:126 :: backupDestination [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; windows/place.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function backupDestination(
  root: string,
  backupDirectory: string | undefined,
  destination: string,
  existing: Awaited<ReturnType<typeof statOrMissing>>,
  storePath: string,
  parents: Awaited<ReturnType<typeof parentIdentity>>,
  now: () => number,
) {
  if (!existing) return;

  const source = await open(
    existing.isSymbolicLink() ? storePath : destination,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );

  try {
    if (!existing.isSymbolicLink() && !sameIdentity(existing, await source.stat()))
      throw new EnvdenError("CONFLICT", "Destination changed before backup");

    const contents = await source.readFile();
    const store = await open(storePath, constants.O_RDONLY | constants.O_NOFOLLOW);

    try {
      await verifyParents(parents, destination);

      if (!contents.equals(await store.readFile()))
        backupContents(root, backupDirectory, contents, undefined, now);
    } finally {
      await store.close();
    }
  } finally {
    await source.close();
  }
}
```


## packages/adapters/placement/fs/src/operations/remove.ts:10 :: remove [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/remove.rs; windows/adapter.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function remove(
  root: string,
  storePath: string | undefined,
  checkoutPath: string,
  runtime = { platform: process.platform, libc },
) {
  const path = checkoutRelative(root, checkoutPath);

  if (runtime.libc) {
    // Missing parents need no creation; unsafe existing parents must still fail.
    if (!(await statOrMissing(root))) return;

    try {
      removeNative(root, path, storePath);
    } catch (cause) {
      if (cause instanceof EnvdenError && cause.code === "NOT_FOUND") return;
      throw cause;
    }

    return;
  }

  await removeFallback(root, storePath, checkoutPath);
}
```


## packages/adapters/placement/fs/src/operations/remove.ts:35 :: removeFallback [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/remove.rs; windows/adapter.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function removeFallback(root: string, storePath: string | undefined, checkoutPath: string) {
  const parents = await removalParents(root, checkoutPath);
  if (!parents) return;
  const existing = await statOrMissing(checkoutPath);
  if (!existing) return;

  if (existing.isSymbolicLink()) {
    if (!storePath || !(await isStoreLink(storePath, checkoutPath)))
      throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");
  } else if (!existing.isFile())
    throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

  await verifyParents(parents, checkoutPath);
  await unlink(checkoutPath);
}
```


## packages/adapters/placement/fs/src/operations/remove.ts:51 :: removalParents [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/remove.rs; windows/adapter.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function removalParents(root: string, path: string) {
  try {
    return await parentIdentity(root, path);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
}
```


## packages/adapters/placement/fs/src/operations/stat.ts:3 :: statOrMissing [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/native.rs; windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function statOrMissing(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}
```


## packages/adapters/placement/fs/src/operations/supported.ts:6 :: supported [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/adapter.rs; windows/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function supported(mode: TPlacementMode, dir: string): Promise<boolean> {
  if (mode === "copy") return true;
  const probe = join(dir, `.envden-probe-${randomUUID()}`);

  try {
    await symlink(".envden-probe-target", probe);

    return true;
  } catch {
    return false;
  } finally {
    await rm(probe, { force: true });
  }
}
```


## packages/adapters/placement/fs/src/paths/checkout-relative.ts:5 :: checkoutRelative [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/paths.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function checkoutRelative(root: string, path: string): string {
  if (path.split(/[\\/]/).includes(".."))
    throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return validateLocalPath(relative(root, resolve(path)).split("\\").join("/"));
}
```


## packages/adapters/placement/fs/src/paths/parent-identity.ts:5 :: parentIdentity [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function parentIdentity(root: string, destination: string) {
  const realRoot = await realpath(root);
  const path = relative(root, dirname(destination));
  const parents = [];
  let current = root;

  for (const part of ["", ...path.split(sep).filter(Boolean)]) {
    current = join(current, part);
    const stat = await lstat(current);

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("CONFLICT", "Unsafe checkout parent");

    parents.push({ path: current, dev: stat.dev, ino: stat.ino });
  }

  return { realRoot, parents };
}
```


## packages/adapters/placement/fs/src/paths/parent-identity.ts:24 :: verifyParents [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/windows/state.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function verifyParents(
  snapshot: Awaited<ReturnType<typeof parentIdentity>>,
  destination: string,
) {
  for (const parent of snapshot.parents) {
    const stat = await lstat(parent.path);

    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== parent.dev ||
      stat.ino !== parent.ino
    )
      throw new EnvdenError("CONFLICT", "Checkout parent changed");
  }

  const path = relative(snapshot.realRoot, await realpath(dirname(destination)));

  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
    throw new EnvdenError("CONFLICT", "Checkout parent escaped root");
}
```


## packages/adapters/placement/fs/src/paths/safe-parents.ts:6 :: safeParents [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/windows/state.rs; native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function safeParents(root: string, path: string): Promise<void> {
  const rootStat = await lstat(root);

  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe checkout root");

  let current = root;

  for (const part of path.split("/").slice(0, -1)) {
    current = join(current, part);
    let stat = await statOrMissing(current);

    if (!stat) stat = await createParent(current);

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe checkout parent");
  }
}
```


## packages/adapters/placement/fs/src/paths/safe-parents.ts:25 :: createParent [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/windows/state.rs; native.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function createParent(current: string) {
  try {
    await mkdir(current, { mode: 0o700 });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
      throw error;
  }

  return lstat(current);
}
```


## packages/adapters/placement/fs/src/paths/same-target.ts:5 :: sameTarget [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/paths.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function sameTarget(target: string, storePath: string): boolean {
  if (resolve(target) === resolve(storePath)) return true;
  const real = realOrMissing(target);

  return real !== undefined && real === realOrMissing(storePath);
}
```


## packages/adapters/placement/fs/src/paths/same-target.ts:12 :: realOrMissing [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/paths.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function realOrMissing(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}
```


## packages/adapters/placement/fs/src/paths/temporary.ts:6 :: temporaryName [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; windows/place.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function temporaryName(path: string) {
  return `.envden-${createHash("sha256").update(path).digest("hex")}`;
}
```


## packages/adapters/placement/fs/src/paths/temporary.ts:10 :: prepareTemporaryFile [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/place.rs; windows/place.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function prepareTemporaryFile(
  mode: TPlacementMode,
  path: string,
  prepare?: (path: string) => Promise<void>,
) {
  if (mode !== "copy") return;

  if (!prepare)
    throw new EnvdenError("INVALID_INPUT", "Copy placement requires a temporary file exclude");

  await prepare(posix.join(posix.dirname(path), temporaryName(path)));
}
```


## packages/adapters/placement/fs/src/paths/validate-pulled-path.ts:4 :: validatePulledPath [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/paths.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function validatePulledPath(path: string): string {
  if (/\p{Cf}/u.test(path)) throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return validateLocalPath(path);
}
```


## packages/adapters/placement/fs/src/paths/validate-pulled-path.ts:10 :: validateLocalPath [function_declaration]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/paths.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function validateLocalPath(path: string): string {
  validatePath(path);

  if (path.split("/").some((part) => part.toLowerCase() === ".git" || /~[0-9]+(?:\.|$)/.test(part)))
    throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return path;
}
```


## packages/adapters/placement/fs/src/paths/validate-pulled-path.ts:13 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/placement/fs/src/paths.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(part) => part.toLowerCase() === ".git" || /~[0-9]+(?:\.|$)/.test(part)
```


## packages/adapters/shell/rc/src/adapter.ts:13 :: read [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function read(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}
```


## packages/adapters/shell/rc/src/adapter.ts:31 :: constructor [method_definition]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
constructor(
    shell: TShell,
    home = homedir(),
    envdenHome = process.env.ENVDEN_HOME ?? join(home, ".envden"),
    backupDirectory?: string,
    resolveProfile = () => (home === homedir() ? powerShellProfile() : undefined),
  ) {
    this.id = shell;
    this.home = home;
    this.envdenHome = envdenHome;
    this.backupDirectory = backupDirectory;
    this.resolveProfile = resolveProfile;
  }
```


## packages/adapters/shell/rc/src/adapter.ts:36 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => (home === homedir() ? powerShellProfile() : undefined)
```


## packages/adapters/shell/rc/src/adapter.ts:45 :: rcPath [method_definition]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
rcPath() {
    switch (this.id) {
      case "zsh":
        return join(this.home, ".zshrc");
      case "bash":
        return bashRcPath(this.home);
      case "fish":
        return join(this.home, ".config", "fish", "config.fish");
      case "powershell":
        return (this.profile ??=
          this.resolveProfile() ??
          (process.platform === "win32"
            ? join(this.home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
            : join(this.home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1")));
    }
  }
```


## packages/adapters/shell/rc/src/adapter.ts:62 :: hookSnippet [method_definition]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
hookSnippet(binaryPath: string) {
    return renderHook(this.id, binaryPath, this.envdenHome);
  }
```


## packages/adapters/shell/rc/src/adapter.ts:66 :: installed [method_definition]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async installed() {
    const value = await read(this.rcPath());

    return strip(value) !== value;
  }
```


## packages/adapters/shell/rc/src/adapter.ts:72 :: install [method_definition]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async install(binaryPath: string) {
    await editRc(
      this.rcPath(),
      (value) => {
        const current = strip(value);

        const newline = value.includes("\r\n") ? "\r\n" : "\n";

        const snippet = Buffer.from(
          this.hookSnippet(binaryPath).replaceAll("\n", newline),
        ).toString("latin1");

        return `${current}${current && !current.endsWith("\n") ? newline : ""}${snippet}`;
      },
      this.backupDirectory,
    );
  }
```


## packages/adapters/shell/rc/src/adapter.ts:75 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(value) => {
        const current = strip(value);

        const newline = value.includes("\r\n") ? "\r\n" : "\n";

        const snippet = Buffer.from(
          this.hookSnippet(binaryPath).replaceAll("\n", newline),
        ).toString("latin1");

        return `${current}${current && !current.endsWith("\n") ? newline : ""}${snippet}`;
      }
```


## packages/adapters/shell/rc/src/adapter.ts:90 :: uninstall [method_definition]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async uninstall() {
    await editRc(this.rcPath(), strip, this.backupDirectory);
  }
```


## packages/adapters/shell/rc/src/adapter.ts:96 :: strip [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function strip(value: string) {
  return value.replace(
    /# >>> envden >>>\r?\n(?:(?!# >>> envden >>>)[\s\S])*?# <<< envden <<<(?:\r?\n)?/g,
    "",
  );
}
```


## packages/adapters/shell/rc/src/adapter.ts:103 :: createRcShellAdapter [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function createRcShellAdapter(
  shell: TShell,
  home?: string,
  envdenHome?: string,
  backupDirectory?: string,
  resolveProfile?: () => string | undefined,
): IShellAdapter {
  const adapter = new RcShellAdapter(shell, home, envdenHome, backupDirectory, resolveProfile);

  return {
    id: adapter.id,
    rcPath: () => adapter.rcPath(),
    hookSnippet: (binaryPath) => adapter.hookSnippet(binaryPath),
    installed: () => adapter.installed().catch(shellFailure),
    install: (binaryPath) => adapter.install(binaryPath).catch(shellFailure),
    uninstall: () => adapter.uninstall().catch(shellFailure),
  };
}
```


## packages/adapters/shell/rc/src/adapter.ts:114 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => adapter.rcPath()
```


## packages/adapters/shell/rc/src/adapter.ts:115 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(binaryPath) => adapter.hookSnippet(binaryPath)
```


## packages/adapters/shell/rc/src/adapter.ts:116 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => adapter.installed().catch(shellFailure)
```


## packages/adapters/shell/rc/src/adapter.ts:117 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(binaryPath) => adapter.install(binaryPath).catch(shellFailure)
```


## packages/adapters/shell/rc/src/adapter.ts:118 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/adapter.rs; profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => adapter.uninstall().catch(shellFailure)
```


## packages/adapters/shell/rc/src/failures/operation.ts:3 :: shellFailure [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function shellFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("INTERNAL", "Shell configuration operation failed", { cause });
}
```


## packages/adapters/shell/rc/src/files/backup.ts:10 :: backupRc [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit_files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function backupRc(directory: string, original: Uint8Array) {
  await mkdir(directory, { recursive: true, mode: 0o700 });

  if (process.platform === "win32") {
    await verifyWindowsOwner(directory);

    await execTrusted("icacls", [
      directory,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:(OI)(CI)F`,
    ]);
  }

  const folder = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);

  try {
    const stat = await folder.stat();

    if (
      !stat.isDirectory() ||
      (process.platform !== "win32" &&
        (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0))
    )
      throw new EnvdenError("INVALID_INPUT", "Unsafe shell backup directory");

    const file = await open(join(directory, `.envden-backup-${randomUUID()}`), "wx", 0o600);

    try {
      await file.writeFile(original);
      await file.sync();
    } finally {
      await file.close();
    }
  } finally {
    await folder.close();
  }
}
```


## packages/adapters/shell/rc/src/files/bash-profile.ts:5 :: bashRcPath [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function bashRcPath(home: string, platform = process.platform) {
  if (platform !== "darwin") return join(home, ".bashrc");

  const candidates = [".bashrc", ".bash_profile", ".bash_login", ".profile"].map((name) => ({
    name,
    content: read(join(home, name)),
  }));

  const installed = candidates.find((file) => file.content?.includes(start));
  if (installed) return join(home, installed.name);
  const profile = candidates.slice(1).find((file) => file.content !== undefined);
  if (!profile) return join(home, ".bash_profile");

  const sourcesRc = profile
    .content!.split("\n")
    .some(
      (line) =>
        !line.trimStart().startsWith("#") &&
        /(?:^|[\s;&|])(?:source|\.)\s+["']?(?:~|\$HOME|\$\{HOME\})\/\.bashrc["']?(?:\s|;|$)/.test(
          line,
        ),
    );

  return join(home, sourcesRc ? ".bashrc" : profile.name);
}
```


## packages/adapters/shell/rc/src/files/bash-profile.ts:8 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(name) => ({
    name,
    content: read(join(home, name)),
  })
```


## packages/adapters/shell/rc/src/files/bash-profile.ts:13 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(file) => file.content?.includes(start)
```


## packages/adapters/shell/rc/src/files/bash-profile.ts:15 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(file) => file.content !== undefined
```


## packages/adapters/shell/rc/src/files/bash-profile.ts:21 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(line) =>
        !line.trimStart().startsWith("#") &&
        /(?:^|[\s;&|])(?:source|\.)\s+["']?(?:~|\$HOME|\$\{HOME\})\/\.bashrc["']?(?:\s|;|$)/.test(
          line,
        )
```


## packages/adapters/shell/rc/src/files/bash-profile.ts:31 :: read [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function read(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
```


## packages/adapters/shell/rc/src/files/edit.ts:16 :: editRc [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; edit_files.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function editRc(
  path: string,
  transform: (current: string) => string,
  backupDirectory?: string,
  hooks: IEditHooks = {},
) {
  const edit = await readRc(path, transform, backupDirectory, hooks);
  if (!edit) return;
  const { resolved, stat, next } = edit;
  const temporary = join(dirname(resolved), `.envden-rc-${crypto.randomUUID()}`);

  try {
    const replacement = await open(temporary, "wx", stat.mode & 0o777);

    try {
      await replacement.chmod(stat.mode & 0o777);
      await replacement.writeFile(Buffer.from(next, "latin1"));
      await replacement.sync();
    } finally {
      await replacement.close();
    }

    const current = await lstat(resolved);

    if (!sameRc(current, stat))
      throw new EnvdenError("CONFLICT", "Shell configuration changed during editing");

    await replaceRc(temporary, resolved, stat);
  } finally {
    await rm(temporary, { force: true });
  }
}
```


## packages/adapters/shell/rc/src/files/edit.ts:49 :: readRc [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; edit_files.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function readRc(
  path: string,
  transform: (current: string) => string,
  backupDirectory: string | undefined,
  hooks: IEditHooks,
) {
  const target = await resolveRc(path, transform);
  if (!target) return;
  const { resolved, flags } = target;

  await hooks.resolved?.();
  const file = await open(resolved, flags, 0o600);

  try {
    const stat = await rcStat(file, resolved);

    await hooks.opened?.();
    const original = await file.readFile();
    const next = transform(original.toString("latin1"));
    await hooks.read?.();
    if (next === original.toString("latin1")) return;
    if (backupDirectory) await backupRc(backupDirectory, original);

    return { resolved, stat, next };
  } finally {
    await file.close();
  }
}
```


## packages/adapters/shell/rc/src/files/edit.ts:78 :: replaceRc [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; edit_files.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function replaceRc(
  temporary: string,
  destination: string,
  expected: Awaited<ReturnType<typeof lstat>>,
) {
  try {
    await rename(temporary, destination);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EPERM")) throw cause;
    const current = await lstat(destination);

    if (!sameRc(current, expected) || current.mode & 0o200) throw cause;

    await chmod(destination, current.mode | 0o200);

    try {
      await rename(temporary, destination);
    } catch (error) {
      await chmod(destination, current.mode);
      throw error;
    }
  }
}
```


## packages/adapters/shell/rc/src/files/edit.ts:102 :: resolveRc [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; edit_files.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function resolveRc(path: string, transform: (current: string) => string) {
  let resolved = path;

  for (let hops = 0; hops < MAX_LINKS; hops++) {
    const real = await realpath(resolved).catch(missing);

    if (real !== undefined)
      return { resolved: real, flags: constants.O_RDONLY | constants.O_NOFOLLOW };

    if (!(await lstat(resolved).catch(missing))?.isSymbolicLink()) break;

    // a dangling link into a dotfiles repo: create the file it points to
    resolved = resolve(dirname(resolved), await readlink(resolved));
  }

  if (transform("") === "") return;
  await mkdir(dirname(resolved), { recursive: true });

  return {
    resolved,
    flags: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CREAT | constants.O_EXCL,
  };
}
```


## packages/adapters/shell/rc/src/files/edit.ts:126 :: missing [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; edit_files.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function missing(error: unknown): undefined {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
  throw error;
}
```


## packages/adapters/shell/rc/src/files/edit.ts:131 :: sameRc [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; edit_files.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function sameRc(
  current: Awaited<ReturnType<typeof lstat>>,
  expected: Awaited<ReturnType<typeof lstat>>,
) {
  return (["dev", "ino", "size", "mtimeMs", "ctimeMs"] as const).every(
    (key) => current[key] === expected[key],
  );
}
```


## packages/adapters/shell/rc/src/files/edit.ts:136 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; edit_files.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(key) => current[key] === expected[key]
```


## packages/adapters/shell/rc/src/files/powershell-profile.ts:7 :: powerShellProfile [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function powerShellProfile(
  run = execTrustedSync,
  home = homedir(),
  platform = process.platform,
): string | undefined {
  const candidates: string[] = [];

  for (const shell of ["pwsh", "powershell"]) {
    try {
      const path = run(
        shell,
        ["-NoProfile", "-NonInteractive", "-Command", "$PROFILE.CurrentUserCurrentHost"],
        { timeout: 5000 },
      ).replace(/\r?\n$/, "");

      if (
        isAbsolute(path) &&
        basename(path) === "Microsoft.PowerShell_profile.ps1" &&
        !Array.from(path).some((character) => {
          const code = character.charCodeAt(0);

          return code < 32 || (code >= 127 && code <= 159);
        })
      )
        candidates.push(path);
    } catch {
      continue;
    }
  }

  const defaults =
    platform === "win32"
      ? [
          join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
          join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
        ]
      : [join(home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1")];

  return [...candidates, ...defaults].find(hasHook) ?? candidates[0];
}
```


## packages/adapters/shell/rc/src/files/powershell-profile.ts:25 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(character) => {
          const code = character.charCodeAt(0);

          return code < 32 || (code >= 127 && code <= 159);
        }
```


## packages/adapters/shell/rc/src/files/powershell-profile.ts:48 :: hasHook [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/profile.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function hasHook(path: string) {
  try {
    return readFileSync(path, "utf8").includes(start);
  } catch {
    return false;
  }
}
```


## packages/adapters/shell/rc/src/files/stat.ts:5 :: rcStat [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function rcStat(file: FileHandle, resolved: string) {
  const opened = await file.stat();
  const stat = await lstat(resolved);
  validateRc(opened);
  validateRc(stat);

  if (opened.dev !== stat.dev || opened.ino !== stat.ino)
    throw new EnvdenError("CONFLICT", "Shell configuration changed during editing");

  if (process.platform === "win32") await verifyWindowsOwner(resolved);

  return stat;
}
```


## packages/adapters/shell/rc/src/files/stat.ts:19 :: validateRc [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/edit.rs; identity.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function validateRc(stat: Awaited<ReturnType<typeof lstat>>) {
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (process.platform !== "win32" && stat.uid !== process.getuid?.())
  )
    throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration file");
}
```


## packages/adapters/shell/rc/src/files/windows.ts:4 :: verifyWindowsOwner [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/windows.rs (native SID queries replace PowerShell command)`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function verifyWindowsOwner(path: string): Promise<void> {
  const { stdout } = await execTrusted(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; $p=$env:ENVDEN_RC_PATH; $a=[IO.File]::GetAttributes($p); if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }; $acl=if (($a -band [IO.FileAttributes]::Directory) -ne 0) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }; $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent(); ($owner -eq $identity.User.Value) -or ($owner -eq $identity.Owner.Value)",
    ],
    { env: { ENVDEN_RC_PATH: path } },
  );

  if (stdout.trim() !== "True")
    throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration owner");
}
```


## packages/adapters/shell/rc/src/render/physical.ts:3 :: renderPhysical [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/templates/*`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function renderPhysical(shell: TShell) {
  if (shell === "powershell")
    return `function _envden_physical_path([string]$path) {
  if (!$path) { return '' }
  $directory = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if (!$directory) { return '' }
  if ($directory.LinkType) {
    try { $target = $directory.ResolveLinkTarget($true) } catch { return '' }
    if ($target) { return _envden_physical_path $target.FullName }
  }
  if (!$directory.Parent) { return $directory.FullName }
  $parent = _envden_physical_path $directory.Parent.FullName
  if (!$parent) { return '' }
  return [IO.Path]::Combine($parent, $directory.Name)
}`;

  if (shell === "fish")
    return `function _envden_inside
  set -l directory $argv[2]
  while test -n "$directory"
    if test "$directory" -ef "$argv[1]"
      return 0
    end
    if test "$directory" = /
      break
    end
    set directory (string replace -r '/[^/]*$' '' -- "$directory")
    test -n "$directory"; or set directory /
  end
  return 1
end`;

  return `_envden_inside() {
  local directory="$2"
  while [ -n "$directory" ]; do
    [ "$directory" -ef "$1" ] && return 0
    [ "$directory" != / ] || break
    directory="\${directory%/*}"
    [ -n "$directory" ] || directory=/
  done
  return 1
}`;
}
```


## packages/adapters/shell/rc/src/render.ts:7 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/render.rs; templates/*`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(value: string) => `'${value.replaceAll("'", "'\\''")}'`
```


## packages/adapters/shell/rc/src/render.ts:8 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/render.rs; templates/*`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(value: string) => `'${value.replace(/[\\']/g, "\\$&")}'`
```


## packages/adapters/shell/rc/src/render.ts:9 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/render.rs; templates/*`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(value: string) => `'${value.replace(/['’‘‚‛]/g, (quote) => quote + quote)}'`
```


## packages/adapters/shell/rc/src/render.ts:9 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/render.rs; templates/*`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(quote) => quote + quote
```


## packages/adapters/shell/rc/src/render.ts:11 :: renderHook [function_declaration]

DONE

Rust correspondence: `rust/adapters/shell/rc/src/render.rs; templates/*`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function renderHook(shell: TShell, binaryPath: string, envdenHome: string) {
  if (!isAbsolute(binaryPath) || /[\r\n]/.test(binaryPath + envdenHome))
    throw new EnvdenError("INVALID_INPUT", "Hook paths must be absolute and single-line");

  const state = join(envdenHome, "state");
  const shellQuote = shell === "fish" ? fishQuote : quote;

  const paths = {
    notice: shellQuote(join(state, "notice")),
    approved: shellQuote(join(state, "approved-checkouts")),
    offered: shellQuote(join(state, "track-offered")),
    offers: shellQuote(join(state, "track-offers")),
    update: shellQuote(join(state, "notice-update")),
    day: shellQuote(join(state, "update-offered-day")),
  };

  const command = `env -u BUN_OPTIONS -u BUN_BE_BUN ${shellQuote(binaryPath)} status --refresh-cache`;
  let body: string;

  switch (shell) {
    case "bash":
    case "zsh": {
      body = `_envden_notice() {
  local saved_status=$?
  [ "\${_envden_last_pwd-}" != "$PWD" ] || return "$saved_status"
  _envden_last_pwd="$PWD"
  local physical=${shell === "zsh" ? '"${PWD:A}"' : '"$(pwd -P)"'}
  local root approved=0 cache=${paths.notice} now modified
  [ -r ${paths.approved} ] && while IFS= read -r root; do
    [ -n "$root" ] || continue
    if _envden_inside "$root" "$physical"; then approved=1; break; fi
  done 2>/dev/null < ${paths.approved}
  local offered=${paths.offered} root_seen=0 day line
  [ -r ${paths.offers} ] && while IFS= read -r root; do
    [ -n "$root" ] || continue
    if _envden_inside "$root" "$physical"; then
      root_seen=0
      [ -r "$offered" ] && while IFS= read -r line; do [ "$line" != "$root" ] || root_seen=1; done 2>/dev/null < "$offered"
      if [ "$root_seen" = 0 ]; then
        printf '%s\\n' 'envden: env files found; run envden track'
        printf '%s\\n' "$root" >> "$offered"
      fi
      break
    fi
  done 2>/dev/null < ${paths.offers}
  day=$(date +%Y-%m-%d)
  [ -r ${paths.update} ] && while IFS= read -r line; do
    case "$line" in
      'envden: update required; run envden update') printf '%s\\n' "$line" ;;
      'envden: update available; run envden update')
        if [ "$(cat -- ${paths.day} 2>/dev/null)" != "$day" ]; then
          printf '%s\\n' "$line"
          printf '%s\\n' "$day" > ${paths.day}
        fi ;;
    esac
  done 2>/dev/null < ${paths.update}
  if [ "$approved" = 1 ] && [ -f "$cache" ]; then LC_ALL=C tr -cd '\\11\\12\\40-\\176' < "$cache"; fi
  now=$(date +%s)
  modified=$(stat -c %Y "$cache" 2>/dev/null) || modified=$(stat -f %m "$cache" 2>/dev/null) || modified=0
  if [ "$((now - modified))" -gt 60 ]; then
    (${command} </dev/null >/dev/null 2>&1 &)
  fi
  return "$saved_status"
}
`;

      body +=
        shell === "zsh"
          ? "autoload -Uz add-zsh-hook\nadd-zsh-hook -d chpwd _envden_notice\nadd-zsh-hook chpwd _envden_notice\n_envden_notice"
          : 'case ";${PROMPT_COMMAND:-};" in *\'_envden_notice;\'*) ;; *) PROMPT_COMMAND="_envden_notice;${PROMPT_COMMAND:-}" ;; esac\n_envden_notice';

      break;
    }
    case "fish":
      body = `function _envden_notice --on-variable PWD
  set -l saved_status $status
  set -l cache ${paths.notice}
  set -l physical (pwd -P)
  set -l approved 0
  if test -f ${paths.approved}
    while read -l root
      if test -n "$root"; and _envden_inside "$root" "$physical"
        set approved 1
        break
      end
    end < ${paths.approved}
  end
  set -l offered ${paths.offered}
  if test -f ${paths.offers}
    while read -l root
      if test -n "$root"; and _envden_inside "$root" "$physical"
        if not contains -- "$root" (cat -- "$offered" 2>/dev/null)
          printf '%s\\n' 'envden: env files found; run envden track'
          printf '%s\\n' "$root" >> "$offered"
        end
        break
      end
    end < ${paths.offers}
  end
  set -l day (date +%Y-%m-%d)
  if test -f ${paths.update}
    while read -l line
      switch "$line"
        case 'envden: update required; run envden update'
          printf '%s\\n' "$line"
        case 'envden: update available; run envden update'
          if test (cat -- ${paths.day} 2>/dev/null; or echo missing) != "$day"
            printf '%s\\n' "$line"
            printf '%s\\n' "$day" > ${paths.day}
          end
      end
    end < ${paths.update}
  end
  if test "$approved" = 1; and test -f "$cache"
    env LC_ALL=C tr -cd '\\11\\12\\40-\\176' < "$cache"
  end
  set -l modified (stat -c %Y "$cache" 2>/dev/null; or stat -f %m "$cache" 2>/dev/null; or echo 0)
  if test (math (date +%s) - "$modified") -gt 60
    ${command} </dev/null >/dev/null 2>&1 &
    disown
  end
  return $saved_status
end
_envden_notice`;

      break;
    case "powershell":
      body = `if (!$global:EnvdenPreviousPrompt) { $global:EnvdenPreviousPrompt = $function:prompt }
function global:prompt {
  $envdenSuccess = $?
  $envdenExitCode = $global:LASTEXITCODE
  $physical = _envden_physical_path ((Get-Location).ProviderPath)
  $insensitive = @(Get-Content -LiteralPath ${psQuote(join(state, "approved-checkouts-insensitive"))} -ErrorAction SilentlyContinue)
  $cache = ${psQuote(join(state, "notice"))}
  $approved = @(Get-Content -LiteralPath ${psQuote(join(state, "approved-checkouts"))} -ErrorAction SilentlyContinue | Where-Object { $_ -and (($physical.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar).StartsWith($_.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar, $(if ($insensitive -ccontains $_) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }))) }).Count -gt 0
  $changed = $global:EnvdenLastDirectory -cne $PWD.Path
  $global:EnvdenLastDirectory = $PWD.Path
  if ($changed) {
    $offered = ${psQuote(join(state, "track-offered"))}
    foreach ($root in @(Get-Content -LiteralPath ${psQuote(join(state, "track-offers"))} -ErrorAction SilentlyContinue)) {
      if ($root -and (($physical.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar).StartsWith($root.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar, $(if ($IsWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal })))) {
        if (@(Get-Content -LiteralPath $offered -ErrorAction SilentlyContinue) -cnotcontains $root) {
          Write-Host 'envden: env files found; run envden track'
          Add-Content -LiteralPath $offered -Value $root
        }
        break
      }
    }
    $day = (Get-Date).ToString('yyyy-MM-dd')
    $dayFile = ${psQuote(join(state, "update-offered-day"))}
    foreach ($line in @(Get-Content -LiteralPath ${psQuote(join(state, "notice-update"))} -ErrorAction SilentlyContinue)) {
      if ($line -ceq 'envden: update required; run envden update') { Write-Host $line }
      if ($line -ceq 'envden: update available; run envden update' -and (Get-Content -LiteralPath $dayFile -ErrorAction SilentlyContinue) -cne $day) {
        Write-Host $line
        Set-Content -LiteralPath $dayFile -Value $day
      }
    }
    if ($approved -and (Test-Path -LiteralPath $cache)) { Get-Content -LiteralPath $cache | ForEach-Object { $_ -replace '[^\\x20-\\x7E]', '' } | Out-Host }
    if (!(Test-Path -LiteralPath $cache) -or ((Get-Date) - (Get-Item -LiteralPath $cache).LastWriteTime).TotalSeconds -gt 60) {
      $info = [Diagnostics.ProcessStartInfo]::new(${psQuote(binaryPath)})
      $info.Arguments = 'status --refresh-cache'
      $info.UseShellExecute = $false; $info.CreateNoWindow = $true
      $info.Environment.Remove('BUN_OPTIONS'); $info.Environment.Remove('BUN_BE_BUN')
      $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
      $process = [Diagnostics.Process]::Start($info)
      $process.Dispose()
    }
  }
  $global:LASTEXITCODE = $envdenExitCode
  if (!$envdenSuccess) { Write-Error 'Previous command failed' -ErrorAction Ignore }
  & $global:EnvdenPreviousPrompt
}`;

      break;
  }

  return `${start}\n${renderPhysical(shell)}\n${body}\n${end}\n`;
}
```


## packages/adapters/repo/git/src/adapter.ts:12 :: createGitRepoAdapter [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function createGitRepoAdapter(
  options: {
    resolveSshHost?: (host: string) => Promise<string>;
    skipFolders?: string[];
  } = {},
): IRepoAdapter {
  return {
    id: "git",
    caseInsensitive: (root, readOnly) => caseInsensitive(root, readOnly).catch(repoFailure),
    checkoutAt: (path) =>
      checkoutAt(path, options.resolveSshHost ?? resolveSshHost).catch(repoFailure),
    worktrees: (checkout) => worktrees(checkout).catch(repoFailure),
    submodules: (checkout) => submodules(checkout).catch(repoFailure),
    envFiles: (checkout, rules) =>
      envFiles(checkout, {
        ...rules,
        extraSkipped: [...(options.skipFolders ?? []), ...(rules?.extraSkipped ?? [])],
      }).catch(repoFailure),
    isIgnored: (checkout, path) => isIgnored(checkout, path).catch(repoFailure),
    ensureIgnored: (checkout, path) => ensureIgnored(checkout, path).catch(repoFailure),
  };
}
```


## packages/adapters/repo/git/src/adapter.ts:20 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(root, readOnly) => caseInsensitive(root, readOnly).catch(repoFailure)
```


## packages/adapters/repo/git/src/adapter.ts:21 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(path) =>
      checkoutAt(path, options.resolveSshHost ?? resolveSshHost).catch(repoFailure)
```


## packages/adapters/repo/git/src/adapter.ts:23 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(checkout) => worktrees(checkout).catch(repoFailure)
```


## packages/adapters/repo/git/src/adapter.ts:24 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(checkout) => submodules(checkout).catch(repoFailure)
```


## packages/adapters/repo/git/src/adapter.ts:25 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(checkout, rules) =>
      envFiles(checkout, {
        ...rules,
        extraSkipped: [...(options.skipFolders ?? []), ...(rules?.extraSkipped ?? [])],
      }).catch(repoFailure)
```


## packages/adapters/repo/git/src/adapter.ts:30 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(checkout, path) => isIgnored(checkout, path).catch(repoFailure)
```


## packages/adapters/repo/git/src/adapter.ts:31 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(checkout, path) => ensureIgnored(checkout, path).catch(repoFailure)
```


## packages/adapters/repo/git/src/checkout/case-probe.ts:1 :: caseProbe [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/case.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function caseProbe(
  names: readonly string[],
): { kind: "compare"; name: string; alternate: string } | { kind: "sensitive" | "empty" } {
  for (const name of names) {
    const alternate = name.replace(/[a-zA-Z]/, (letter) =>
      letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase(),
    );

    if (name === alternate) continue;
    if (names.includes(alternate)) return { kind: "sensitive" };

    return { kind: "compare", name, alternate };
  }

  return { kind: "empty" };
}
```


## packages/adapters/repo/git/src/checkout/case-probe.ts:5 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/case.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(letter) =>
      letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()
```


## packages/adapters/repo/git/src/checkout/case.ts:6 :: caseInsensitive [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/case.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function caseInsensitive(root: string, readOnly = false): Promise<boolean> {
  const probe = caseProbe(await readdir(root));
  if (probe.kind === "sensitive") return false;

  if (probe.kind === "compare") {
    const original = await lstat(join(root, probe.name));
    const alternate = await lstat(join(root, probe.alternate)).catch(missing);

    return alternate?.dev === original.dev && alternate?.ino === original.ino;
  }

  if (readOnly)
    throw new EnvdenError("NOT_IMPLEMENTED", "Filesystem case behavior requires a writable probe");

  return writableProbe(root);
}
```


## packages/adapters/repo/git/src/checkout/case.ts:23 :: writableProbe [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/case.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function writableProbe(root: string) {
  const name = `.envden-case-${crypto.randomUUID()}`;
  const path = join(root, name);
  const file = await open(path, "wx", 0o600);

  try {
    const original = await file.stat();

    const alternate = await lstat(join(root, name.toUpperCase())).catch(missing);

    return alternate?.dev === original.dev && alternate?.ino === original.ino;
  } finally {
    await file.close();
    await rm(path, { force: true });
  }
}
```


## packages/adapters/repo/git/src/checkout/case.ts:40 :: missing [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/case.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
```


## packages/adapters/repo/git/src/checkout/checkout.ts:11 :: checkoutAt [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function checkoutAt(
  path: string,
  resolveHost: (host: string) => Promise<string>,
): Promise<ICheckout | undefined> {
  let root: string;

  try {
    const stat = await lstat(path);

    root = (
      await git(stat.isDirectory() ? path : dirname(path), ["rev-parse", "--show-toplevel"])
    ).trimEnd();
  } catch (error) {
    if (
      !(
        error instanceof EnvdenError &&
        error.cause &&
        typeof error.cause === "object" &&
        "exitCode" in error.cause
      )
    )
      throw error;

    return undefined;
  }

  const remotes = (await git(root, ["remote"])).trim().split("\n").filter(Boolean);

  const name = remotes.includes("origin")
    ? "origin"
    : remotes.length === 1
      ? remotes[0]
      : undefined;

  if (!name) throw new EnvdenError("INVALID_INPUT", "Choose a git remote for this checkout");
  const remote = await remoteUrl(root, name);
  const parts = remoteParts(remote);
  const repoId = normalizeRepoId(remote, parts.ssh ? await resolveHost(parts.host) : undefined);
  const common = (await git(root, ["rev-parse", "--git-common-dir"])).trimEnd();

  const gitDir = await realpath(resolve(root, common));

  const upstreamRepoId = remotes.includes("upstream")
    ? await upstreamId(root, resolveHost)
    : undefined;

  const directory = await lstat(gitDir);
  const rootStat = await lstat(await realpath(root));

  return {
    identity: `${directory.dev}:${directory.ino}:${directory.birthtimeMs}:${rootStat.ino}:${rootStat.birthtimeMs}`,
    rootDevice: rootStat.dev,
    ...(upstreamRepoId ? { upstreamRepoId } : {}),
    root: await realpath(root),
    repoId,
    gitDir,
    registeredWorktree: await registeredWorktree(root, gitDir),
  };
}
```


## packages/adapters/repo/git/src/checkout/checkout.ts:71 :: upstreamId [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function upstreamId(root: string, resolveHost: (host: string) => Promise<string>) {
  const remote = await remoteUrl(root, "upstream");
  const parts = remoteParts(remote);

  return normalizeRepoId(remote, parts.ssh ? await resolveHost(parts.host) : undefined);
}
```


## packages/adapters/repo/git/src/checkout/registration.ts:5 :: registeredWorktree [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function registeredWorktree(root: string, common: string): Promise<boolean> {
  try {
    const dotGit = join(root, ".git");
    const entry = await lstat(dotGit);
    if (!entry.isFile() || entry.isSymbolicLink()) return false;

    const privateDir = await realpath(
      resolve(root, (await git(root, ["rev-parse", "--git-dir"])).trimEnd()),
    );

    const worktrees = await lstat(join(common, "worktrees"));
    if (!worktrees.isDirectory() || worktrees.isSymbolicLink()) return false;
    const registrations = await realpath(join(common, "worktrees"));
    const name = relative(registrations, privateDir);

    if (!name || name.includes("/") || name.includes("\\") || name === ".." || isAbsolute(name))
      return false;

    const backlink = join(privateDir, "gitdir");
    if (!(await lstat(backlink)).isFile() || (await lstat(backlink)).isSymbolicLink()) return false;

    return (
      (await realpath(resolve(privateDir, (await readFile(backlink, "utf8")).trimEnd()))) ===
      (await realpath(dotGit))
    );
  } catch {
    return false;
  }
}
```


## packages/adapters/repo/git/src/checkout/submodules.ts:7 :: submodules [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function submodules(checkout: ICheckout): Promise<string[]> {
  const output = await git(checkout.root, [
    "config",
    "--file",
    join(checkout.root, ".gitmodules"),
    "--no-includes",
    "-z",
    "--get-regexp",
    "^submodule\\..*\\.path$",
  ]).catch(noneFound);

  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => record.slice(record.indexOf("\n") + 1));
}
```


## packages/adapters/repo/git/src/checkout/submodules.ts:21 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(record) => record.slice(record.indexOf("\n") + 1)
```


## packages/adapters/repo/git/src/checkout/submodules.ts:25 :: noneFound [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function noneFound(error: unknown): string {
  if (exitCode(error) === 1) return "";

  throw error;
}
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:8 :: worktrees [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function worktrees(
  checkout: ICheckout,
  run = (args: string[]) => git(checkout.root, args),
): Promise<string[]> {
  const separated = await run([...LIST, "-z"]).catch(() => undefined);
  if (separated !== undefined) return worktreePaths(separated, "\0");

  return worktreePaths(await run(LIST), "\n");
}
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:10 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(args: string[]) => git(checkout.root, args)
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:12 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => undefined
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:19 :: worktreePaths [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function worktreePaths(output: string, separator: string) {
  return output
    .split(separator + separator)
    .map((record) => record.split(separator))
    .filter((fields) => !fields.some((field) => field === "bare" || field.startsWith("prunable")))
    .flatMap((fields) => fields.filter((field) => field.startsWith("worktree ")))
    .map((field) => normalize(field.slice(9)));
}
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:22 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(record) => record.split(separator)
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:23 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(fields) => !fields.some((field) => field === "bare" || field.startsWith("prunable"))
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:23 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(field) => field === "bare" || field.startsWith("prunable")
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:24 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(fields) => fields.filter((field) => field.startsWith("worktree "))
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:24 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(field) => field.startsWith("worktree ")
```


## packages/adapters/repo/git/src/checkout/worktrees.ts:25 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(field) => normalize(field.slice(9))
```


## packages/adapters/repo/git/src/env-files/discovery.ts:13 :: envFiles [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function envFiles(
  checkout: ICheckout,
  options: IEnvFileRules = {},
): Promise<string[]> {
  const files: string[] = [];

  const git = await gitSession(checkout.root);
  const insensitive = await caseInsensitive(checkout.root);

  const key = (path: string) =>
    insensitive ? path.normalize("NFC").toLowerCase() : path.normalize("NFC");

  const entries = (await git(["ls-files", "--stage", "-z"])).split("\0").filter(Boolean);

  const submodules = entries
    .filter((line) => line.startsWith("160000 "))
    .map((line) => line.slice(line.indexOf("\t") + 1));

  const tracked = new Set(entries.map((line) => key(line.slice(line.indexOf("\t") + 1))));
  await walk(checkout, "", options, submodules, files);
  const candidates = files.filter((path) => !tracked.has(key(path)));
  if (!candidates.length) return [];

  try {
    return (await git(["check-ignore", "--stdin", "-z"], candidates.join("\0") + "\0"))
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (exitCode(error) === 1) return [];

    throw error;
  }
}
```


## packages/adapters/repo/git/src/env-files/discovery.ts:22 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(path: string) =>
    insensitive ? path.normalize("NFC").toLowerCase() : path.normalize("NFC")
```


## packages/adapters/repo/git/src/env-files/discovery.ts:28 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(line) => line.startsWith("160000 ")
```


## packages/adapters/repo/git/src/env-files/discovery.ts:29 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(line) => line.slice(line.indexOf("\t") + 1)
```


## packages/adapters/repo/git/src/env-files/discovery.ts:31 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(line) => key(line.slice(line.indexOf("\t") + 1))
```


## packages/adapters/repo/git/src/env-files/discovery.ts:33 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(path) => !tracked.has(key(path))
```


## packages/adapters/repo/git/src/env-files/discovery.ts:48 :: walk [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function walk(
  checkout: ICheckout,
  dir: string,
  options: IEnvFileRules,
  submodules: string[],
  files: string[],
): Promise<void> {
  const entries = await readableEntries(checkout.root, dir);
  if (nestedClone(dir, entries)) return;

  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (submodules.includes(path) || !encodable(path)) continue;

    if (entry.isDirectory()) {
      if (descends(path, options)) await walk(checkout, path, options, submodules, files);
    } else if (candidate(entry, path, options)) files.push(path);
  }
}
```


## packages/adapters/repo/git/src/env-files/discovery.ts:68 :: descends [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function descends(path: string, options: IEnvFileRules) {
  return acceptsEnvPath(`${path}/.env`, { extraSkipped: options.extraSkipped ?? [] });
}
```


## packages/adapters/repo/git/src/env-files/discovery.ts:73 :: nestedClone [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function nestedClone(dir: string, entries: Dirent[]) {
  return !!dir && entries.some((entry) => entry.name === ".git");
}
```


## packages/adapters/repo/git/src/env-files/discovery.ts:74 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(entry) => entry.name === ".git"
```


## packages/adapters/repo/git/src/env-files/discovery.ts:77 :: candidate [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function candidate(entry: Dirent, path: string, options: IEnvFileRules) {
  return (entry.isFile() || entry.isSymbolicLink()) && acceptsEnvPath(path, options);
}
```


## packages/adapters/repo/git/src/env-files/discovery.ts:81 :: unreadable [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function unreadable(error: unknown) {
  return (
    error instanceof Error && "code" in error && (error.code === "EACCES" || error.code === "EPERM")
  );
}
```


## packages/adapters/repo/git/src/env-files/discovery.ts:87 :: readableEntries [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function readableEntries(root: string, dir: string): Promise<Dirent[]> {
  try {
    return await readdir(resolve(root, dir), { withFileTypes: true });
  } catch (error) {
    if (dir && unreadable(error)) return [];
    throw error;
  }
}
```


## packages/adapters/repo/git/src/env-files/discovery.ts:96 :: encodable [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function encodable(path: string) {
  try {
    validatePath(path);

    return true;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "INVALID_DATA") return false;
    throw error;
  }
}
```


## packages/adapters/repo/git/src/env-files/tracked.ts:5 :: tracked [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function tracked(checkout: ICheckout, path: string): Promise<boolean> {
  const insensitive = await caseInsensitive(checkout.root);
  const key = path.normalize("NFC");
  const files = (await git(checkout.root, ["ls-files", "-z"])).split("\0");

  return files.some((file) =>
    insensitive
      ? file.normalize("NFC").toLowerCase() === key.toLowerCase()
      : file.normalize("NFC") === key,
  );
}
```


## packages/adapters/repo/git/src/env-files/tracked.ts:10 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/discovery.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(file) =>
    insensitive
      ? file.normalize("NFC").toLowerCase() === key.toLowerCase()
      : file.normalize("NFC") === key
```


## packages/adapters/repo/git/src/exec/git.ts:14 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(value) => ["-c", value]
```


## packages/adapters/repo/git/src/exec/git.ts:16 :: git [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function git(root: string, args: string[], input?: string): Promise<string> {
  return (await gitSession(root))(args, input);
}
```


## packages/adapters/repo/git/src/exec/git.ts:20 :: gitSession [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function gitSession(root: string, config: TConfigEntry[] = []) {
  const directories = (await globalConfig("^safe\\.directory$")).flatMap(([key, value]) => [
    "-c",
    `${key}=${value}`,
  ]);

  return async (args: string[], input?: string): Promise<string> => {
    const { stdout } = await exec(
      "git",
      [
        ...safeConfig,
        ...directories,
        ...(args[0] === "ls-files" ? ["--literal-pathspecs"] : []),
        "-C",
        root,
        ...args,
      ],
      {
        ...(input === undefined ? {} : { stdin: new Blob([input]) }),
        env: {
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_PAGER: "cat",
          GIT_CONFIG_NOSYSTEM: "1",
          // git reads /dev/null as an empty file on every platform, Git for Windows included
          GIT_CONFIG_GLOBAL: "/dev/null",
          ...configEnvironment(config),
        },
      },
    );

    return stdout;
  };
}
```


## packages/adapters/repo/git/src/exec/git.ts:21 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
([key, value]) => [
    "-c",
    `${key}=${value}`,
  ]
```


## packages/adapters/repo/git/src/exec/git.ts:26 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async (args: string[], input?: string): Promise<string> => {
    const { stdout } = await exec(
      "git",
      [
        ...safeConfig,
        ...directories,
        ...(args[0] === "ls-files" ? ["--literal-pathspecs"] : []),
        "-C",
        root,
        ...args,
      ],
      {
        ...(input === undefined ? {} : { stdin: new Blob([input]) }),
        env: {
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_PAGER: "cat",
          GIT_CONFIG_NOSYSTEM: "1",
          // git reads /dev/null as an empty file on every platform, Git for Windows included
          GIT_CONFIG_GLOBAL: "/dev/null",
          ...configEnvironment(config),
        },
      },
    );

    return stdout;
  }
```


## packages/adapters/repo/git/src/exec/git.ts:56 :: configEnvironment [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function configEnvironment(config: TConfigEntry[]): Record<string, string> {
  if (config.length === 0) return {};

  return Object.fromEntries([
    ["GIT_CONFIG_COUNT", String(config.length)],
    ...config.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key],
      [`GIT_CONFIG_VALUE_${index}`, value],
    ]),
  ]);
}
```


## packages/adapters/repo/git/src/exec/git.ts:61 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key],
      [`GIT_CONFIG_VALUE_${index}`, value],
    ]
```


## packages/adapters/repo/git/src/exec/global-config.ts:6 :: globalConfig [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function globalConfig(pattern: string): Promise<TConfigEntry[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["config", "--global", "--null", "--get-regexp", pattern],
      {
        env: { GIT_CONFIG_NOSYSTEM: "1" },
      },
    );

    return parseEntries(stdout);
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      error.cause &&
      typeof error.cause === "object" &&
      "exitCode" in error.cause &&
      error.cause.exitCode === 1
    )
      return [];

    throw error;
  }
}
```


## packages/adapters/repo/git/src/exec/global-config.ts:31 :: parseEntries [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function parseEntries(stdout: string): TConfigEntry[] {
  return stdout.split("\0").flatMap((entry) => {
    const split = entry.indexOf("\n");

    return split === -1 ? [] : [[entry.slice(0, split), entry.slice(split + 1)] as TConfigEntry];
  });
}
```


## packages/adapters/repo/git/src/exec/global-config.ts:32 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(entry) => {
    const split = entry.indexOf("\n");

    return split === -1 ? [] : [[entry.slice(0, split), entry.slice(split + 1)] as TConfigEntry];
  }
```


## packages/adapters/repo/git/src/failures/exit-code.ts:3 :: exitCode [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function exitCode(error: unknown): number | undefined {
  if (
    error instanceof EnvdenError &&
    error.cause &&
    typeof error.cause === "object" &&
    "exitCode" in error.cause &&
    typeof error.cause.exitCode === "number"
  )
    return error.cause.exitCode;

  return undefined;
}
```


## packages/adapters/repo/git/src/failures/operation.ts:3 :: repoFailure [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function repoFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("INTERNAL", "Repository operation failed", { cause });
}
```


## packages/adapters/repo/git/src/ignore/ensure-ignored.ts:12 :: ensureIgnored [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/ignore.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function ensureIgnored(checkout: ICheckout, path: string): Promise<void> {
  validatePath(path);

  if (await tracked(checkout, path))
    throw new EnvdenError("INVALID_INPUT", "Refusing a tracked env file");

  if (await isIgnored(checkout, path)) return;

  if (/[\p{Cc}\p{Cf}]/u.test(path)) throw new EnvdenError("INVALID_INPUT", "Unsafe ignore path");

  const exclude = resolve(
    checkout.root,
    (await git(checkout.root, ["rev-parse", "--git-path", "info/exclude"])).trimEnd(),
  );

  const parents = await excludeParents(checkout.gitDir, exclude);

  const escaped = path.replace(/[\\*?[\]#! ]/g, "\\$&");

  const file = await open(
    exclude,
    constants.O_RDWR |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );

  try {
    const stat = await file.stat();

    if (!stat.isFile() || stat.nlink !== 1 || (process.getuid && stat.uid !== process.getuid()))
      throw new EnvdenError("INVALID_INPUT", "Exclude is not a private regular file");

    if ((await realpath(dirname(exclude))) !== dirname(exclude))
      throw new EnvdenError("INVALID_INPUT", "Unsafe exclude parent");

    await verifyExcludeParents(parents);
    const original = await file.readFile("utf8");
    const line = `/${escaped}`;
    const added = !original.split("\n").includes(line);
    const suffix = `\n${line}\n`;
    if (added) await file.writeFile(suffix);

    try {
      if (!(await isIgnored(checkout, path)))
        throw new EnvdenError("INVALID_INPUT", "Could not ignore env file");
    } catch (error) {
      if (added && (await file.stat()).size === stat.size + Buffer.byteLength(suffix))
        await file.truncate(stat.size);

      throw error;
    }
  } finally {
    await file.close();
  }
}
```


## packages/adapters/repo/git/src/ignore/is-ignored.ts:7 :: isIgnored [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/ignore.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function isIgnored(checkout: ICheckout, path: string): Promise<boolean> {
  validatePath(path);
  if (await tracked(checkout, path)) return false;

  try {
    await git(checkout.root, ["check-ignore", "-q", "--", path]);

    return true;
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      error.cause &&
      typeof error.cause === "object" &&
      "exitCode" in error.cause &&
      error.cause.exitCode === 1
    )
      return false;

    throw error;
  }
}
```


## packages/adapters/repo/git/src/ignore/parents.ts:5 :: excludeParents [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/ignore.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function excludeParents(gitDir: string, exclude: string) {
  const common = await realpath(gitDir);
  const parent = relative(common, dirname(exclude));

  if (parent === ".." || parent.startsWith(`..${sep}`) || isAbsolute(parent))
    throw new EnvdenError("INVALID_INPUT", "Exclude path escapes git directory");

  const parents = [];
  let current = common;

  for (const part of ["", ...parent.split(/[\\/]/).filter(Boolean)]) {
    current = join(current, part);

    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
        throw error;
    }

    const stat = await lstat(current);
    parents.push({ path: current, dev: stat.dev, ino: stat.ino });

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe exclude parent");
  }

  return parents;
}
```


## packages/adapters/repo/git/src/ignore/parents.ts:35 :: verifyExcludeParents [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/ignore.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function verifyExcludeParents(parents: Awaited<ReturnType<typeof excludeParents>>) {
  await Promise.all(
    parents.map(async (parent) => {
      if ((await realpath(parent.path)) !== parent.path)
        throw new EnvdenError("CONFLICT", "Exclude parent changed");

      const current = await lstat(parent.path);

      const sameDirectory =
        current.isDirectory() && current.dev === parent.dev && current.ino === parent.ino;

      if (!sameDirectory) throw new EnvdenError("CONFLICT", "Exclude parent changed");
    }),
  );
}
```


## packages/adapters/repo/git/src/ignore/parents.ts:37 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/ignore.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async (parent) => {
      if ((await realpath(parent.path)) !== parent.path)
        throw new EnvdenError("CONFLICT", "Exclude parent changed");

      const current = await lstat(parent.path);

      const sameDirectory =
        current.isDirectory() && current.dev === parent.dev && current.ino === parent.ino;

      if (!sameDirectory) throw new EnvdenError("CONFLICT", "Exclude parent changed");
    }
```


## packages/adapters/repo/git/src/repo-id/normalize.ts:4 :: normalizeRepoId [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/remote.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function normalizeRepoId(remote: string, resolvedHostname?: string): string {
  try {
    return normalize(remote, resolvedHostname);
  } catch (cause) {
    if (cause instanceof EnvdenError) throw cause;
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote", { cause });
  }
}
```


## packages/adapters/repo/git/src/repo-id/normalize.ts:13 :: normalize [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/remote.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function normalize(remote: string, resolvedHostname?: string): string {
  if (/[\p{Cc}\p{Cf}]/u.test(decodeURIComponent(remote)))
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

  const parts = remoteParts(remote.trim());
  const host = (resolvedHostname ?? parts.host).toLowerCase();
  let path = parts.path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (host === "github.com" || host === "gitlab.com") path = path.toLowerCase();

  if (/[\p{Cc}\p{Cf}]/u.test(host + path) || !host || /[\\/\s\0]/.test(host) || unsafePath(path))
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

  return `${host}/${path}`;
}
```


## packages/adapters/repo/git/src/repo-id/normalize.ts:28 :: unsafePath [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/remote.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function unsafePath(path: string) {
  return (
    !path ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\\p{Cc}\p{Cf}]/u.test(path)
  );
}
```


## packages/adapters/repo/git/src/repo-id/normalize.ts:31 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/remote.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(part) => !part || part === "." || part === ".."
```


## packages/adapters/repo/git/src/repo-id/remote-url.ts:5 :: remoteUrl [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/checkout.rs; exec.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function remoteUrl(root: string, name: string): Promise<string> {
  const git = await gitSession(root, await globalConfig("^url\\..*\\.insteadof$"));

  return (await git(["remote", "get-url", name])).trim();
}
```


## packages/adapters/repo/git/src/repo-id/remote.ts:3 :: remoteParts [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/remote.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function remoteParts(remote: string): { host: string; path: string; ssh: boolean } {
  if (remote.includes("://")) {
    if (!/^(ssh|https?|git):\/\//i.test(remote))
      throw new EnvdenError("INVALID_INPUT", "Unsupported git remote");

    if (
      decodeURIComponent(remote)
        .split("/")
        .some((part) => part === ".." || part === ".")
    )
      throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

    const url = new URL(remote);

    if (!url.hostname || url.search || url.hash)
      throw new EnvdenError("INVALID_INPUT", "Unsupported git remote");

    return {
      host: url.hostname,
      path: decodeURIComponent(url.pathname),
      ssh: url.protocol === "ssh:",
    };
  }

  const scp = /^(?:[^@/\s]+@)?(\[[^\]]+\]|[^:/\s]+):(.+)$/.exec(remote);
  if (!scp) throw new EnvdenError("INVALID_INPUT", "A hosted git remote is required");

  return { host: scp[1]!, path: scp[2]!, ssh: true };
}
```


## packages/adapters/repo/git/src/repo-id/remote.ts:11 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/repo/git/src/remote.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(part) => part === ".." || part === "."
```


## packages/adapters/repo/git/src/repo-id/ssh.ts:4 :: resolveSshHost [function_declaration]

DONE

Rust correspondence: `rust/adapters/repo/git/src/remote.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function resolveSshHost(host: string, run = exec): Promise<string> {
  if (host.startsWith("-") || !/^[A-Za-z0-9._-]+$/.test(host))
    throw new EnvdenError("INVALID_INPUT", "Unsafe SSH host");

  const { stdout } = await run("ssh", ["-G", "--", host]);
  const hostname = /^hostname\s+(.+)$/m.exec(stdout)?.[1];
  if (!hostname) throw new EnvdenError("INTERNAL", "SSH hostname resolution failed");

  return hostname.trim();
}
```


## packages/adapters/keychain/file/src/adapter.ts:13 :: createFileKeychainAdapter [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function createFileKeychainAdapter(options: IOptions): IKeychainAdapter {
  const directory = join(options.home, "state", "keys");

  const path = (name: string) =>
    join(directory, `${createHash("sha256").update(name).digest("hex")}.key`);

  const get = async (name: string, required = false) => {
    const value = await readKeyFile(path(name));

    if (value === undefined && required)
      throw new EnvdenError(
        "LOCKED",
        "No vault keys are stored on this device. If it was in the vault before, run envden join",
      );

    return value;
  };

  return {
    id: "file",
    ownerOnly: () => ownerOnly(directory).catch(keychainFailure),
    get: (name, required) => get(name, required).catch(keychainFailure),
    set: (name, value) => writeKeyFile(path(name), value).catch(keychainFailure),
    delete: (name) => removeKeyFile(path(name)).catch(keychainFailure),
  };
}
```


## packages/adapters/keychain/file/src/adapter.ts:16 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(name: string) =>
    join(directory, `${createHash("sha256").update(name).digest("hex")}.key`)
```


## packages/adapters/keychain/file/src/adapter.ts:19 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async (name: string, required = false) => {
    const value = await readKeyFile(path(name));

    if (value === undefined && required)
      throw new EnvdenError(
        "LOCKED",
        "No vault keys are stored on this device. If it was in the vault before, run envden join",
      );

    return value;
  }
```


## packages/adapters/keychain/file/src/adapter.ts:33 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => ownerOnly(directory).catch(keychainFailure)
```


## packages/adapters/keychain/file/src/adapter.ts:34 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(name, required) => get(name, required).catch(keychainFailure)
```


## packages/adapters/keychain/file/src/adapter.ts:35 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(name, value) => writeKeyFile(path(name), value).catch(keychainFailure)
```


## packages/adapters/keychain/file/src/adapter.ts:36 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/adapter.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(name) => removeKeyFile(path(name)).catch(keychainFailure)
```


## packages/adapters/keychain/file/src/failure.ts:3 :: keychainFailure [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function keychainFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("LOCKED", "Key storage operation failed", { cause });
}
```


## packages/adapters/keychain/file/src/files/owner-only.ts:5 :: ownerOnly [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function ownerOnly(directory: string): Promise<boolean> {
  if (process.platform === "win32") return true;

  const entries = await readdir(directory).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });

  if (!entries) return true;

  const paths = [directory, ...entries.map((entry) => join(directory, entry))];
  const modes = await Promise.all(paths.map(async (path) => (await stat(path)).mode));

  return modes.every((mode) => (mode & 0o077) === 0);
}
```


## packages/adapters/keychain/file/src/files/owner-only.ts:8 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
```


## packages/adapters/keychain/file/src/files/owner-only.ts:15 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(entry) => join(directory, entry)
```


## packages/adapters/keychain/file/src/files/owner-only.ts:16 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async (path) => (await stat(path)).mode
```


## packages/adapters/keychain/file/src/files/owner-only.ts:18 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(mode) => (mode & 0o077) === 0
```


## packages/adapters/keychain/file/src/files/source.ts:6 :: readKeyFile [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function readKeyFile(path: string): Promise<Uint8Array | undefined> {
  const file = await open(path, "r").catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });

  if (!file) return undefined;

  try {
    if (process.platform !== "win32" && (await file.stat()).mode & 0o077)
      throw new EnvdenError("INVALID_DATA", "Key file is accessible to other users");

    return new Uint8Array(await file.readFile());
  } finally {
    await file.close();
  }
}
```


## packages/adapters/keychain/file/src/files/source.ts:7 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  }
```


## packages/adapters/keychain/file/src/files/source.ts:24 :: writeKeyFile [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function writeKeyFile(path: string, value: Uint8Array) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await restrictAccess(directory, true);
  const temporary = join(directory, `${crypto.randomUUID()}.tmp`);

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await restrictAccess(temporary);
      await file.writeFile(value);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);
    await syncDirectory(directory);
  } finally {
    await rm(temporary, { force: true });
  }
}
```


## packages/adapters/keychain/file/src/files/source.ts:48 :: removeKeyFile [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function removeKeyFile(path: string) {
  await rm(path, { force: true });

  await syncDirectory(dirname(path)).catch((error: unknown) => {
    if (!missing(error)) throw error;
  });
}
```


## packages/adapters/keychain/file/src/files/source.ts:51 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(error: unknown) => {
    if (!missing(error)) throw error;
  }
```


## packages/adapters/keychain/file/src/files/source.ts:56 :: missing [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
```


## packages/adapters/keychain/file/src/files/source.ts:60 :: syncDirectory [function_declaration]

DONE

Rust correspondence: `rust/adapters/keychain/file/src/files.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function syncDirectory(path: string) {
  if (process.platform === "win32") return;
  const directory = await open(path, "r");

  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
```


## packages/adapters/network/tailscale/src/adapter.ts:23 :: run [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async function run(args: string[]): Promise<ICommandResult> {
  const child = spawnTrusted("tailscale", args, { stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { stdout, stderr, exitCode };
}
```


## packages/adapters/network/tailscale/src/adapter.ts:35 :: unavailable [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function unavailable(kind: INetworkProblem["kind"]): INetworkStatus {
  return {
    ready: false,
    running: false,
    loggedIn: false,
    httpsEnabled: false,
    problem: tailscaleProblem(kind),
  };
}
```


## packages/adapters/network/tailscale/src/adapter.ts:46 :: failure [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function failure(summary: string, stderr: string, cause?: unknown) {
  const detail = stderr.trim().slice(0, STDERR_LIMIT);

  return new EnvdenError("INTERNAL", detail ? `${summary}: ${detail}` : summary, { cause });
}
```


## packages/adapters/network/tailscale/src/adapter.ts:57 :: constructor [method_definition]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
constructor(runner: TRunner = run) {
    this.runner = runner;
  }
```


## packages/adapters/network/tailscale/src/adapter.ts:61 :: status [method_definition]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async status(): Promise<INetworkStatus> {
    const result = await this.runner(["status", "--json"]).catch(() => undefined);
    if (!result) return unavailable("not-installed");

    if (result.exitCode !== 0) return unavailable("not-running");

    try {
      return parseStatus(result.stdout);
    } catch {
      return unavailable("unreadable");
    }
  }
```


## packages/adapters/network/tailscale/src/adapter.ts:62 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
() => undefined
```


## packages/adapters/network/tailscale/src/adapter.ts:74 :: checkHttpsCertificate [method_definition]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async checkHttpsCertificate(): Promise<THttpsCheck> {
    return (await this.status()).problem ?? { kind: "ready" };
  }
```


## packages/adapters/network/tailscale/src/adapter.ts:78 :: command [method_definition]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
private async command(args: string[], summary: string) {
    const result = await this.runner(args).catch((cause: unknown) => {
      throw failure(summary, "", cause);
    });

    if (result.exitCode !== 0) throw failure(summary, result.stderr);

    return result.stdout;
  }
```


## packages/adapters/network/tailscale/src/adapter.ts:79 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(cause: unknown) => {
      throw failure(summary, "", cause);
    }
```


## packages/adapters/network/tailscale/src/adapter.ts:88 :: expose [method_definition]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
async expose(port: number): Promise<string> {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new EnvdenError("INVALID_INPUT", "Invalid port");

    const status = await this.status();

    if (status.problem || !status.hostname)
      throw new EnvdenError("CONFLICT", status.problem?.message ?? "Tailscale is not ready");

    const target = `http://127.0.0.1:${port}`;

    const current = await this.command(
      ["serve", "status", "--json"],
      "Tailscale serve status failed",
    );

    if (serveConflict(current, status.hostname, port, target))
      throw new EnvdenError(
        "CONFLICT",
        `Tailscale already serves something else on port ${port}. See it with tailscale serve status, and remove it with tailscale serve --https=${port} off`,
      );

    await this.command(["serve", "--bg", `--https=${port}`, target], "Tailscale serve failed");

    return `https://${status.hostname}:${port}`;
  }
```


## packages/adapters/network/tailscale/src/adapter.ts:116 :: createTailscaleNetworkAdapter [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/adapter.rs; status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function createTailscaleNetworkAdapter(runner?: TRunner): INetworkAdapter {
  return new TailscaleAdapter(runner);
}
```


## packages/adapters/network/tailscale/src/serve/conflict.ts:14 :: parseServe [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/serve.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function parseServe(stdout: string) {
  try {
    return serveSchema.parse(JSON.parse(stdout.trim() || "{}") ?? {});
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid Tailscale serve status", { cause });
  }
}
```


## packages/adapters/network/tailscale/src/serve/conflict.ts:23 :: serveConflict [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/serve.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function serveConflict(
  stdout: string,
  hostname: string,
  port: number,
  target: string,
): boolean {
  const { TCP: tcp = {}, Web: web = {} } = parseServe(stdout);
  const listener = tcp[String(port)];
  const site = web[`${hostname}:${port}`];
  if (!listener && !site) return false;

  if (listener?.TCPForward || !site) return true;

  const handlers = Object.entries(site.Handlers);

  return !(handlers.length === 1 && handlers[0]![0] === "/" && handlers[0]![1].Proxy === target);
}
```


## packages/adapters/network/tailscale/src/status/parse.ts:12 :: parseStatus [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function parseStatus(stdout: string): INetworkStatus {
  const result = statusSchema.safeParse(JSON.parse(stdout));
  if (!result.success) throw new EnvdenError("INVALID_DATA", "Invalid Tailscale status");

  const { BackendState: state, Self: self, CertDomains: domains } = result.data;
  const running = state === "Running";
  const loggedIn = !["NeedsLogin", "NoState"].includes(state);
  const dns = self?.DNSName.replace(/\.$/, "");
  const httpsEnabled = domains.some((name) => name === dns);
  const problem = statusProblem({ running, loggedIn, httpsEnabled });

  return {
    ready: !problem,
    running,
    loggedIn,
    httpsEnabled,
    hostname: dns,
    ...(problem ? { problem } : {}),
  };
}
```


## packages/adapters/network/tailscale/src/status/parse.ts:20 :: callback [arrow_function]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
(name) => name === dns
```


## packages/adapters/network/tailscale/src/status/problem.ts:12 :: tailscaleProblem [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function tailscaleProblem(kind: INetworkProblem["kind"]): INetworkProblem {
  return { kind, message: messages[kind] };
}
```


## packages/adapters/network/tailscale/src/status/problem.ts:16 :: statusProblem [function_declaration]

DONE

Rust correspondence: `rust/adapters/network/tailscale/src/status.rs`.

Ordered steps and branches, verbatim from the frozen reference:

```ts
function statusProblem(state: {
  running: boolean;
  loggedIn: boolean;
  httpsEnabled: boolean;
}): INetworkProblem | undefined {
  if (!state.loggedIn) return tailscaleProblem("logged-out");

  if (!state.running) return tailscaleProblem("not-running");

  if (!state.httpsEnabled) return tailscaleProblem("https-disabled");

  return undefined;
}
```