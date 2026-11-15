import { execTrusted as exec, execTrustedSync as execSync } from "./spawn.ts";
import { chmod } from "node:fs/promises";
import { chmodSync } from "node:fs";
import { userInfo } from "node:os";

export async function restrictAccess(
  path: string,
  directory = false,
  runtime = { platform: process.platform, exec },
): Promise<void> {
  if (runtime.platform === "win32") await runtime.exec("icacls", aclArguments(path, directory));
  else await chmod(path, directory ? 0o700 : 0o600);
}

// for callers that can't await, such as opening the server database
export function restrictAccessSync(
  path: string,
  directory = false,
  runtime = { platform: process.platform, exec: execSync },
): void {
  if (runtime.platform === "win32") runtime.exec("icacls", aclArguments(path, directory));
  else chmodSync(path, directory ? 0o700 : 0o600);
}

function aclArguments(path: string, directory: boolean) {
  return [
    path,
    "/inheritance:r",
    "/grant:r",
    `${userInfo().username}:${directory ? "(OI)(CI)" : ""}F`,
  ];
}
