import { sanitizeConsole } from "../../sanitize.ts";

interface IKit {
  vaultId: string;
  secretKey: string;
  server: string;
}

export function printKit(kit: IKit) {
  const lines = [
    "Recovery kit",
    "Keep it somewhere safe and offline, like a passport. With your master password it opens the vault if you lose every device, so never write the password on it.",
    "",
    `  Vault ID:    ${kit.vaultId}`,
    `  Secret key:  ${kit.secretKey}`,
    `  Server:      ${kit.server}`,
  ];

  console.log(sanitizeConsole(lines.join("\n")));
}

export function printKitSaved(path: string, format: "pdf" | "json") {
  const lines = [`Recovery kit saved to ${path}`];

  if (format === "pdf")
    lines.push("Print it or store it offline, then delete the file from this computer.");

  console.log(sanitizeConsole(lines.join("\n")));
}
