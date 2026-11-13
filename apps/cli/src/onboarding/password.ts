import { EnvdenError } from "@envden/core/errors";

export async function confirmedPassword(prompt: (label: string) => Promise<string>) {
  const password = await prompt("Master password");
  const confirmation = await prompt("Confirm master password");

  if (!password || password !== confirmation)
    throw new EnvdenError("INVALID_INPUT", "Master passwords do not match");

  return password;
}
