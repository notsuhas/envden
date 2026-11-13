import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function processStart(pid: number): Promise<string | undefined> {
  try {
    const result =
      process.platform === "win32"
        ? await exec("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`,
          ])
        : await exec("ps", ["-p", String(pid), "-o", "lstart="], {
            env: { ...process.env, LC_ALL: "C" },
          });

    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
