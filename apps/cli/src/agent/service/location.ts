import { join } from "node:path";

export function serviceFile(platform: string, userHome: string) {
  if (platform === "darwin")
    return join(userHome, "Library", "LaunchAgents", "com.envden.server.plist");

  return platform === "linux"
    ? join(userHome, ".config", "systemd", "user", "envden.service")
    : undefined;
}
