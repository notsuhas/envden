import { EnvdenError } from "../../errors/index.ts";
import type { ISwapContext } from "./context.ts";
import { checkPayload } from "./payload/check.ts";
import {
  equal,
  objectHash,
  ManifestHeaderCodec,
  SwapCodec,
  verifyObject,
} from "../../protocol/index.ts";
import type { ISwap } from "../../protocol/index.ts";
import type { IDeviceListState } from "../devices/state.ts";
import { applyEntry } from "../devices/apply.ts";
import { check, id } from "../shared/validation.ts";
import { operationRequirement } from "./operation.ts";
import type { TAuthorization } from "./operation.ts";

export type { ISwapContext } from "./context.ts";

export function validateSwap(
  swap: ISwap,
  context: ISwapContext,
): { kind: "valid"; authorization: TAuthorization; state: IDeviceListState } | { kind: "invalid" } {
  try {
    SwapCodec.write(swap);
    const h = swap.header.body;
    const previous = context.previous.body;
    check(equal(swap.expectedHead, objectHash(ManifestHeaderCodec, context.previous, "manifest")));
    check(equal(h.prev, swap.expectedHead) && h.seq === previous.seq + 1n);
    check(equal(h.vaultId, context.state.vaultId));
    check(previous.listSeq === context.state.seq && equal(previous.listHead, context.state.head));
    let state = context.state;

    for (const entry of swap.entries) {
      const result = applyEntry(state, entry);
      check(result.kind === "valid");
      state = result.state;
    }

    const authorization = operationRequirement(
      previous,
      h,
      swap.entries,
      context.state,
      context.destinationPin !== undefined,
    );

    check(h.listSeq === state.seq && equal(h.listHead, state.head) && h.epoch === state.epoch);
    const member = state.devices.get(id(h.signer));
    check(member && verifyHeader(swap, member.objPub));

    checkRequest(swap, context, state);

    checkPayload(swap, context);

    return { kind: "valid", authorization, state };
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "INVALID_DATA") throw error;

    return { kind: "invalid" };
  }
}

function verifyHeader(swap: ISwap, publicKey: Uint8Array): boolean {
  return verifyObject(ManifestHeaderCodec, swap.header, publicKey, "manifest").ok;
}

function checkRequest(swap: ISwap, context: ISwapContext, state: IDeviceListState) {
  const h = swap.header.body;

  check(
    equal(context.requestSigner, h.signer) ||
      (h.op === 10 && context.destinationPin && state.devices.has(id(context.requestSigner))),
  );

  if (h.op === 10 && context.destinationPin) {
    const entry = swap.entries[0]?.body;
    check(entry?.kind === 5 && equal(entry.payload.newPin, context.destinationPin));
  }
}
