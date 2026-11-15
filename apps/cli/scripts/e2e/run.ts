import { spawnTrusted } from "@envden/core/process";
import { failure } from "./failure.ts";

async function finished(
  label: string,
  child: { stdout: ReadableStream; stderr: ReadableStream; exited: Promise<number> },
): Promise<string> {
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (code !== 0) throw failure(`${label}: exited ${code}`, `${stdout}\n${stderr}`);

  return stdout;
}

export async function attempt(
  command: string[],
  env: Record<string, string>,
  cwd?: string,
): Promise<{ code: number; output: string }> {
  // oxlint-disable-next-line envden/trusted-process -- E2E executes the build artifact inside the checkout.
  const child = Bun.spawn(command, {
    env,
    ...(cwd ? { cwd } : {}),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { code, output: `${stdout}${stderr}` };
}

export function run(
  label: string,
  command: string[],
  env: Record<string, string>,
  cwd?: string,
): Promise<string> {
  // oxlint-disable-next-line envden/trusted-process -- E2E executes the build artifact inside the checkout.
  const child = Bun.spawn(command, {
    env,
    ...(cwd ? { cwd } : {}),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  return finished(label, child);
}

export async function git(cwd: string, args: string[], home: string): Promise<void> {
  await finished(`git ${args.join(" ")}`, spawnTrusted("git", args, { cwd, env: { HOME: home } }));
}
