import { CommitResponseSchema } from "@envden/core/protocol";
import type { TCommitResult } from "@envden/core/adapters";
import { text } from "./encoding.ts";

export function commitResponse(result: TCommitResult) {
  return CommitResponseSchema.parse({
    ...result,
    ...("head" in result && result.head ? { head: text(result.head) } : {}),
  });
}
