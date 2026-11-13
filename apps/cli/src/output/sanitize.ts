export function sanitizeTerminal(value: string): string {
  // Controls must be matched here to prevent terminal and shell-notice injection.
  // oxlint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

export function terminalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "string" ? sanitizeTerminal(item) : item,
  );
}
