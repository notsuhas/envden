import { beforeAll, afterAll } from "bun:test";
import { syncFixture } from "./flows.ts";
import { snapshotFixture } from "./exploration/fixtures/snapshot.ts";
import { approveLayout } from "./round-fixture.ts";

type TFixture = Awaited<ReturnType<typeof syncFixture>>;

type TLayout = readonly ("link" | "copy")[];

interface ISaved {
  snapshot: Awaited<ReturnType<typeof snapshotFixture>>;
  adapters: Pick<TFixture["first"], "placement" | "repo">[];
  targets: Awaited<ReturnType<typeof approveLayout>>;
}

export function createSharedFixture() {
  let f: TFixture;
  const saved = new Map<string, ISaved>();

  const devices = () => [f.first, f.second, f.third];

  async function save(targets: ISaved["targets"]): Promise<ISaved> {
    return {
      snapshot: await snapshotFixture(f.root),
      adapters: devices().map((adapters) => ({
        placement: adapters.placement,
        repo: { ...adapters.repo },
      })),
      targets,
    };
  }

  async function restore(state: ISaved) {
    await state.snapshot.restore();

    for (const [index, adapters] of devices().entries())
      Object.assign(adapters, state.adapters[index], { repo: { ...state.adapters[index]!.repo } });
  }

  beforeAll(async () => {
    f = await syncFixture();
    saved.set("", await save([]));
  });

  afterAll(async () => {
    for (const state of saved.values()) state.snapshot.cleanup();
    await f?.cleanup();
  });

  // A layout's approval pull runs once; later tests restore its snapshot.
  return async (layout: TLayout = []) => {
    const key = layout.join("+");
    const cached = saved.get(key);

    if (cached) await restore(cached);
    else {
      await restore(saved.get("")!);
      saved.set(key, await save(await approveLayout(f, layout)));
    }

    const targets = saved.get(key)!.targets.map((target) => ({ ...target }));

    return { ...f, targets, cleanup: async () => {} };
  };
}
