export function caseProbe(
  names: readonly string[],
): { kind: "compare"; name: string; alternate: string } | { kind: "sensitive" | "empty" } {
  for (const name of names) {
    const alternate = name.replace(/[a-zA-Z]/, (letter) =>
      letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase(),
    );

    if (name === alternate) continue;
    if (names.includes(alternate)) return { kind: "sensitive" };

    return { kind: "compare", name, alternate };
  }

  return { kind: "empty" };
}
