import type { TConflict } from "./types.ts";

export function validateValue(
  value: string,
  quote: string,
  key: string,
  remaining: string,
): TConflict | { kind: "valid" } {
  if (quote) {
    const end = closingQuote(value, quote);

    if (end >= value.length) {
      const laterQuote = remaining.includes(quote);

      return {
        kind: "conflict",
        reason: laterQuote ? "multiline-value" : "unterminated-quote",
        key,
      };
    }

    if (!/^\s*(#.*)?$/.test(value.slice(end + 1)))
      return { kind: "conflict", reason: "unsupported-syntax", key };
  } else if (value.endsWith("\\")) {
    return { kind: "conflict", reason: "multiline-value", key };
  }

  return { kind: "valid" };
}

function closingQuote(value: string, quote: string) {
  let end = 1;

  for (; end < value.length; end++) {
    if (value[end] === "\\" && quote !== "'") {
      end++;
      continue;
    }

    if (value[end] === quote) break;
  }

  return end;
}
