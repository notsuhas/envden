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

// A share link carries its key after #, in whatever form the URL was typed.
const FRAGMENT = /#[^\s',]*/g;

// Commander adds only the trailing newline and a "(Did you mean ...?)" line; the rest can echo argv.
export function sanitizeParserError(message: string): string {
  const suggestion = /\n(\(Did you mean [^\n]*\?\))\n$/.exec(message);
  const text = suggestion ? message.slice(0, suggestion.index) : message.replace(/\n$/, "");
  const lines = suggestion ? [text, suggestion[1]!] : [text];

  // Masked after the controls go: URL parsing drops tabs and line breaks inside a link too.
  return (
    lines.map((line) => sanitizeTerminal(line).replace(FRAGMENT, "#[redacted]")).join("\n") + "\n"
  );
}
