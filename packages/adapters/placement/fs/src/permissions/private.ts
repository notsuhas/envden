import { execTrusted as exec } from "@envden/core/process";
import { chmod } from "node:fs/promises";
import { userInfo } from "node:os";

export async function privateFile(path: string): Promise<void> {
  if (process.platform === "win32") {
    await exec("icacls", [path, "/inheritance:r", "/grant:r", `${userInfo().username}:F`]);
  } else await chmod(path, 0o600);
}
