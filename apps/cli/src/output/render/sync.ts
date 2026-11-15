export function syncText(
  direction: "push" | "pull",
  result: { changed: number; conflicts: number },
) {
  const moved = result.changed
    ? `${direction === "push" ? "Pushed" : "Pulled"} ${plural(result.changed, "file")}`
    : direction === "push"
      ? "Nothing to push"
      : "Up to date";

  return result.conflicts ? `${moved}; ${plural(result.conflicts, "conflict")}` : moved;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
