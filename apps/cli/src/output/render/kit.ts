import { sanitizeConsole } from "../sanitize.ts";

interface IKit {
  vaultId: string;
  secretKey: string;
  server: string;
}

// With savedTo the secret key stays in the private file and off the terminal.
export function printKit(kit: IKit, savedTo?: string) {
  const lines = [
    "Recovery kit",
    "Keep it somewhere safe and offline, like a passport. With your master password it opens the vault if you lose every device, so never write the password on it.",
    "",
    `  Vault ID:    ${kit.vaultId}`,
    savedTo ? `  Saved to:    ${savedTo}` : `  Secret key:  ${kit.secretKey}`,
    `  Server:      ${kit.server}`,
  ];

  console.log(sanitizeConsole(lines.join("\n")));
}
