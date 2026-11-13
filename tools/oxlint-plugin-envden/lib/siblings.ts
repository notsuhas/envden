import { readdirSync } from "node:fs";
import { dirname } from "node:path";

export function sourceSiblings(filename: string) {
  return readdirSync(dirname(filename), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.[cm]?[jt]sx?$/u.test(entry.name) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name) &&
        !/^index\.[cm]?[jt]sx?$/u.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
}
