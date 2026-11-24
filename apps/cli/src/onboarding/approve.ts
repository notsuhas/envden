import { resumeApproval } from "../approval/persistence/submission.ts";
import {
  approveJoin,
  joinRequests,
  type IApproverInteraction,
  type TJoinRequest,
} from "../approval/approver.ts";
import { pickRequest } from "../approval/pick.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { requireConfigured } from "../state/configured.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/store/repository.ts";
import { deviceIdentity } from "../identity/device.ts";
import { createClient } from "../client/request.ts";
import { binary } from "../client/encoding.ts";
import { choose, consent } from "../output/prompts/questions.ts";
import { sanitizeConsole } from "../output/sanitize.ts";
import { approvalText, noRequestText } from "../output/render/devices/devices.ts";
import { VERSION } from "../version.ts";

interface IApproveInteraction extends IApproverInteraction {
  choose: (requests: { number: number; name: string }[]) => Promise<number>;
}

const terminal: IApproveInteraction = {
  confirm: (message) => consent(message),
  report: (message) => console.log(sanitizeConsole(message)),
  choose: async (requests) =>
    Number(
      await choose(
        "Which device?",
        requests.map((request) => ({ value: String(request.number), label: request.name })),
      ),
    ),
};

export async function runDeviceApprove(
  adapters: TAdapters,
  now: () => number,
  number?: number,
  interaction: IApproveInteraction = terminal,
) {
  const state = requireConfigured(await loadState(adapters.home));
  const identity = await deviceIdentity(adapters.keychain, adapters.home, state.deviceName);
  const vaultId = p.unbase32(state.vaultId);
  const pin = binary(state.server.pin);

  const client = createClient({
    address: state.server.address,
    pin,
    vaultId,
    identity,
    now,
    fetcher: adapters.fetcher,
    version: VERSION,
  });

  if (await withStateLock(adapters.home, () => resumeApproval(adapters, client, vaultId))) {
    interaction.report(approvalText({ kind: "approved" }));

    return;
  }

  const pick = pickRequest(await joinRequests(client), number);

  if (pick.kind === "none") {
    interaction.report(noRequestText(state.server.address));

    return;
  }

  if (pick.kind === "missing")
    throw new EnvdenError("NOT_FOUND", "No device is waiting with that number");

  const request =
    pick.kind === "picked" ? pick.request : await chooseRequest(pick.requests, interaction);

  const result = await approveJoin(
    { adapters, client, identity, pin, vaultId, now },
    request,
    interaction,
  );

  interaction.report(approvalText(result));
}

async function chooseRequest(requests: TJoinRequest[], interaction: IApproveInteraction) {
  const number = await interaction.choose(requests);
  const request = requests.find((item) => item.number === number);
  if (!request) throw new EnvdenError("NOT_FOUND", "No device is waiting with that number");

  return request;
}
