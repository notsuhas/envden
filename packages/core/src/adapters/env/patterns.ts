// The glob grammar every implementation matches identically; Bun.Glob decides within it.
const MAX_LENGTH = 1024;
const MAX_GROUPS = 10;
const MAX_ALTERNATIVES = 16;

export function supportedEnvPattern(pattern: string): boolean {
  const body = pattern.startsWith("!") ? pattern.slice(1) : pattern;
  const count = { groups: 0, alternatives: 1 };

  return (
    pattern.length <= MAX_LENGTH &&
    body.split("/").every((segment) => segment === "**" || supportedSegment(segment, count)) &&
    count.groups <= MAX_GROUPS &&
    count.alternatives <= MAX_ALTERNATIVES
  );
}

type TCount = { groups: number; alternatives: number };

// Literals, `*` and `?`, with flat brace groups whose options are literals or `*`.
function supportedSegment(segment: string, count: TCount) {
  if (!segment) return false;

  for (let index = 0; index < segment.length; index++) {
    const last = consumed(segment, index, count);
    if (last === undefined) return false;
    index = last;
  }

  return true;
}

// The index of the last character this token used, or undefined if it's outside the grammar.
function consumed(segment: string, index: number, count: TCount): number | undefined {
  const character = segment[index]!;

  if (character === "{") return groupEnd(segment, index, count);
  if (character === "*") return segment[index + 1] === "*" ? undefined : index;

  return character === "?" || literals(character) ? index : undefined;
}

function groupEnd(segment: string, open: number, count: TCount) {
  const close = segment.indexOf("}", open);
  if (close === -1 || !supportedGroup(segment, open, close)) return undefined;

  count.groups++;
  count.alternatives *= segment.slice(open + 1, close).split(",").length;

  return close;
}

// A starred option never sits next to an outside `*`, and options have no ranges.
function supportedGroup(segment: string, open: number, close: number) {
  const options = segment.slice(open + 1, close).split(",");
  const starred = options.some((option) => option.includes("*"));
  const touchesStar = segment[open - 1] === "*" || segment[close + 1] === "*";

  return (
    !(starred && touchesStar) &&
    options.every(
      (option) =>
        option !== "" &&
        !option.includes("**") &&
        !option.includes("..") &&
        literals(option.replaceAll("*", "")),
    )
  );
}

// Printable ASCII except glob syntax and the path separator.
function literals(text: string) {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);

    if (code < 0x20 || code > 0x7e || "*?[]{}\\,!()|+@/".includes(text[index]!)) return false;
  }

  return true;
}
