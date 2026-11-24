import { Encrypter } from "age-encryption";
import { EnvdenError } from "../errors/index.ts";

export type TBackupKey =
  | { kind: "recipients"; recipients: readonly string[] }
  | { kind: "passphrase"; passphrase: string };

// X25519 and ML-KEM-768 hybrid only: tag recipients need a hardware plugin to open.
const RECIPIENT = /^age1(?:pq1)?[02-9ac-hj-np-z]+$/;

export async function sealBackup(key: TBackupKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const encrypter = new Encrypter();

  if (key.kind === "passphrase") encrypter.setPassphrase(key.passphrase);
  else for (const recipient of key.recipients) addRecipient(encrypter, recipient);

  return encrypter.encrypt(plaintext);
}

function addRecipient(encrypter: Encrypter, recipient: string) {
  const problem = new EnvdenError(
    "INVALID_INPUT",
    "A recipient must be an age public key starting with age1 or age1pq1",
  );

  if (!RECIPIENT.test(recipient)) throw problem;

  try {
    encrypter.addRecipient(recipient);
  } catch (cause) {
    throw new EnvdenError(problem.code, problem.message, { cause });
  }
}
