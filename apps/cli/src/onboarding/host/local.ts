import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { consent } from "../../output/prompts/questions.ts";

interface IHostOptions {
  server?: string;
  setupToken?: string;
  hostServer?: boolean;
}

export async function hostLocally(adapters: TAdapters, options: IHostOptions) {
  const https = await adapters.network.checkHttpsCertificate();
  if (https.kind !== "ready") throw new EnvdenError("INVALID_INPUT", https.message);

  const host =
    options.hostServer ||
    (!options.server &&
      process.stdin.isTTY &&
      (await consent("Host the server on this machine? An always-on host is recommended.")));

  if (!host) return undefined;

  const token = options.setupToken === undefined ? await adapters.localSetupToken() : undefined;
  const port = await adapters.serverPort();
  await adapters.hostServer(port);
  console.log("Server installed on this machine");

  return { address: await adapters.network.expose(port), token };
}
