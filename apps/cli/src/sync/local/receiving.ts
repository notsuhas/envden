import type { ILocalState } from "../../state/model.ts";

export function receivesFile(state: ILocalState, name: { repoId: string; path: string }) {
  return state.approved.some(
    (checkout) =>
      (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId &&
      !state.links.some(
        (link) => link.root === checkout.root && link.path === name.path && link.localOnly,
      ),
  );
}
