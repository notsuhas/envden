import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { text } from "../../client/encoding.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { recoveryHolders } from "./recovery-holders.ts";

export async function listDevices(adapters: TAdapters, now: () => number, fetcher: TFetch = fetch) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const holders = recoveryHolders(history);

  const seen = p.DevicesResponseSchema.parse(
    await (await context.client.request("/v1/devices")).json(),
  ).devices;

  return [...history.state.devices.values()].map((device) => ({
    id: p.base32(device.id),
    name: device.name,
    clientVersion: seen.find((item) => item.id === text(device.id))?.clientVersion ?? null,
    unconfirmed: !seen.find((item) => item.id === text(device.id))?.confirmed,
    recoveryKeyHeld: holders.has(p.base32(device.id)),
    current: p.equal(device.id, context.identity.record.id),
  }));
}
