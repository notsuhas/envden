import { defaultInput } from "../output/default-input.ts";
import { finishPairing } from "../pairing/finish.ts";
import { promptPairing } from "../pairing/prompt.ts";
import { parseKit } from "../vault/recovery/input.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TAdapters } from "../adapters.ts";
import { deviceIdentity } from "../identity/device.ts";
import { hello } from "../client/hello.ts";
import { createClient } from "../client/request.ts";
import { kitJoin } from "../vault/recovery/kit.ts";
import { atomicWrite, optionalRead } from "../state/files.ts";
import { secret } from "../output/questions.ts";

export async function runJoin(
  adapters: TAdapters,
  address: string,
  options: { recoveryKit?: string; name?: string; resume?: boolean },
  now: () => number,
): Promise<void> {
  const name = await defaultInput(options.name, "Device name");

  if (options.recoveryKit) {
    const kit = parseKit(JSON.parse(await readFile(options.recoveryKit, "utf8")));

    await kitJoin(adapters, {
      address,
      vaultId: kit.vaultId,
      secretKey: kit.secretKey,
      name,
      password: await secret("Master password"),
      now,
      fetcher: fetch,
    });

    return;
  }

  const expected = await optionalRead(join(adapters.home, "state", "pair-pin"));

  const server = await hello(
    address,
    expected ? new Uint8Array(Buffer.from(expected, "base64url")) : undefined,
    fetch,
    "0.0.0",
  );

  const identity = await deviceIdentity(adapters.keychain, adapters.home, name);

  const client = createClient({
    address,
    pin: server.pin,
    vaultId: new Uint8Array(32),
    identity,
    now,
    fetcher: fetch,
    version: "0.0.0",
  });

  if (!options.resume) {
    await atomicWrite(
      join(adapters.home, "state", "pair-pin"),
      Buffer.from(server.pin).toString("base64url"),
    );

    await promptPairing(adapters, client, identity, server.pin, now);
  }

  await finishPairing(adapters, client, identity, address, server.pin, now);
  console.log("Joined");
}
