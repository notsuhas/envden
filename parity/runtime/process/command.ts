import { output } from "./output.ts";
import type { IOutput, IProcess } from "./types.ts";

const DEADLINE = 30000;

export async function command(options: IProcess): Promise<IOutput> {
  const child = Bun.spawn(options.argv, {
    env: options.env,
    cwd: options.cwd,
    stdin: options.input === undefined ? "ignore" : new Response(options.input),
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => child.kill("SIGKILL"), DEADLINE);

  try {
    return await output(child);
  } finally {
    clearTimeout(timer);
  }
}
