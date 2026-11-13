import { equal } from "../../encoding/binary.ts";
import { Verify } from "../sign.ts";
import type { TVerification } from "../sign.ts";

export function verifyRawObject(
  raw: Uint8Array,
  members: readonly { id: Uint8Array; objPub: Uint8Array }[],
  label: "entry" | "manifest" | "repair-report",
): TVerification<true> {
  if (raw.length < 82) return { ok: false, reason: "Truncated signed object" };
  const signer = raw.subarray(-80, -64);
  const member = members.find((item) => equal(item.id, signer));

  if (!member) return { ok: false, reason: "Unknown signer" };

  return Verify(member.objPub, label, raw.subarray(0, -64), raw.subarray(-64));
}
