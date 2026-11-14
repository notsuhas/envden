import { joinLocalState } from "../join/local-state.ts";
import { join } from "node:path";

import { optionalRead, atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";

import { rejoinIdentity, checkRejoin } from "../../admin/rejoin/classify.ts";

import type { TFetch } from "../../client/fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { login } from "../../session/login.ts";
import { readHistory } from "../history.ts";

import { VERSION, MIN_SERVER } from "../../version.ts";

export interface IKitJoin {
  rejoin?: boolean;
  address: string;
  vaultId: string;
  secretKey: string;
  password: string;
  name: string;
  now: () => number;
  fetcher: TFetch;
}

export async function prepareKitJoin(adapters: TAdapters, options: IKitJoin) {
  await joinLocalState(adapters.home, options.vaultId);
  const vaultId = p.unbase32(options.vaultId);
  const server = await hello(options.address, undefined, options.fetcher, MIN_SERVER);

  const pending = join(adapters.home, "state", "kit-join");

  const attempt = JSON.stringify({
    vaultId: options.vaultId,
    pin: p.base32(server.pin),
    name: options.name,
  });

  const resuming = (await optionalRead(pending)) === attempt;

  const identity = options.rejoin
    ? await rejoinIdentity(adapters, options.name)
    : await deviceIdentity(
        adapters.keychain,
        adapters.home,
        options.name,
        !resuming && !(await loadState(adapters.home))?.checkpoint,
      );

  await atomicWrite(pending, attempt);

  const client = createClient({
    address: options.address,
    pin: server.pin,
    vaultId,
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
  });

  if (resuming) {
    try {
      await login(client, vaultId, options.password);
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "NOT_MEMBER") throw error;
      await login(client, vaultId, options.password, "kit");
    }
  } else await login(client, vaultId, options.password, "kit");

  const history = await readHistory(client, vaultId);

  if (!p.equal(history.state.serverPin, server.pin))
    throw new EnvdenError("MOVING", "Vault moved; use its current server address");

  if (options.rejoin) await checkRejoin(adapters, history);

  return { vaultId, server, pending, resuming, identity, client, history };
}
