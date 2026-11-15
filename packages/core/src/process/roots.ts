import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { placeInRoot } from "../paths/inside.ts";

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
  return untrustedRoots.some((root) => placeInRoot(root, path) !== "outside");
}
