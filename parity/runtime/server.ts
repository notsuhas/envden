import { mkdir } from "node:fs/promises";

export async function server(
  binary: string,
  directory: string,
  env: Record<string, string>,
  restored = false,
  port = "0",
) {
  await mkdir(directory, { recursive: true });
  const child = Bun.spawn(
    [binary, "serve", "--data-dir", directory, "--port", port, ...(restored ? ["--restored"] : [])],
    { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
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
    drain(child.stdout, (s) => {
      stdout += s;
    }),
    drain(child.stderr, (s) => {
      stderr += s;
    }),
  ]);
  void child.exited.then(() => wake());
  const deadline = AbortSignal.timeout(15000);
  try {
    while (!/listening on \S+/.test(stdout)) {
      if (child.exitCode !== null || deadline.aborted)
        throw new Error(`Server failed\n${stdout}\n${stderr}`);
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new Error(`Server deadline\n${stdout}\n${stderr}`));
        wake = () => {
          deadline.removeEventListener("abort", abort);
          resolve();
        };
        deadline.addEventListener("abort", abort, { once: true });
        if (deadline.aborted) abort();
      });
    }
  } catch (error) {
    child.kill();
    await drains;
    throw error;
  }
  const url = /listening on (\S+)/.exec(stdout)?.[1]?.replace(/\/$/, "");
  const token = stdout.split(/\s+/).find((s) => /^[0-9A-HJKMNP-TV-Z]{40,}$/.test(s));
  if (!url) throw new Error("Server omitted URL");

  return {
    url,
    token: token ?? "",
    directory,
    stop: async () => {
      child.kill();
      const code = await child.exited;
      await drains;
      return { stdout, stderr, code };
    },
  };
}
export type TServer = Awaited<ReturnType<typeof server>>;
