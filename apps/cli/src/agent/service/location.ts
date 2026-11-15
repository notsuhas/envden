import { join } from "node:path";

export function serviceFile(platform: string, userHome: string, home: string) {
  if (platform === "darwin")
    return join(userHome, "Library", "LaunchAgents", "com.envden.server.plist");

  if (platform === "linux") return join(userHome, ".config", "systemd", "user", "envden.service");

  return platform === "win32" ? join(home, "envden-task.xml") : undefined;
}
