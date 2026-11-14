import { beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { syncFixture } from "./flows.ts";
import { resetMatrix } from "./matrix-fixture.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { setConfig } from "../../settings/config.ts";
import { storePath } from "../../store/path.ts";
import { writeBytes } from "../local/files.ts";
import { push } from "../engine.ts";

export function createSharedFixture() {
  let f: Awaited<ReturnType<typeof syncFixture>>;
  let originals: Pick<typeof f.first, "placement" | "repo">[];
  let sequence = 0;

  beforeAll(async () => {
    f = await syncFixture();

    originals = [f.first, f.second, f.third].map((adapters) => ({
      placement: adapters.placement,
      repo: { ...adapters.repo },
    }));
  });

  afterAll(async () => {
    await f?.cleanup();
  });

  return async () => {
    for (const [i, adapters] of [f.first, f.second, f.third].entries()) {
      Object.assign(adapters, originals[i], { repo: { ...originals[i]!.repo } });

      for (const name of ["conflicts.json", "applied-files.json", "attempts"])
        await rm(join(adapters.home, "state", name), { recursive: true, force: true });

      await rm(join(adapters.home, "base"), { recursive: true, force: true });
      await setConfig("placement", "{}", adapters.home);
    }

    for (const root of [
      f.checkout.root,
      f.checkoutB.root,
      join(f.root, "copy"),
      join(f.root, "new-copy"),
      join(f.root, "checkout-c"),
      join(f.root, "approved-other"),
    ]) {
      await rm(root, { recursive: true, force: true });
    }

    await mkdir(f.checkout.root, { recursive: true });
    await mkdir(f.checkoutB.root, { recursive: true });
    await resetMatrix(f, `scenario-${sequence++}`);
    const store = storePath(f.first.home, f.checkout.repoId, ".env");
    const path = join(f.checkout.root, ".env");
    await rm(path, { force: true });
    await writeBytes(store, new TextEncoder().encode("TOKEN=local-test-value\n"));
    await f.first.placement("link", f.checkout.root).place(store, path);
    const state = (await loadState(f.first.home))!;
    state.links = [{ root: f.checkout.root, path: ".env", store, mode: "link" }];
    await saveState(f.first.home, state);
    await push(f.first, f.opts);
    const second = (await loadState(f.second.home))!;
    second.approved = [f.checkoutB];
    await saveState(f.second.home, second);

    return { ...f, aStore: store, cleanup: async () => {} };
  };
}
