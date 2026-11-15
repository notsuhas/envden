import { execTrusted as exec } from "./spawn.ts";
import { chmod } from "node:fs/promises";
import { userInfo } from "node:os";

export async function restrictAccess(
  path: string,
  directory = false,
  runtime = { platform: process.platform, exec },
): Promise<void> {
  if (runtime.platform === "win32") {
    await runtime.exec("icacls", [
      path,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:${directory ? "(OI)(CI)" : ""}F`,
    ]);
  } else await chmod(path, directory ? 0o700 : 0o600);
}
