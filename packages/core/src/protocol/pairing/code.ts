import { EnvdenError } from "../../errors/index.ts";
import { requireValue } from "../encoding/binary.ts";
import { unbase32, base32 } from "../encoding/base32.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";
import { KDF } from "../crypto/kdf.ts";

const CODE_FORMAT = "Codes look like 3-K7QF-2MXP";

function parsePairingCode(input: string) {
  if (!/^[0-9A-Za-z -]*$/.test(input)) return undefined;

  const text = input.toUpperCase().replace(/[- ]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const mailboxGroup = input.trim().match(/^([0-9A-Za-z]+)[ -]+/);

  if (mailboxGroup && mailboxGroup[1]!.length !== text.length - 8) return undefined;

  const mailboxText = text.slice(0, -8),
    password = text.slice(-8);

  if (text.length < 9 || !/^[1-9]\d{0,2}$/.test(mailboxText)) return undefined;

  try {
    unbase32(password);
  } catch {
    return undefined;
  }

  return { mailbox: Number(mailboxText), password };
}

export function normalizePairingCode(input: string): { mailbox: number; password: string } {
  const code = parsePairingCode(input);
  if (!code) throw new EnvdenError("INVALID_INPUT", CODE_FORMAT);

  return code;
}

export function generatePairingCode(mailbox: number, rng: TRandom = randomBytes): string {
  requireValue(Number.isInteger(mailbox) && mailbox >= 1 && mailbox <= 999);
  const bytes = rng(5);
  requireValue(bytes.length === 5);
  const text = base32(bytes);

  return mailbox + "-" + text.slice(0, 4) + "-" + text.slice(4);
}

export function pairingChannelKeys(sessionKey: Uint8Array) {
  requireValue(sessionKey.length === 64, "Invalid OPAQUE session key");

  return {
    joinerToApprover: KDF(sessionKey, new Uint8Array(), "pair/joiner-to-approver"),
    approverToJoiner: KDF(sessionKey, new Uint8Array(), "pair/approver-to-joiner"),
  };
}
