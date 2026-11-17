import { EnvdenError } from "@envden/core/errors";
import { suggestedDeviceName } from "../../identity/name/suggested.ts";
import { deviceNameProblem } from "../../identity/name/rule.ts";
import { input } from "./questions.ts";

export async function askDeviceName(
  name: string | undefined,
  hostname: string,
  interactive = !!process.stdin.isTTY,
) {
  if (name !== undefined) {
    const problem = deviceNameProblem(name);
    if (problem) throw new EnvdenError("INVALID_INPUT", problem);

    return name;
  }

  const suggested = suggestedDeviceName(hostname);

  return interactive ? input("Device name", true, suggested, deviceNameProblem) : suggested;
}
