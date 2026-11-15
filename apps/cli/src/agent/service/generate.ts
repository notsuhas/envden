import { EnvdenError } from "@envden/core/errors";

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll(">", "&gt;");
}

function unitPath(value: string) {
  if (/[\r\n\0]/.test(value)) throw new EnvdenError("INVALID_INPUT", "Invalid service path");

  return value.replaceAll("%", "%%");
}

function unit(value: string) {
  return '"' + unitPath(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
}

export function serviceDefinition(
  platform: string,
  executable: string,
  home: string,
  log: string,
  port: number,
) {
  const args = [executable, "serve", "--data-dir", home, "--port", String(port)];

  if (platform === "darwin")
    return {
      kind: "launchd" as const,
      content: `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>com.envden.server</string><key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string></dict></plist>`,
    };

  if (platform === "linux")
    return {
      kind: "systemd" as const,
      content: `[Unit]\nDescription=envden server\n[Service]\nExecStart=${args.map(unit).join(" ")}\nRestart=on-failure\nStandardOutput=append:${unitPath(log)}\nStandardError=append:${unitPath(log)}\n[Install]\nWantedBy=default.target\n`,
    };

  if (platform === "win32") {
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const script = `& ${quote(executable)} serve --data-dir ${quote(home)} --port ${port} *> ${quote(log)}`;

    return {
      kind: "task" as const,
      content: `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy></Settings><Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>-NoProfile -NonInteractive -Command ${xml(script)}</Arguments></Exec></Actions></Task>`,
    };
  }

  throw new EnvdenError("NOT_IMPLEMENTED", "Login services are unsupported on this platform");
}
