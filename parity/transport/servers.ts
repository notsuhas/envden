import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import * as p from "@envden/core/protocol";
import { isolate } from "../isolation/probe.ts";
import type { IIsolation } from "../isolation/tailscale.ts";

const identity = z.object({ publicKey: z.string() });

interface IStart {
  binary: string;
  directory: string;
  isolation: IIsolation;
  token?: string;
}

function portIn(output: string): number | undefined {
  const address = /listening on (http:\/\/\S+)/.exec(output)?.[1];

  return address ? Number(new URL(address).port) : undefined;
}

async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">): Promise<number> {
  const reader = child.stdout.getReader();
  let output = "";
  let port = portIn(output);

  while (port === undefined) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`serve exited early: ${await new Response(child.stderr).text()}`);

    output += new TextDecoder().decode(value);
    port = portIn(output);
  }

  reader.releaseLock();

  return port;
}

async function start(options: IStart) {
  const { directory } = options;

  await mkdir(join(directory, "home"), { recursive: true });

  const argv = [options.binary, "serve", "--data-dir", join(directory, "data"), "--port", "0"];

  const child = Bun.spawn(isolate([...argv, "--min-client", "1.0.0"], options.isolation), {
    env: {
      PATH: process.env.PATH ?? "",
      HOME: join(directory, "home"),
      ENVDEN_HOME: join(directory, "client"),
      XDG_CONFIG_HOME: join(directory, "config"),
      TMPDIR: directory,
      ENVDEN_SETUP_TOKEN: options.token ?? "",
      ENVDEN_NO_UPDATE_CHECK: "1",
      ENVDEN_TELEMETRY: "0",
      ENVDEN_NO_REPORT: "1",
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const port = await listening(child);

  return {
    port,
    stop: async () => {
      child.kill("SIGTERM");
      await child.exited;
    },
  };
}

// Both servers share one identity and setup token, so one signed request is valid on either.
export async function startPair(binaries: [string, string], root: string, isolation: IIsolation) {
  const [reference, candidate] = binaries.map((_, i) => join(root, String(i)));
  const seed = await start({ binary: binaries[0], directory: reference!, isolation });

  await seed.stop();
  await mkdir(join(candidate!, "data"), { recursive: true });
  await copyFile(join(reference!, "data/identity.json"), join(candidate!, "data/identity.json"));

  const saved = identity.parse(
    JSON.parse(await readFile(join(reference!, "data/identity.json"), "utf8")),
  );

  const pin = p.serverPin(Buffer.from(saved.publicKey, "base64url"));
  const secret = p.randomBytes(20);
  const token = p.encodeToken("setup", secret, pin);

  const servers = await Promise.all(
    binaries.map((binary, i) =>
      start({ binary, directory: [reference!, candidate!][i]!, isolation, token }),
    ),
  );

  return {
    ports: servers.map((server) => server.port) as [number, number],
    credentials: { pin, secret, keys: p.generateDeviceKeys() },
    stop: () => Promise.all(servers.map((server) => server.stop())),
  };
}
