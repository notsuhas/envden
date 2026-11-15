export function syncText(
  direction: "push" | "pull",
  result: { changed: number; conflicts: number },
) {
  const verb = direction === "push" ? "Pushed" : "Pulled";
  const moved = result.changed ? `${verb} ${plural(result.changed, "file")}` : undefined;

  if (!result.conflicts) return moved ?? (direction === "push" ? "Nothing to push" : "Up to date");

  const pending = `${plural(result.conflicts, "conflict")} to resolve`;

  return moved ? `${moved}; ${pending}` : `${pending}; nothing ${verb.toLowerCase()}`;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
