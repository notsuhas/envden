export type TValue = "A" | "B" | "C" | null;

export type TScenario = {
  recorded: TValue;
  previous: TValue;
  server: Exclude<TValue, null> | "absent" | "tombstone";
  copy: TValue;
  base: TValue;
} & ({ pending: true; store: null } | { pending: false; store: TValue });

export function reference(input: TScenario): TValue {
  const { store, recorded, previous, copy, server } = input;
  const live = server === "absent" || server === "tombstone" ? null : server;
  const effective = store ?? (input.pending ? null : live);

  const edits = [
    isStoreEdit(store, recorded, previous) ? store : null,
    isCopyEdit(input, effective, live) ? copy : null,
  ];

  const owner = owned(input, effective, edits);

  const onServer = (value: TValue) =>
    server === "tombstone" ? value === null : server !== "absent" && value === server;

  // A copy edited from the current store replaces it, so nothing is left to choose.
  if (!onServer(owner) || (input.base !== null && input.base === effective)) return owner;

  return edits.find((edit) => edit !== null && edit !== owner && !onServer(edit)) ?? owner;
}

function owned(input: TScenario, effective: TValue, edits: TValue[]): TValue {
  const [storeEdit, copyEdit] = edits.map((edit) => edit !== null);

  if (input.pending) return null;
  if (storeEdit && (!copyEdit || input.base !== effective)) return input.store;
  if (copyEdit) return input.copy;

  return recovered(input, effective) ? input.copy : effective;
}

function recovered(input: TScenario, effective: TValue) {
  return (
    effective === null && input.copy !== null && input.base !== null && input.server !== "tombstone"
  );
}

function isStoreEdit(store: TValue, recorded: TValue, previous: TValue) {
  return store !== null && (store !== (recorded ?? previous) || store !== previous);
}

function isCopyEdit(input: TScenario, effective: TValue, live: TValue) {
  const { copy, base, previous } = input;

  if (copy === null || copy === effective) return false;
  if (copy === live && effective === previous) return false;
  if (base !== null) return copy !== base;

  return copy !== previous && copy !== live;
}
