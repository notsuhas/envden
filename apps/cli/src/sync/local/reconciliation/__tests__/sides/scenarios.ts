import type { TValue, TScenario } from "./reference.ts";

const values: TValue[] = [null, "A", "B", "C"];

function* tuples(width: number): Generator<TValue[]> {
  if (width === 0) {
    yield [];

    return;
  }

  for (const tail of tuples(width - 1)) for (const value of values) yield [value, ...tail];
}

export function* scenarios(): Generator<TScenario> {
  const servers: TScenario["server"][] = ["absent", "tombstone", "A", "B", "C"];

  for (const tuple of tuples(5)) {
    const [store = null, recorded = null, previous = null, copy = null, base = null] = tuple;

    for (const server of servers) {
      yield { store, recorded, previous, copy, base, server, pending: false };
      if (store === null) yield { store, recorded, previous, copy, base, server, pending: true };
    }
  }
}
