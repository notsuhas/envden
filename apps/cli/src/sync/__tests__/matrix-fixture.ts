import type { syncFixture } from "./flows.ts";
import { loadState, saveState } from "../../state/store/repository.ts";

const fixtureClock = () => 1800000000000;

export async function resetMatrix(f: Awaited<ReturnType<typeof syncFixture>>, id: string) {
  f.checkout.repoId = `github.com/matrix/${id}`;
  f.checkoutB.repoId = f.checkout.repoId;

  for (const adapters of [f.first, f.second, f.third]) {
    const state = (await loadState(adapters.home))!;
    state.links = [];
    state.approved = adapters === f.first ? [f.checkout] : [];
    await saveState(adapters.home, state, fixtureClock);
  }
}
