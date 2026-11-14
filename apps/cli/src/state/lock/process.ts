import { execTrusted as exec } from "@envden/core/process";
import { hostname } from "node:os";
import { readlink } from "node:fs/promises";
import { readFile } from "node:fs/promises";

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
    if (platform === "win32") {
      const { windowsStart } = await import("./windows.ts");

      return windowsStart(pid);
    }

    let startedAt: string | undefined;

    if (platform === "linux") {
      startedAt = linuxStart(await read(`/proc/${pid}/stat`));
    } else {
      const result = await exec("ps", ["-p", String(pid), "-o", "lstart="], {
        env: { LC_ALL: "C" },
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

export async function processIdentity(): Promise<string | undefined> {
  if (process.platform !== "linux") return hostname();

  try {
    const boot = await readFile("/proc/sys/kernel/random/boot_id", "utf8");
    const namespace = await readlink("/proc/self/ns/pid");

    return `${hostname()}:${boot.trim()}:${namespace}`;
  } catch {
    return undefined;
  }
}
