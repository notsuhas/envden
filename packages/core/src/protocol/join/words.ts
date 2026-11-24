import { type IDeviceRecord } from "../codecs/members/device.ts";
import { DeviceRecordCodec } from "../codecs/members/device.ts";
import { b32, concat } from "../encoding/binary.ts";
import { H } from "../crypto/hash.ts";
import wordlist from "./bip39-english.json" with { type: "json" };

export interface IJoinTranscript {
  vaultId: Uint8Array;
  pin: Uint8Array;
  device: IDeviceRecord;
  joinerNonce: Uint8Array;
  approverNonce: Uint8Array;
}

// Three 11-bit indexes from the first 33 bits, so one guess matches with probability 2^-33.
export function joinWords(transcript: IJoinTranscript): string[] {
  const digest = H(
    "join/words",
    concat(
      b32.write(transcript.vaultId),
      b32.write(transcript.pin),
      DeviceRecordCodec.write(transcript.device),
      b32.write(transcript.joinerNonce),
      b32.write(transcript.approverNonce),
    ),
  );

  const bits = digest.slice(0, 5).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n) >> 7n;

  return [22n, 11n, 0n].map((shift) => wordlist[Number((bits >> shift) & 2047n)]!);
}
