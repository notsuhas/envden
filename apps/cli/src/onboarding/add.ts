import { requireConfigured } from "../state/configured.ts";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../adapters.ts";
import { loadState, saveState } from "../state/repository.ts";
import { deviceIdentity } from "../identity/device.ts";
import { createClient } from "../client/request.ts";
import { binary } from "../client/encoding.ts";
import { login } from "../session/login.ts";
import { openPairing, approvePairing } from "../pairing/approver.ts";
import { waitMessage } from "../pairing/wait.ts";
import { secret, consent } from "../output/questions.ts";

export async function runDeviceAdd(adapters: TAdapters, now: () => number): Promise<void> {
  const state = requireConfigured(await loadState(adapters.home), "Run setup first");

  const identity = await deviceIdentity(adapters.keychain, adapters.home, state.deviceName);
  const vaultId = p.unbase32(state.vaultId);
  const pin = binary(state.server.pin);

  const client = createClient({
    address: state.server.address,
    pin,
    vaultId,
    identity,
    now,
    fetcher: fetch,
    version: "0.0.0",
  });

  const session = await login(client, vaultId, await secret("Master password"));

  if (session) {
    state.session = session;
    await saveState(adapters.home, state);
  }

  const attempt = await openPairing(client, pin);
  console.log(attempt.code);

  const result = await approvePairing(
    adapters,
    client,
    identity,
    pin,
    vaultId,
    attempt,
    now,
    async (slot) => {
      await waitMessage(
        client,
        `/v1/pairing/mailboxes/${attempt.number}/${slot}`,
        now,
        attempt.expiresAt,
      );
    },
    (name) => consent(`Add ${name}?`),
  );

  console.log(result.kind);
}
