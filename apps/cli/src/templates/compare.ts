import { parseEnv } from "@envden/core/merge";

export interface ITemplateDrift {
  missing: string[];
  extra: string[];
}

type TEntries = Extract<ReturnType<typeof parseEnv>, { kind: "parsed" }>["entries"];

export function templateDrift(env: Uint8Array, template?: Uint8Array): ITemplateDrift {
  const ours = parseEnv(env, { allowDuplicates: true });
  const theirs = template && parseEnv(template, { allowDuplicates: true });

  if (ours.kind === "conflict" || !theirs || theirs.kind === "conflict")
    return { missing: [], extra: [] };

  const present = activeKeys(ours.entries);
  const listed = new Set(theirs.entries.map((entry) => entry.key));

  return {
    missing: [...activeKeys(theirs.entries)].filter((key) => !present.has(key)),
    extra: [...present].filter((key) => !listed.has(key)),
  };
}

// A commented-out template key is optional, so it's neither missing nor extra.
function activeKeys(entries: TEntries) {
  return new Set(entries.filter((entry) => entry.active).map((entry) => entry.key));
}
