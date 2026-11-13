import { join } from "node:path";
import { optionalRead } from "../../state/files.ts";
import { runServiceCommand } from "./install.ts";

export async function restartHostService(
  userHome: string,
  home: string,
  platform = process.platform,
  run = runServiceCommand,
  uid = process.getuid?.() ?? 0,
) {
  if (platform === "darwin") {
    if (await optionalRead(join(userHome, "Library", "LaunchAgents", "com.envden.server.plist")))
      await run(["launchctl", "kickstart", "-k", `gui/${uid}/com.envden.server`]);
  } else if (platform === "linux") {
    if (await optionalRead(join(userHome, ".config", "systemd", "user", "envden.service")))
      await run(["systemctl", "--user", "restart", "envden.service"]);
  } else if (platform === "win32" && (await optionalRead(join(home, "envden-task.xml")))) {
    await run(["schtasks", "/End", "/TN", "envden"]).catch(() => {});
    await run(["schtasks", "/Run", "/TN", "envden"]);
  }
}
