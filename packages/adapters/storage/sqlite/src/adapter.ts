import { collectGarbage } from "./blobs/garbage.ts";
import { recoverBlobs } from "./blobs/recovery.ts";
import { createDevices } from "./access/devices.ts";
import { createCredentials } from "./access/credentials.ts";
import { createApprovers } from "./pairing/approvers.ts";
import { createNonces } from "./access/nonces.ts";
import type { IStorageAdapter } from "@envden/core/adapters";
import { createContext } from "./db/context.ts";
import { createVaults } from "./vaults/vaults.ts";
import { createChain } from "./chain/chain.ts";
import { createState } from "./vaults/state.ts";
import { createBlobs } from "./blobs/blobs.ts";
import { createHistory } from "./chain/history.ts";
import { createSessions } from "./access/sessions.ts";
import { createRateLimits } from "./access/rate-limits.ts";
import { createMailboxes } from "./pairing/mailboxes.ts";
import { createSwapCommit } from "./chain/swap-commit.ts";

export function createSqliteStorageAdapter(dataDir: string, now: number): IStorageAdapter {
  const context = createContext(dataDir, now);

  try {
    recoverBlobs(context, now);
  } catch (error) {
    context.db.close();
    throw error;
  }

  const state = createState(context);
  const sessions = createSessions(context);
  const vaults = createVaults(context, { ...state, ...createCredentials(context) });
  const mailboxes = createMailboxes(context);

  const storage = {
    id: "sqlite",
    transaction<T>(run: () => T): T {
      const result = context.db.transaction(run).immediate();
      collectGarbage(context);

      return result;
    },
    close() {
      context.db.close();
    },
    ...state,
    ...createDevices(context),
    ...createCredentials(context),
    ...createApprovers(context),
    ...createNonces(context),
    ...vaults,
    ...sessions,
    ...mailboxes,
    ...createChain(context),
    ...createBlobs(context),
    ...createHistory(context),
    ...createRateLimits(context),
  };

  return { ...storage, ...createSwapCommit(context, storage) };
}
