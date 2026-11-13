import { decode, encode, equal } from "../encoding/binary.ts";

import { Verify } from "../crypto/sign.ts";
import { type TVerification } from "../crypto/sign.ts";
import { ReleaseCodec } from "../codecs/releases/body.ts";

import { type IRelease } from "../codecs/releases/body.ts";
import { ReleaseFeedCodec } from "../codecs/releases/feed.ts";
import { type IReleaseCounter } from "./trust.ts";
import { type IReleaseState } from "./trust.ts";

export function acceptRelease(
  data: Uint8Array,
  state: IReleaseState,
  now: bigint,
): TVerification<{ state: IReleaseState; release: IRelease; expired: boolean }> {
  try {
    const feed = decode(ReleaseFeedCodec, data),
      body = feed.body;

    if (body.generation !== state.generation) return { ok: false, reason: "Wrong generation" };

    const valid = feed.signatures.filter(
      (s) =>
        Verify(
          s.key === 0 ? state.keys.primary : state.keys.backup,
          "release",
          encode(ReleaseCodec, body),
          s.sig,
        ).ok,
    );

    if (valid.length !== feed.signatures.length)
      return { ok: false, reason: "Invalid release signature" };

    const backup = valid.some((s) => s.key === 1);

    const passes = valid.some((s) => {
      if (s.key === 0 && state.primaryRevoked) return false;
      const old = s.key === 0 ? state.primary : state.backup;

      return !old || body.seq > old.seq || (body.seq === old.seq && equal(data, old.feed));
    });

    if (!passes) return { ok: false, reason: "Invalid signature or stale release" };

    function update(key: number, old: IReleaseCounter | undefined): IReleaseCounter | undefined {
      if (!valid.some((s) => s.key === key) || (old && old.seq >= body.seq)) return old;

      return { seq: body.seq, feed: data.slice() };
    }

    let next: IReleaseState = {
      ...state,
      primary: update(0, state.primary),
      backup: update(1, state.backup),
      primaryRevoked: state.primaryRevoked || (backup && body.revokePrimary === 1),
      unsafe: [...new Set([...state.unsafe, ...body.unsafe])],
    };

    if (backup && body.next) {
      if (state.generation === 0xffffffff) return { ok: false, reason: "Generation overflow" };

      next = {
        generation: state.generation + 1,
        keys: body.next,
        primaryRevoked: false,
        unsafe: next.unsafe,
      };
    }

    return { ok: true, value: { state: next, release: body, expired: now >= body.expires } };
  } catch {
    return { ok: false, reason: "Malformed release" };
  }
}
