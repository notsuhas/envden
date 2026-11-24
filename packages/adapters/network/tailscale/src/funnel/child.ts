import { spawnTrusted } from "@envden/core/process";
import { failure } from "../command/failure.ts";

export interface IFunnelChild {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(): void;
}

export type TFunnelSpawn = (args: string[]) => IFunnelChild;

// What `tailscale funnel` prints in the foreground once the address is public.
const UP = "Available on the internet:";

// Foreground mode: the funnel lasts only as long as this child.
export function funnelArgs(funnelPort: number, port: number, path: string): string[] {
  return [
    "funnel",
    `--https=${funnelPort}`,
    `--set-path=${path}`,
    `http://127.0.0.1:${port}${path}`,
  ];
}

export function spawnFunnel(args: string[]): IFunnelChild {
  const child = spawnTrusted("tailscale", args, { stdout: "pipe", stderr: "pipe" });

  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exited: child.exited,
    kill: () => child.kill("SIGTERM"),
  };
}

// Keeps reading after the marker: a closed pipe would stop the funnel at its next write.
export function funnelUp(child: IFunnelChild): Promise<void> {
  const stderr = new Response(child.stderr).text();

  return new Promise((resolve, reject) => {
    let recent = "";

    drain(child.stdout, (text) => {
      const joined = recent + text;
      if (joined.includes(UP)) resolve();
      recent = joined.slice(-UP.length);
    }).then(async () => {
      await child.exited;
      reject(failure("Tailscale Funnel stopped", await stderr));
    }, reject);
  });
}

async function drain(stream: ReadableStream<Uint8Array>, read: (text: string) => void) {
  const decoder = new TextDecoder();

  for await (const chunk of stream) read(decoder.decode(chunk, { stream: true }));
}
