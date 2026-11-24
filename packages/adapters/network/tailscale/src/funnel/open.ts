import { setTimeout as delay } from "node:timers/promises";
import { EnvdenError } from "@envden/core/errors";
import type { INetworkStatus, IPublicShare } from "@envden/core/adapters";
import { accessError } from "./access.ts";
import { funnelArgs, funnelUp, spawnFunnel, type TFunnelSpawn } from "./child.ts";
import { lookupPublic, publicName, type TLookup, type TPause } from "./public-name.ts";
import { failure } from "../command/failure.ts";
import { funnelPort } from "./port.ts";

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

  const choice = funnelPort(stdout, await inputs.serveStatus());
  if (choice.kind === "denied") throw accessError(choice.access);

  if (choice.kind === "taken")
    throw new EnvdenError(
      "INVALID_INPUT",
      `Tailscale already serves something on every port Funnel allows this device (${choice.ports.join(", ")}). envden send needs one of them free while a link is open; see tailscale serve status`,
    );

  return publish(inputs.effects, status.hostname, choice.port, port, path);
}

function publish(
  effects: Partial<IFunnelEffects> = {},
  host: string,
  funnel: number,
  port: number,
  path: string,
): IPublicShare {
  const { spawn = spawnFunnel, lookup = lookupPublic, pause = sleep } = effects;
  const child = spawn(funnelArgs(funnel, port, path));
  const closing = new AbortController();
  let closed = false;
  void child.exited.then(() => closing.abort());

  // Only close() or the funnel exiting aborts the DNS wait.
  const name = () =>
    publicName(host, lookup, pause, closing.signal).catch((cause: unknown) => {
      throw closed ? cause : failure("Tailscale Funnel stopped", "");
    });

  return {
    url: `https://${host}${funnel === 443 ? "" : `:${funnel}`}${path}`,
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
