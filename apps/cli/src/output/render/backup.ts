import { isAbsolute, relative, sep } from "node:path";
import { homePath } from "../home-path.ts";
import { sanitizeTerminal } from "../sanitize.ts";

interface IExported {
  path: string;
  files: number;
  missing: number;
  passphrase: boolean;
}

export function exportText(result: IExported, userHome: string): string {
  const shown = sanitizeTerminal(homePath(result.path, userHome));
  const identity = result.passphrase ? "" : " -i key.txt";

  return [
    `Exported ${plural(result.files, "env file")} from this device to ${shown}`,
    ...(result.missing ? [`Skipped ${plural(result.missing, "missing file")}`] : []),
    `Open it into this folder without envden, using age or rage${result.passphrase ? "" : " and the key.txt identity for one recipient"}:`,
    `  age -d${identity} ${sanitizeTerminal(shellPath(result.path, userHome))} | tar -xf -`,
  ].join("\n");
}

function shellPath(path: string, userHome: string) {
  const rest = relative(userHome, path);
  const inHome = rest !== "" && rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest);

  return inHome ? `~/${quoted(rest)}` : quoted(path);
}

function quoted(text: string) {
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
