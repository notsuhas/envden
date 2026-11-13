import { EnvdenError } from "@envden/core/errors";
import { execTrusted as exec } from "@envden/core/process";

export async function resolveSshHost(host: string, run = exec): Promise<string> {
  if (host.startsWith("-") || !/^[A-Za-z0-9._-]+$/.test(host))
    throw new EnvdenError("INVALID_INPUT", "Unsafe SSH host");

  const { stdout } = await run("ssh", ["-G", "--", host]);
  const hostname = /^hostname\s+(.+)$/m.exec(stdout)?.[1];
  if (!hostname) throw new EnvdenError("INTERNAL", "SSH hostname resolution failed");

  return hostname.trim();
}
