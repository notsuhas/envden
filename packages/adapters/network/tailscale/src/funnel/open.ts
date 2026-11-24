import { setTimeout as delay } from "node:timers/promises";
import { EnvdenError } from "@envden/core/errors";
import type { INetworkStatus, IPublicShare } from "@envden/core/adapters";
import { portTaken } from "../serve/taken.ts";
import { accessError, funnelAccess } from "./access.ts";
import { funnelArgs, funnelUp, spawnFunnel, type TFunnelSpawn } from "./child.ts";
import { lookupPublic, publicName, type TLookup, type TPause } from "./public-name.ts";
import { failure } from "../command/failure.ts";

export interface IFunnelEffects {
  spawn: TFunnelSpawn;
  lookup: TLookup;
  pause: TPause;
}

interface IFunnelInputs {
  status: () => Promise<{ status: INetworkStatus; stdout: string }>;
  serveStatus: () => Promise<string>;
  effects?: Partial<IFunnelEffects>;
}

// The least used of the three ports Funnel allows.
const FUNNEL_PORT = 10000;

const SHARE_PATH = /^(\/[A-Za-z0-9_-]+)+$/;

export async function openFunnel(
  inputs: IFunnelInputs,
  port: number,
  path: string,
): Promise<IPublicShare> {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new EnvdenError("INVALID_INPUT", "Invalid port");

  if (!SHARE_PATH.test(path)) throw new EnvdenError("INVALID_INPUT", "Invalid share path");

  const { status, stdout } = await inputs.status();

  if (status.problem || !status.hostname)
    throw new EnvdenError("INVALID_INPUT", status.problem?.message ?? "Tailscale is not ready");

  const access = funnelAccess(stdout, FUNNEL_PORT);
  if (access !== "allowed") throw accessError(access, FUNNEL_PORT);

  if (portTaken(await inputs.serveStatus(), FUNNEL_PORT))
    throw new EnvdenError(
      "INVALID_INPUT",
      `Tailscale already serves something on port ${FUNNEL_PORT}, which envden send needs while a link is open. See it with tailscale serve status`,
    );

  return publish(inputs.effects, status.hostname, port, path);
}

function publish(
  effects: Partial<IFunnelEffects> = {},
  host: string,
  port: number,
  path: string,
): IPublicShare {
  const { spawn = spawnFunnel, lookup = lookupPublic, pause = sleep } = effects;
  const child = spawn(funnelArgs(FUNNEL_PORT, port, path));
  const closing = new AbortController();
  let closed = false;
  void child.exited.then(() => closing.abort());

  // Only close() or the funnel exiting aborts the DNS wait.
  const name = () =>
    publicName(host, lookup, pause, closing.signal).catch((cause: unknown) => {
      throw closed ? cause : failure("Tailscale Funnel stopped", "");
    });

  return {
    url: `https://${host}:${FUNNEL_PORT}${path}`,
    ready: funnelUp(child).then(name),
    ended: child.exited.then(() => undefined),
    close: async () => {
      closed = true;
      closing.abort();
      child.kill();
      await child.exited;
    },
  };
}

async function sleep(ms: number, signal: AbortSignal) {
  await delay(ms, undefined, { signal });
}
