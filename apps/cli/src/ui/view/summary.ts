const plural = new Intl.PluralRules("en");

export function syncSummary(kind: "pull" | "push", changed: number, conflicts: number) {
  const noun = plural.select(conflicts) === "one" ? "conflict" : "conflicts";

  return `${kind === "pull" ? "Pulled" : "Pushed"}: ${changed} changed, ${conflicts} ${noun}.`;
}
