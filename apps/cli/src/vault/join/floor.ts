import { checkRejoin } from "../../admin/rejoin/classify.ts";
import type { TAdapters } from "../../adapters.ts";
import type { THistory } from "../history.ts";
import { binary } from "../../client/encoding.ts";
import { historyHasHeader, requireLocalFloor } from "./validation.ts";

export async function droppedRejoin(adapters: TAdapters, history: THistory, checkpoint?: string) {
  if (!checkpoint) return false;
  if (historyHasHeader(history, binary(checkpoint))) return false;
  const result = await checkRejoin(adapters, history);
  if (result?.kind === "dropped-by-repair") return true;
  requireLocalFloor(history, checkpoint);

  return false;
}
