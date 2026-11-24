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

let bootForProcess: string | undefined;

export async function processIdentity(): Promise<string | undefined> {
  try {
    let boot = bootForProcess;
    let namespace = "";

    if (process.platform === "linux") {
      boot ??= (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
      namespace = await readlink("/proc/self/ns/pid");
    } else if (process.platform === "darwin" && !boot) {
      boot = (await exec("sysctl", ["-n", "kern.boottime"])).stdout
        .match(/sec\s*=\s*(\d+),\s*usec\s*=\s*(\d+)/)
        ?.slice(1)
        .join(":");
    }

    if (!boot) return undefined;

    bootForProcess = boot;

    return JSON.stringify({ host: hostname(), boot, namespace });
  } catch {
    return undefined;
  }
}
