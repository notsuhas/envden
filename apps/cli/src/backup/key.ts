import { EnvdenError } from "@envden/core/errors";

type TKeyChoice = { kind: "recipients"; recipients: string[] } | { kind: "passphrase" };

export function keyChoice(recipients: string[], passphrase: boolean): TKeyChoice {
  if (passphrase === recipients.length > 0)
    throw new EnvdenError("INVALID_INPUT", "Use either --recipient or --passphrase");

  return passphrase ? { kind: "passphrase" } : { kind: "recipients", recipients };
}

export async function confirmedPassphrase(prompt: (label: string) => Promise<string>) {
  const passphrase = await prompt("Backup passphrase");

  if ((await prompt("Confirm backup passphrase")) !== passphrase)
    throw new EnvdenError("INVALID_INPUT", "The passphrases don't match");

  return passphrase;
}
