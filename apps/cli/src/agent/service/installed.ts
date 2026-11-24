import { readFile } from "node:fs/promises";
import { serviceFile } from "./location.ts";
import { installedPort } from "./port.ts";

// the port of the installed login service, or undefined when there's none
export async function installedServicePort(platform: string, userHome: string) {
  const path = serviceFile(platform, userHome);
  const text = path ? await readFile(path, "utf8").catch(() => undefined) : undefined;

  return text === undefined ? undefined : installedPort(text);
}
