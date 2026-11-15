import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { atomicWrite } from "../../state/store/files.ts";
import { text } from "../../client/encoding.ts";
import { currentHistory } from "../shared/history.ts";

import type { TAdminContext } from "../shared/context.ts";

export async function resumeMoveAddress(context: TAdminContext, directory: string) {
  const history = await currentHistory(context);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);
  const header = history.headers.at(-1)!;

  if (moved?.body.kind === 5 && header.body.op === 10) {
    await atomicWrite(join(directory, "move-pin"), text(moved.body.payload.newPin), context.now);

    await atomicWrite(
      join(directory, "move-swap.bin"),
      p.SwapCodec.write({
        expectedHead: header.body.prev,
        header,
        entries: [moved],
        files: undefined,
        keyring: undefined,
        envelope: undefined,
        skPub: undefined,
        opaqueRecord: undefined,
        approver: undefined,
      }),
      context.now,
    );

    return moved.body.payload.newAddress;
  }

  return undefined;
}
