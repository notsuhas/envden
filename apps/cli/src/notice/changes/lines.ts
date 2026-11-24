import { keyList } from "../../output/key-list.ts";
import type { TChangedFile } from "./details.ts";

export function changedFileLine(file: TChangedFile) {
  const source = file.device ? ` on ${file.device}` : "";

  if (!file.count) return `envden: ${file.label} changed${source}; run envden pull`;

  return `envden: ${file.label} ${keyCount(file.count)} changed${source} (${keyList(file.keys, file.count)}); run envden pull`;
}

export function pulledFileLine(file: TChangedFile) {
  return file.count
    ? `envden: pulled ${file.label} (${keyCount(file.count)})`
    : `envden: pulled ${file.label}`;
}

function keyCount(count: number) {
  return count === 1 ? "1 key" : `${count} keys`;
}
