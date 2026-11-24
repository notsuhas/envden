import { setTimeout } from "node:timers/promises";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import type { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { rejoinIdentity } from "../../admin/rejoin/classify.ts";
import { createClient } from "../../client/request.ts";
import { deviceIdentity, type TDeviceIdentity } from "../../identity/device.ts";
import { runDeviceApprove } from "../../onboarding/approve.ts";
import { joinRequests } from "../approver.ts";
import { finishJoin, requestJoin } from "../joiner.ts";

type TFixture = Awaited<ReturnType<typeof fixture>>;

const tick = () => setTimeout(1);

interface IApproval {
  joiner: TAdapters;
  name?: string;
  rejoin?: boolean;
  joinerSays?: boolean;
  approverSays?: (question: string) => Promise<boolean>;
  approver?: TAdapters;
}

// Runs both screens of a word approval against the fixture's server, recording what each showed.
export async function wordApproval(f: TFixture, options: IApproval) {
  const words = { joiner: "", approver: "" };
  const name = options.name ?? "second";
  const pin = p.unbase32(p.base32(Buffer.from(f.result.state.server!.pin, "base64url")));

  const identity: TDeviceIdentity = options.rejoin
    ? await rejoinIdentity(options.joiner, name)
    : await deviceIdentity(options.joiner.keychain, options.joiner.home, name, true);

  const client = createClient({
    address: f.result.address,
    pin,
    vaultId: new Uint8Array(32),
    identity,
    version: "0.0.0",
    now: f.now,
    fetcher: f.fetcher,
  });

  const requested = requestJoin(options.joiner, client, identity, pin, f.now, {
    confirm: async () => options.joinerSays ?? true,
    report: (message) => {
      if (message.startsWith("Words: ")) words.joiner = message.slice(7);
    },
    pause: tick,
  });

  const approver = options.approver ?? f.first;
  const member = await memberClient(f, approver);
  while (!(await joinRequests(member)).length) await tick();

  const approved = runDeviceApprove(approver, f.now, undefined, {
    confirm: async (question) => {
      words.approver = /Words: (.*)\. Do they/.exec(question)?.[1] ?? "";

      return options.approverSays ? options.approverSays(question) : true;
    },
    report: () => {},
    choose: async () => {
      throw new Error("Only one device should be waiting");
    },
    pause: tick,
  });

  const [joined, approval] = await Promise.allSettled([requested, approved]);

  const finish = () => {
    if (joined.status === "rejected") throw joined.reason;

    return finishJoin(
      options.joiner,
      client.forVault(p.unbase32(joined.value.vaultId)),
      identity,
      f.result.address,
      joined.value,
      {
        now: f.now,
        ...(options.rejoin ? { rejoin: true } : {}),
        pause: tick,
      },
    );
  };

  return { words, joined, approval, finish, identity };
}

async function memberClient(f: TFixture, adapters: TAdapters) {
  const { adminContext } = await import("../../admin/shared/context.ts");

  return (await adminContext(adapters, f.now)).client;
}
