export function derivePlaceVersion(
  current: string | null,
  recorded: string | null,
  ancestor: boolean,
) {
  if (current !== recorded) return "edited";

  return ancestor ? "unchanged" : "unaccepted";
}
