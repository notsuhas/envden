import { EnvdenError } from "@envden/core/errors";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function resolveSshHost(host: string): Promise<string> {
  const { stdout } = await exec("ssh", ["-G", "--", host]);
  const hostname = /^hostname\s+(.+)$/m.exec(stdout)?.[1];
  if (!hostname) throw new EnvdenError("INTERNAL", "SSH hostname resolution failed");

  return hostname.trim();
}
