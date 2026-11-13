import { spawnTrusted } from "@envden/core/process";

export async function command(name: string, args: string[], cwd: string, diff = false) {
  const child = spawnTrusted(name, args, { cwd });

  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (status !== 0 && !(diff && status === 1)) {
    throw new Error(`${name} ${args.join(" ")} failed (${status}): ${stderr.trim()}`);
  }

  return stdout;
}
