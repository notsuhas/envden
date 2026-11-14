import { closeSync, constants, fstatSync } from "node:fs";
import { assertIdentity } from "../native/directory.ts";
import { checked, cstring, identity, libc, openAt } from "../native/libc.ts";

export function pruneAt(fd: number, name: string) {
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
