import { constants } from "node:fs";
import { EnvdenError } from "@envden/core/errors";

async function loadFfi() {
  try {
    return await import("bun:ffi");
  } catch {
    return undefined;
  }
}

const ffi = await loadFfi();

const paddedOpen = process.platform === "darwin" && process.arch === "arm64";

const definitions = {
  open: { args: ["ptr", "i32", "u32"], returns: "i32" },
  openat: { args: ["i32", "ptr", "i32", "u32", "u32", "u32", "u32", "u32", "u32"], returns: "i32" },
  mkdirat: { args: ["i32", "ptr", "u32"], returns: "i32" },
  renameat: { args: ["i32", "ptr", "i32", "ptr"], returns: "i32" },
  symlinkat: { args: ["ptr", "i32", "ptr"], returns: "i32" },
  readlinkat: { args: ["i32", "ptr", "ptr", "u64"], returns: "i64" },
  unlinkat: { args: ["i32", "ptr", "i32"], returns: "i32" },
} as const;

const libraryPaths: Partial<Record<typeof process.platform, string[]>> = {
  darwin: ["/usr/lib/libSystem.B.dylib"],
  linux: [
    "libc.so.6",
    "libc.so",
    `/lib/ld-musl-${process.arch === "arm64" ? "aarch64" : "x86_64"}.so.1`,
  ],
};

function loadLibc() {
  const candidates = libraryPaths[process.platform];
  if (!ffi || !candidates || !["arm64", "x64"].includes(process.arch)) return undefined;

  for (const path of candidates) {
    try {
      return bindLibc(path);
    } catch {
      // FFI is optional; unsupported runtimes retain the checked JS path.
    }
  }

  return undefined;
}

function bindLibc(path: string) {
  const library = ffi!.dlopen(path, definitions);

  const statName =
    process.platform === "darwin" && process.arch === "x64" ? "fstatat$INODE64" : "fstatat";

  const statLibrary = ffi!.dlopen(path, {
    [statName]: { args: ["i32", "ptr", "ptr", "i32"], returns: "i32" },
  });

  const errorName = process.platform === "darwin" ? "__error" : "__errno_location";
  const errorLibrary = ffi!.dlopen(path, { [errorName]: { args: [], returns: "ptr" } });
  const errno = errorLibrary.symbols[errorName]!;

  return {
    symbols: library.symbols,
    fstatat: statLibrary.symbols[statName]!,
    handles: [library, statLibrary, errorLibrary],
    errno: () => new Int32Array(ffi!.toArrayBuffer(errno!()!, 0, 4))[0],
  };
}

export const libc = loadLibc();

export const directoryFlags =
  constants.O_RDONLY |
  constants.O_DIRECTORY |
  constants.O_NOFOLLOW |
  (process.platform === "darwin" ? 0x01000000 : 0x80000);

export function cstring(value: string) {
  return Buffer.from(`${value}\0`);
}

export function checked(result: number) {
  if (result < 0) throw new EnvdenError("CONFLICT", "Descriptor-relative operation failed");

  return result;
}

export function identity(fd: number, name: string) {
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

export function openAt(fd: number, name: string, flags: number, mode = 0) {
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
