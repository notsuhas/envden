import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context } from "../context.ts";

export async function hostShims(c: Context, role: string) {
  const d = c.get(role);
  const log = join(d.home, "host-tools.log");
  await writeFile(log, "");
  const quoted = "'" + log.replaceAll("'", "'\\''") + "'";

  for (const tool of [
    "tailscale",
    "launchctl",
    "systemctl",
    "loginctl",
    "schtasks",
    "powershell.exe",
    "open",
    "xdg-open",
  ]) {
    const output =
      tool === "tailscale"
        ? `
if [ "$1" = status ]; then
  echo '{"BackendState":"Running","Self":{"DNSName":"parity.test.ts.net."},"CertDomains":["parity.test.ts.net"]}'
elif [ "$1 $2" = 'serve status' ]; then
  echo '{}'
fi`
        : "";

    await writeFile(
      join(c.root, "bin", tool),
      `#!/bin/sh\nprintf '%s\\n' '${tool}' "$@" >> ${quoted}\n${output}\n`,
      { mode: 0o755 },
    );
  }

  return log;
}
