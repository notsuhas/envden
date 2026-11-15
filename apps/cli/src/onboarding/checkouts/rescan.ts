import { relative, resolve, sep } from "node:path";
import { sanitizeTerminal } from "../../output/sanitize.ts";

export type TScanCommand = "setup" | "track";

interface IScanRoots {
  scanRoot?: string[];
  excludeRoot?: string[];
}

// join can't be rerun, so a scan without a command repeats as track over the same roots
export function rescanCommand(command: TScanCommand, roots: IScanRoots, home: string) {
  const shown = (paths: string[]) => paths.map((path) => shellPath(resolve(path), home)).join(" ");

  if (command === "track")
    return sanitizeTerminal(`envden track ${shown(roots.scanRoot ?? [home])}`);

  const flags = [
    ...(roots.scanRoot ? [`--scan-root ${shown(roots.scanRoot)}`] : []),
    ...(roots.excludeRoot ? [`--exclude-root ${shown(roots.excludeRoot)}`] : []),
  ];

  return sanitizeTerminal(["envden setup", ...flags].join(" "));
}

function shellPath(path: string, home: string) {
  const rest = relative(home, path);
  if (rest === "") return "~";
  if (rest.startsWith("..") || resolve(home, rest) !== path) return quoted(path);

  return `~/${quoted(rest.split(sep).join("/"))}`;
}

function quoted(text: string) {
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`;
}
