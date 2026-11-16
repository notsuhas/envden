import type { TRateBucket } from "@envden/core/adapters";
import type { IStorageAdapter } from "@envden/core/adapters";
import { hex } from "./data.ts";
import type { IMemoryContext } from "./data.ts";

export function createAccess(context: IMemoryContext) {
  const sessionKey = (vault: Uint8Array, key: Parameters<IStorageAdapter["session"]>[1]) =>
    JSON.stringify([hex(vault), key.kind, hex(key.device), key.purpose]);

  return {
    putSession(vault, key, bytes, now) {
      context.data.sessions.set(sessionKey(vault, key), {
        bytes: bytes.slice(),
        expires: now + (key.kind === "login" ? 120000 : 600000),
      });
    },
    session(vault, key, now) {
      const value = context.data.sessions.get(sessionKey(vault, key));

      return value && value.expires > now ? value.bytes.slice() : undefined;
    },
    consumeSession(vault, key, now) {
      const value = context.data.sessions.get(sessionKey(vault, key));
      context.data.sessions.delete(sessionKey(vault, key));

      return value && value.expires > now ? value.bytes.slice() : undefined;
    },
    rememberNonce(device, nonce, now) {
      const key = `${hex(device)}:${hex(nonce)}`;
      if ((context.data.nonces.get(key) ?? -Infinity) > now) return false;
      context.data.nonces.set(key, now + 600000);

      return true;
    },
    approver(vault, device, now) {
      const value = context.data.approvers.get(`${hex(vault)}:${hex(device)}`);

      return value && value.expires > now ? value.bytes.slice() : undefined;
    },
    charge(vault, bucket, now) {
      const data = context.data;
      const key = rateKey(vault, bucket);
      const prior = data.buckets.get(key);
      if (prior && now < prior.until) return { kind: "locked", until: prior.until };

      expireCharges(context, key, now);

      const receipt = String(++data.receipt);
      data.charges.set(receipt, { key, at: now });

      if (
        [...data.charges.values()].filter((charge) => charge.key === key).length >=
        (bucket.kind === "mailbox" ? 20 : 5)
      ) {
        const strikes = (prior?.strikes ?? 0) + 1;

        data.buckets.set(key, {
          strikes,
          until: now + Math.min(86400000, 900000 * 2 ** Math.min(strikes - 1, 7)),
        });
      }

      return { kind: "charged", receipt };
    },
    refund(receipt, now) {
      const charge = context.data.charges.get(receipt);
      if (!charge || charge.at <= now - 900000) return false;
      context.data.charges.delete(receipt);

      if (context.data.buckets.has(charge.key))
        context.data.buckets.set(charge.key, { until: 0, strikes: 0 });

      return true;
    },
  } satisfies Pick<
    IStorageAdapter,
    "putSession" | "session" | "consumeSession" | "rememberNonce" | "approver" | "charge" | "refund"
  >;
}

function expireCharges(context: IMemoryContext, key: string, now: number) {
  const data = context.data;

  for (const [receipt, charge] of data.charges)
    if (charge.key === key && charge.at <= now - 900000) data.charges.delete(receipt);
}

function rateKey(vault: Uint8Array, bucket: TRateBucket) {
  if (bucket.kind === "non-member") return `vault:${hex(vault)}`;
  if (bucket.kind === "member") return `member:${hex(bucket.device)}`;
  if (bucket.device) return `mailbox-writer:${hex(bucket.device)}`;

  return `mailbox:${hex(vault)}`;
}
