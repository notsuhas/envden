export function jsonOutput(
  text: string,
  mixed = false,
): { json: unknown; before: string } | { empty: true } {
  if (!text.trim()) return { empty: true };

  try {
    return { json: JSON.parse(text), before: "" };
  } catch (error) {
    if (!mixed) throw error;

    for (const match of text.matchAll(/^[\t ]*[[{]/gm)) {
      try {
        return { json: JSON.parse(text.slice(match.index)), before: text.slice(0, match.index) };
      } catch {
        continue;
      }
    }

    throw new Error("PTY JSON output is missing or malformed", { cause: error });
  }
}
