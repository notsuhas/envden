import { EnvdenError } from "@envden/core/errors";

export async function confirmedPassword(
  prompt: (label: string) => Promise<string>,
  attempts = process.stdin.isTTY ? 3 : 1,
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const password = await prompt("Master password");
    const confirmation = await prompt("Confirm master password");

    if (password && password === confirmation) return password;

    if (attempt < attempts) console.error("The passwords don't match. Enter them again.");
  }

  throw new EnvdenError("INVALID_INPUT", "Master passwords do not match");
}
