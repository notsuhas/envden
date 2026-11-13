import { withStateLock } from "../../state/lock/lock.ts";
import { availableBlobs } from "./completion/blobs.ts";
import { missingBlobNames } from "./completion/names.ts";
import { repairFiles } from "./completion/files.ts";
import { closeRepair } from "./completion/close.ts";
import { repairReports } from "./completion/reports.ts";
import { deriveGapAction } from "./completion/gaps.ts";
import { retryHead } from "../../client/retry.ts";
import { resumeClose } from "./resume.ts";
import { fixLost } from "./lost.ts";
import * as p from "@envden/core/protocol";
import { missingReportMembers, classifyMissingBlobs } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import type { THistory } from "../../vault/history.ts";
import { readHistory } from "../../vault/history.ts";
import { binary } from "../../client/encoding.ts";
import { repairContext } from "./upload.ts";
import { dropDevices } from "./drop.ts";

async function attemptFinishRepair(
  adapters: TAdapters,
  options: {
    token: string;
    password: string;
    without?: string[] | undefined;
    acceptLost?: boolean | undefined;
    now: () => number;
    fetcher: TFetch;
  },
) {
  const resumed = await resumeClose(adapters, options.token, options.now, options.fetcher);
  if (resumed) return resumed;
  const context = await repairContext(adapters, options.token, options.now, options.fetcher);
  let history: THistory = await readHistory(context.client, context.vaultId);

  const status = p.RepairStatusSchema.parse(
    await (await context.client.request("/v1/repair/status")).json(),
  );

  if (!p.equal(binary(status.repairId), context.repairId))
    throw new EnvdenError("INVALID_DATA", "Repair identity mismatch");

  history = await dropDevices(context, history, options.without ?? []);

  const reports = await repairReports(context, history);

  const missing = missingReportMembers(history.state, reports);

  if (missing.length)
    return { kind: "missing-reports" as const, devices: missing.map((d) => d.name) };

  const files = await repairFiles(context, history);

  const available = await availableBlobs(context);

  const gaps = classifyMissingBlobs(files, available, reports);

  if (deriveGapAction(gaps, options.acceptLost).kind === "report") {
    return missingBlobNames(context, history, gaps);
  }

  if (gaps.lost.length) {
    await fixLost(context, history, files, gaps.lost, available, context.repairId);
    history = await readHistory(context.client, context.vaultId);
  }

  await closeRepair(adapters, context, history, status, options);

  const result = await resumeClose(adapters, options.token, options.now, options.fetcher);
  if (!result) throw new EnvdenError("INVALID_DATA", "Repair close was not committed");

  return result;
}

export function finishRepair(...args: Parameters<typeof attemptFinishRepair>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptFinishRepair(...args)));
}
