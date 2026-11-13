import { closeSync, constants, fstatSync, fsyncSync, readFileSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { EnvdenError } from "@envden/core/errors";
import { checked, cstring, directoryFlags, identity, libc, openAt } from "./libc.ts";

export function openParent(root: string, path: string) {
  let fd = checked(libc!.symbols.open(cstring(root), directoryFlags, 0));

  try {
    for (const part of path.split("/").slice(0, -1)) {
      libc!.symbols.mkdirat(fd, cstring(part), 0o700);
      const next = openAt(fd, part, directoryFlags);
      closeSync(fd);
      fd = next;
    }

    return fd;
  } catch (cause) {
    closeSync(fd);
    throw new EnvdenError("CONFLICT", "Unsafe checkout parent", { cause });
  }
}

export function readAt(fd: number, name: string) {
  const source = openAt(fd, name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    if (!fstatSync(source).isFile())
      throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

    return readFileSync(source);
  } finally {
    closeSync(source);
  }
}

export function writeAt(fd: number, name: string, contents: Uint8Array) {
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

export function linkTarget(fd: number, name: string) {
  const buffer = Buffer.alloc(4096);
  const length = Number(libc!.symbols.readlinkat(fd, cstring(name), buffer, buffer.length));

  return length < 0 ? undefined : buffer.subarray(0, length).toString();
}

export function backupAt(fd: number, name: string, before: Buffer | undefined, store: Uint8Array) {
  if (!before) return;
  const contents = linkTarget(fd, name) === undefined ? readAt(fd, name) : store;
  assertIdentity(fd, name, before);
  writeAt(fd, `.envden-backup-${randomUUID()}`, contents);
}

export function assertIdentity(fd: number, name: string, before: Buffer | undefined) {
  const current = identity(fd, name);

  if (before === undefined ? current !== undefined : !current?.equals(before))
    throw new EnvdenError("CONFLICT", "Placement entry changed");
}
