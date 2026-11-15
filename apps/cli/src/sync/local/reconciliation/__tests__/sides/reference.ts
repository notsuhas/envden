export type TValue = "A" | "B" | "C" | null;

export type TScenario = {
  recorded: TValue;
  previous: TValue;
  server: Exclude<TValue, null> | "absent" | "tombstone";
  copy: TValue;
  base: TValue;
} & ({ pending: true; store: null } | { pending: false; store: TValue });

export function reference(input: TScenario): TValue {
  const { store, recorded, previous, copy, base, server, pending } = input;
  const live = server === "absent" || server === "tombstone" ? null : server;
  const effective = store ?? (pending ? null : live);
  const storeEdit = isStoreEdit(store, recorded, previous);
  const copyEdit = isCopyEdit(input, effective, live);

  if (pending) return null;
  if (storeEdit && (!copyEdit || base !== effective)) return store;
  if (copyEdit) return copy;
  if (effective === null && copy !== null && base !== null && server !== "tombstone") return copy;

  return effective;
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
