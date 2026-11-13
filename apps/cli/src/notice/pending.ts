import { join } from "node:path";
import { optionalRead } from "../state/store/files.ts";
import { binary } from "../client/encoding.ts";
import type { ILocalState } from "../state/model.ts";
import { reportRecoveryJoins } from "./recovery.ts";

export async function reportPendingJoins(home: string, state: ILocalState) {
  const pending = await optionalRead(join(home, "state", "pending-recovery.json"));
  if (!pending) return;
  const value: { entries: string[]; ownId: string } = JSON.parse(pending);
  await reportRecoveryJoins(home, { ...state, entries: value.entries }, binary(value.ownId));
}
