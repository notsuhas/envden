import type { ICheckoutView, IFileView, IRepoView } from "../../view/model.ts";
import { heldGuidance } from "../../view/guidance/held.ts";
import { chip, quiet } from "./chip.ts";
import { button, el, table } from "./dom.ts";
import { keyList } from "./keys.ts";
import { windowPane } from "./window.ts";

export interface IRepoActions {
  showConflict: (id: string) => void;
  history: (checkout: ICheckoutView, file: IFileView) => void;
}

export function renderRepos(target: HTMLElement, repos: IRepoView[], actions: IRepoActions) {
  if (!repos.length) {
    target.replaceChildren(el("p", { className: "empty", text: "No tracked env files yet." }));

    return;
  }

  target.replaceChildren(
    ...repos.map((repo) =>
      windowPane(
        repo.repoId,
        chip(repo.status),
        !quiet(repo.status),
        repo.checkouts.map((checkout) => checkoutBlock(checkout, actions)),
      ),
    ),
  );
}

function checkoutBlock(checkout: ICheckoutView, actions: IRepoActions) {
  return el("div", { className: "checkout" }, [
    el("div", { className: "row" }, [
      el("span", { className: "mono", text: checkout.root }),
      chip(checkout.approval),
    ]),
    table(
      ["File", "Placement", "Status", "Keys", ""],
      checkout.files.map((file) => [
        el("span", { className: "mono", text: file.path }),
        el("span", { className: "mono muted", text: file.mode }),
        statusCell(file, actions),
        keyList(file.keys),
        button("History", "link", `History of ${file.path}`, () => actions.history(checkout, file)),
      ]),
    ),
  ]);
}

function statusCell(file: IFileView, actions: IRepoActions) {
  const conflictId = file.conflictId;

  const hint = conflictId
    ? button("Show conflict", "link", `Show the conflict in ${file.path}`, () =>
        actions.showConflict(conflictId),
      )
    : file.held && el("span", { className: "muted", text: heldGuidance(file.held) });

  return el("span", { className: "row" }, [chip(file.status), ...(hint ? [hint] : [])]);
}
