import { registerMoveMetadata } from "./move/metadata.ts";
import { Hono } from "hono";
import { parseSemver } from "@envden/core/protocol";
import type { IAppOptions, TServerEnv } from "./http/types.ts";
import { onError } from "./http/errors.ts";
import { verification } from "./middleware/verification.ts";
import { createBodyBudget } from "./middleware/body-budget.ts";
import { registerHello } from "./routes/hello.ts";
import { registerJoin } from "./routes/join.ts";
import { registerRecoveryTicket } from "./routes/ticket.ts";
import { registerStatus } from "./routes/status.ts";
import { createStatusState } from "./status/state.ts";
import type { IStatusState } from "./status/types.ts";

import { registerImport } from "./routes/data/import.ts";
import { registerRecovery } from "./routes/data/recovery.ts";
import { registerVault } from "./routes/data/vault.ts";
import { registerReads } from "./routes/data/reads.ts";

export function createApp(
  options: IAppOptions,
  reserveBody = createBodyBudget(),
  status: IStatusState = createStatusState(options.now(), {}),
) {
  parseSemver(options.config.appVersion);
  parseSemver(options.config.minClient);

  const app = new Hono<TServerEnv>()
    .onError(onError)
    .route("/", registerHello(new Hono<TServerEnv>(), options))
    .route("/", registerStatus(new Hono<TServerEnv>(), options, status))
    .use("/v1/*", verification(options, reserveBody));

  return app
    .route("/", registerJoin(new Hono<TServerEnv>(), options))
    .route("/", registerRecoveryTicket(new Hono<TServerEnv>(), options))
    .route("/", registerVault(new Hono<TServerEnv>(), options))
    .route("/", registerReads(new Hono<TServerEnv>(), options))
    .route("/", registerRecovery(new Hono<TServerEnv>(), options))
    .route("/", registerMoveMetadata(new Hono<TServerEnv>(), options))
    .route("/", registerImport(new Hono<TServerEnv>(), options));
}

type TApp = ReturnType<typeof createApp>;

export type { TApp as AppType };
