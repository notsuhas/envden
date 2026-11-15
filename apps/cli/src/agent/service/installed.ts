import { readFile } from "node:fs/promises";
import { serviceFile } from "./location.ts";
import { installedPort } from "./port.ts";

// the port of the installed login service, or undefined when there's none
export async function installedServicePort(platform: string, userHome: string, home: string) {
  const path = serviceFile(platform, userHome, home);
  const bytes = path ? await readFile(path).catch(() => undefined) : undefined;

  return bytes && installedPort(serviceText(bytes, platform));
}

// Windows task definitions are written as UTF-16LE, without a byte order mark
function serviceText(bytes: Buffer, platform: string) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");

  return bytes.toString(platform === "win32" ? "utf16le" : "utf8");
}
