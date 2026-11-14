import { beforeAll, afterAll } from "bun:test";
import { syncFixture } from "./flows.ts";
import { snapshotFixture } from "./exploration/fixtures/snapshot.ts";

export function createSharedFixture() {
  let f: Awaited<ReturnType<typeof syncFixture>>;
  let snapshot: Awaited<ReturnType<typeof snapshotFixture>>;
  let originals: Pick<typeof f.first, "placement" | "repo">[];

  beforeAll(async () => {
    f = await syncFixture();
    snapshot = await snapshotFixture(f.root);

    originals = [f.first, f.second, f.third].map((adapters) => ({
      placement: adapters.placement,
      repo: { ...adapters.repo },
    }));
  });

  afterAll(async () => {
    snapshot?.cleanup();
    await f?.cleanup();
  });

  return async () => {
    await snapshot.restore();

    for (const [index, adapters] of [f.first, f.second, f.third].entries())
      Object.assign(adapters, originals[index], { repo: { ...originals[index]!.repo } });

    return { ...f, cleanup: async () => {} };
  };
}
