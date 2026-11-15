import type { ILocalState } from "../../state/model.ts";

export function checkoutRepo(state: ILocalState, root: string) {
  const approved = state.approved.find((item) => item.root === root);

  return approved && (state.aliases[approved.repoId] ?? approved.repoId);
}
