import { execTrusted as exec } from "@envden/core/process";
import { chmod } from "node:fs/promises";
import { userInfo } from "node:os";

export async function restrictAccess(path: string, directory = false): Promise<void> {
  if (process.platform === "win32") {
    await exec("icacls", [
      path,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:${directory ? "(OI)(CI)" : ""}F`,
    ]);
  } else await chmod(path, directory ? 0o700 : 0o600);
}
