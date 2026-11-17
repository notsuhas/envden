export function authenticatedText(text: string): string {
  return text
    .split("\n")
    .map((line) => JSON.stringify(ordered(JSON.parse(line), "")))
    .sort()
    .join("\n");
}

function ordered(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => ordered(item, "item"));

    // Protocol codecs already enforce raw ID order before identities are renamed.
    if (key === "wraps" || key === "entries" || key === "")
      items.sort((a, b) => {
        const left = JSON.stringify(a);
        const right = JSON.stringify(b);

        return left < right ? -1 : left > right ? 1 : 0;
      });

    return items;
  }

  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, ordered(item, name)]),
  );
}
