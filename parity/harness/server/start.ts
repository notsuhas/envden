import type { ReadableStreamDefaultReader } from "node:stream/web";
import type { IResult } from "../types.ts";

async function listening(
  reader: Pick<ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>, "read">,
) {
  let output = "";

  while (!/listening on \S+/.test(output)) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`Server exited: ${output}`);
    output += new TextDecoder().decode(chunk.value);
  }

  return output;
}

async function drain(reader: Pick<ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>, "read">) {
  let output = "";

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return output;
    output += new TextDecoder().decode(chunk.value);
  }
}

export async function start(
  command: string[],
  env: Record<string, string>,
  cwd: string,
  record: IResult,
) {
  const child = Bun.spawn(command, { env, cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const errors = new Response(child.stderr).text();
  const reader = child.stdout.getReader();
  const timer = setTimeout(() => child.kill("SIGKILL"), 60000);

  const output = await listening(reader).catch(async (error: unknown) => {
    child.kill("SIGKILL");
    await child.exited;
    clearTimeout(timer);
    throw new Error(`${String(error)}\n${await errors}`);
  });

  clearTimeout(timer);
  const remaining = drain(reader);
  record.stdout = output;

  const stop = async () => {
    child.kill();
    await child.exited;
    record.stdout = output + (await remaining);
    record.stderr = await errors;
  };

  return {
    url: /listening on (\S+)/.exec(output)![1]!.replace(/\/$/, ""),
    token: output.split(/\s+/).find((word) => /^[0-9A-Z]{40,}$/.test(word)) ?? "",
    stop,
  };
}
