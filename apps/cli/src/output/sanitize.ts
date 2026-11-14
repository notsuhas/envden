export function sanitizeTerminal(value: string): string {
  // oxlint-disable-next-line no-control-regex -- Strip controls to prevent terminal and shell-notice injection.
  return value.replace(/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

export function terminalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "string" ? sanitizeTerminal(item) : item,
  );
}

export function sanitizeConsole(value: string): string {
  return value
    .split(/([\n\t])/)
    .map((part) => (part === "\n" || part === "\t" ? part : sanitizeTerminal(part)))
    .join("");
}
