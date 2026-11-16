import { mkdir } from "node:fs/promises";

const STARTUP = 15000;

interface IServe {
  argv: (args: string[]) => string[];
  directory: string;
  env: Record<string, string>;
  restored: boolean;
  port: string;
}

function serveArgs(options: IServe): string[] {
  const args = ["serve", "--data-dir", options.directory, "--port", options.port];

  return options.restored ? [...args, "--restored"] : args;
}

// The address and setup token `serve` prints once it listens.
function listening(stdout: string) {
  const url = /listening on (\S+)/.exec(stdout)?.[1]?.replace(/\/$/, "");
  const token = stdout.split(/\s+/).find((s) => /^[0-9A-HJKMNP-TV-Z]{40,}$/.test(s));
  if (!url) throw new Error("Server omitted URL");

  return { url, token: token ?? "" };
}

export async function server(options: IServe) {
  await mkdir(options.directory, { recursive: true });

  const child = Bun.spawn(options.argv(serveArgs(options)), {
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  let stdout = "";
  let stderr = "";
  let wake = () => {};

  const drain = async (stream: ReadableStream<Uint8Array>, append: (s: string) => void) => {
    const decoder = new TextDecoder();

    for await (const chunk of stream) {
      append(decoder.decode(chunk, { stream: true }));
      wake();
    }
  };

  const drains = Promise.all([
    drain(child.stdout, (s) => (stdout += s)),
    drain(child.stderr, (s) => (stderr += s)),
  ]);

  void child.exited.then(() => wake());

  try {
    await ready(
      child,
      () => `${stdout}\n${stderr}`,
      (listener) => (wake = listener),
    );
  } catch (error) {
    child.kill();
    await drains;
    throw error;
  }

  return {
    ...listening(stdout),
    directory: options.directory,
    stop: async () => {
      child.kill();
      const code = await child.exited;
      await drains;

      return { stdout, stderr, code };
    },
  };
}

export type TServer = Awaited<ReturnType<typeof server>>;

async function ready(
  child: Bun.Subprocess,
  output: () => string,
  setWake: (listener: () => void) => void,
): Promise<void> {
  const deadline = AbortSignal.timeout(STARTUP);

  while (!/listening on \S+/.test(output())) {
    if (child.exitCode !== null || deadline.aborted) throw new Error(`Server failed\n${output()}`);

    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(new Error(`Server deadline\n${output()}`));

      setWake(() => {
        deadline.removeEventListener("abort", abort);
        resolve();
      });

      deadline.addEventListener("abort", abort, { once: true });
      if (deadline.aborted) abort();
    });
  }
}
