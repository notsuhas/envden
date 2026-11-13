import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

let untrustedRoots: string[] = [];

export function setUntrustedRoots(roots: readonly string[]): void {
  untrustedRoots = [
    ...new Set(
      roots.flatMap((root) => {
        const absolute = resolve(root);

        try {
          return [absolute, realpathSync(absolute)];
        } catch {
          return [absolute];
        }
      }),
    ),
  ];
}

export function insideUntrustedRoot(path: string): boolean {
  return untrustedRoots.some((root) => {
    const rel = relative(root, path);

    return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
  });
}
