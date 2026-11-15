import { decode, signedCodec, verifyRawObject } from "../../protocol/index.ts";
import type { ICodec, ISigned } from "../../protocol/index.ts";
import { classifyUnknownData } from "./classify.ts";

export function decodeServerObject<T>(input: {
  received: Uint8Array;
  stored?: Uint8Array | undefined;
  mismatch: "fork" | "rollback";
  members: readonly { id: Uint8Array; objPub: Uint8Array }[];
  codec: ICodec<T>;
  label: "entry" | "manifest" | "repair-report";
  currentVersion: string;
  latestVersion: string;
}):
  | { kind: "known"; value: ISigned<T> }
  | {
      kind: "fork" | "rollback" | "invalid" | "update-required" | "unreadable";
    } {
  const raw = input.received;
  const tag = input.label === "entry" ? 1 : input.label === "manifest" ? 2 : 11;

  const unknownFormat =
    raw[0] !== tag ||
    raw[1] !== 1 ||
    (input.label === "entry" && raw.length >= 155 && raw[74]! > 7) ||
    (input.label === "manifest" && raw.length >= 123 && raw[42]! > 13);

  const result = classifyUnknownData({
    ...input,
    unknownFormat,
    verify: () => verifyRawObject(raw, input.members, input.label).ok,
  });

  if (result.kind !== "known") return { kind: result.kind };

  try {
    return { kind: "known", value: decode(signedCodec(input.codec), raw) };
  } catch {
    return { kind: "invalid" };
  }
}
