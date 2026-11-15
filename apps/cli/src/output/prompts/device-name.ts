import { suggestedDeviceName } from "../../identity/name/suggested.ts";
import { input } from "./questions.ts";

export async function askDeviceName(
  name: string | undefined,
  hostname: string,
  interactive = !!process.stdin.isTTY,
) {
  if (name !== undefined) return name;

  const suggested = suggestedDeviceName(hostname);

  return interactive ? input("Device name", true, suggested) : suggested;
}
