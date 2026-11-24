import type { IStorageAdapter, IStoredJoinRequest, TJoinSlot } from "@envden/core/adapters";
import { equal } from "./data.ts";
import type { IMemoryContext } from "./data.ts";

const WINDOW = 600000;

export function createJoinRequests(context: IMemoryContext) {
  const methods = {
    openJoinRequest(joiner, record, commit, now) {
      const data = context.data;

      for (const [number, request] of data.joinRequests)
        if (request.expiresAt <= now) data.joinRequests.delete(number);

      data.joinOpenings = data.joinOpenings.filter((at) => at > now - 3600000);
      if (data.joinOpenings.length >= 10) return undefined;
      let number = 1;
      while (data.joinRequests.has(number) && number <= 999) number++;
      if (number > 999) return undefined;

      const request: IStoredJoinRequest = {
        number,
        joiner: joiner.slice(),
        record: record.slice(),
        commit: commit.slice(),
        expiresAt: now + WINDOW,
        slots: {},
      };

      data.joinRequests.set(number, request);
      data.joinOpenings.push(now);

      return structuredClone(request);
    },
    joinRequests(now) {
      return [...context.data.joinRequests.values()]
        .filter((request) => request.expiresAt > now)
        .map((request) => structuredClone(request));
    },
    joinRequest(number, now) {
      const request = context.data.joinRequests.get(number);

      return request && request.expiresAt > now ? structuredClone(request) : undefined;
    },
    closeJoinRequest(number) {
      context.data.joinRequests.delete(number);
    },
    writeJoinRequest(number, slot, bytes, now, claim) {
      const request = context.data.joinRequests.get(number);

      const outcome =
        request && request.expiresAt > now ? slotWrite(request, slot, bytes) : "closed";

      if (outcome === "closed") methods.closeJoinRequest(number);

      if (outcome === "written" && request) {
        request.slots[slot] = bytes.slice();
        if (claim) request.claim = structuredClone(claim);
      }

      return outcome;
    },
  } satisfies Pick<
    IStorageAdapter,
    "openJoinRequest" | "joinRequests" | "joinRequest" | "closeJoinRequest" | "writeJoinRequest"
  >;

  return methods;
}

function slotWrite(request: IStoredJoinRequest, slot: TJoinSlot, bytes: Uint8Array) {
  const prior = request.slots[slot];
  if (prior && equal(prior, bytes)) return "identical";
  if (prior || bytes.length > 4096) return "closed";
  if (slot === "reveal" && !request.slots.offer) return "out-of-order";

  return "written";
}
