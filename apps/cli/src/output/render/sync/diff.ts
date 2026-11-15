import { join } from "node:path";
import { sanitizeConsole } from "../../sanitize.ts";
import type { diff } from "../../../sync/diff.ts";

type TDiffFile = Awaited<ReturnType<typeof diff>>[number];

export function diffText(files: TDiffFile[]) {
  const changed = files.filter((file) => file.differs);

  if (!changed.length) return "No changes since the last sync";

  return sanitizeConsole(changed.map(fileText).join("\n\n"));
}

function fileText(file: TDiffFile) {
  const name = join(file.root, file.path);

  if (file.kind === "conflict")
    return `${name}\n  can't compare keys: ${file.reason.replaceAll("-", " ")}`;

  const lines = [
    ...file.added.map((key) => `  + ${key}`),
    ...file.removed.map((key) => `  - ${key}`),
    ...file.changed.map((key) => `  ~ ${key}`),
  ];

  return [name, ...(lines.length ? lines : ["  only comments or formatting changed"])].join("\n");
}
