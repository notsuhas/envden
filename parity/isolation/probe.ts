import { existsSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { deriveIsolation, type IIsolation, type ITailscaleCandidate } from "./tailscale.ts";

const STAND_IN_MARKER = "envden-parity-stand-in";

const SANDBOX = "/usr/bin/sandbox-exec";

// Mirrors fixedDirectories in packages/core/src/process/directories.ts.
function trustedDirectories(platform: NodeJS.Platform): string[] {
  const system = ["/usr/bin", "/bin", "/usr/sbin", "/sbin", "/usr/local/bin"];

  return platform === "darwin"
    ? [...system, "/opt/homebrew/bin", "/Applications/Tailscale.app/Contents/MacOS"]
    : [...system, "/home/linuxbrew/.linuxbrew/bin", "/snap/bin"];
}

function candidatePaths(platform: NodeJS.Platform): string[] {
  const names = platform === "darwin" ? ["tailscale", "Tailscale"] : ["tailscale"];
  const paths = trustedDirectories(platform).flatMap((dir) => names.map((name) => join(dir, name)));

  return platform === "darwin" ? [...paths, "/Applications/Tailscale.app"] : paths;
}

async function classify(path: string): Promise<ITailscaleCandidate> {
  let file;

  try {
    file = await open(path, "r");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { path };

    return { path, binary: "real" };
  }

  try {
    if ((await file.stat()).isDirectory()) return { path, binary: "real" };

    const { buffer, bytesRead } = await file.read(Buffer.alloc(4096), 0, 4096, 0);
    const head = buffer.subarray(0, bytesRead).toString("latin1");

    return { path, binary: head.includes(STAND_IN_MARKER) ? "stand-in" : "real" };
  } finally {
    await file.close();
  }
}

export async function probeIsolation(platform = process.platform): Promise<IIsolation> {
  const candidates = await Promise.all(candidatePaths(platform).map(classify));

  return deriveIsolation({ platform, sandbox: existsSync(SANDBOX), candidates });
}

export function isolate(argv: string[], isolation: IIsolation): string[] {
  if (!isolation.deny?.length) return argv;

  const filters = isolation.deny.map((path) => `(subpath ${JSON.stringify(path)})`).join(" ");

  // Setuid ps cannot start inside a sandbox; it runs outside it and never starts tailscale.
  const ps = '(allow process-exec (literal "/bin/ps") (with no-sandbox))';

  return [SANDBOX, "-p", `(version 1)(allow default)${ps}(deny process-exec ${filters})`, ...argv];
}
