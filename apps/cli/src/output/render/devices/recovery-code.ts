import { sanitizeConsole } from "../../sanitize.ts";

export function recoveryCodeText(code: string) {
  return sanitizeConsole(
    [
      "",
      `  Recovery code:  ${code}`,
      "",
      "Store this in your password manager. It's the only way back in if you lose every device.",
      "",
    ].join("\n"),
  );
}

export function recoveryCodeSavedText(path: string) {
  return sanitizeConsole(
    `Recovery code saved to ${path}. Move it to your password manager, then delete the file.`,
  );
}

export const UNSTORED_CODE_TEXT =
  "Make a new one any time with envden vault recovery-code; this one stops working then.";
