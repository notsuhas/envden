import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

type TProcess = { kind: "live"; startedAt: string } | { kind: "dead" | "unknown" };

export function linuxStart(stat: string): string | undefined {
  const fields = stat
    .slice(stat.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);

  return /^\d+$/.test(fields[19] ?? "") ? fields[19] : undefined;
}

export async function processStart(
  pid: number,
  platform = process.platform,
  read = (path: string) => readFile(path, "utf8"),
): Promise<TProcess> {
  try {
    let startedAt: string | undefined;

    if (platform === "linux") {
      startedAt = linuxStart(await read(`/proc/${pid}/stat`));
    } else {
      const result =
        platform === "win32"
          ? await exec("powershell.exe", [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
            ])
          : await exec("ps", ["-p", String(pid), "-o", "lstart="], {
              env: { ...process.env, LC_ALL: "C" },
            });

      startedAt = result.stdout.trim();
    }

    if (startedAt) return { kind: "live", startedAt };
  } catch {
    // Only a kernel liveness check can prove the process is gone.
  }

  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH")
      return { kind: "dead" };
  }

  return { kind: "unknown" };
}
