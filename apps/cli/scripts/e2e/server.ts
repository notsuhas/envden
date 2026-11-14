import { failure } from "./failure.ts";

export interface IServer {
  url: string;
  token: string;
  stop: () => Promise<void>;
}

export async function startServer(
  binary: string,
  dataDir: string,
  env: Record<string, string>,
): Promise<IServer> {
  // oxlint-disable-next-line envden/trusted-process -- E2E serves from the build artifact inside the checkout.
  const child = Bun.spawn([binary, "serve", "--data-dir", dataDir, "--port", "0"], {
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderr = new Response(child.stderr).text();
  const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
  let output = "";

  while (!/listening on \S+/.test(output)) {
    const chunk = await reader.read();

    if (chunk.done) throw failure("envden serve exited early", `${output}\n${await stderr}`);
    output += chunk.value;
  }

  const lines = output.split("\n").map((line) => line.trim());
  const url = /listening on (\S+)/.exec(output)![1]!.replace(/\/$/, "");
  const token = lines.find((line) => line && !line.includes("listening on"));

  if (!token) throw failure("envden serve printed no setup token", output);

  const stop = async () => {
    child.kill();
    await child.exited;
    reader.releaseLock();
  };

  return { url, token, stop };
}
