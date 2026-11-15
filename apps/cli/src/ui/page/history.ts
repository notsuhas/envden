import type {
  ICheckoutView,
  IFileView,
  IHistoryView,
  IRepoView,
  IRestoreView,
} from "../view/model.ts";
import type { createApi } from "./api.ts";
import { busy, errorText, notify } from "./notice.ts";
import { byId } from "./render/dom.ts";
import { historyPane, type IHistoryPane } from "./render/history/pane.ts";
import { reveal } from "./render/reveal.ts";

type TCall = ReturnType<typeof createApi>;

export function createHistory(call: TCall, refresh: () => Promise<boolean>) {
  let pane: IHistoryPane | undefined;

  const load = (root: string, path: string) =>
    call<IHistoryView>(`history?${new URLSearchParams({ root, path }).toString()}`);

  const draw = () => {
    byId("history-section").hidden = !pane;
    byId("history").replaceChildren(...(pane ? [historyPane(pane, actions)] : []));
  };

  const update = (change: Partial<IHistoryPane>) => {
    if (pane) pane = { ...pane, ...change };
    draw();
  };

  const actions = {
    ask: (version: number) => update({ asking: version, outcome: undefined }),
    cancel: () => update({ asking: undefined }),
    restore: (version: number) => void restore(version),
    close: () => {
      pane = undefined;
      draw();
    },
  };

  async function restore(version: number) {
    if (!pane) return;
    const { root, file } = pane;

    await busy(`Restoring v${version} of ${file.path}...`, async () => {
      try {
        const result = await call<IRestoreView>("history/restore", {
          root,
          path: file.path,
          version,
        });

        const restored = result.kind === "restored";
        await refresh();

        update({
          history: await load(root, file.path),
          asking: undefined,
          outcome: { kind: restored ? "restored" : "unchanged", version, changes: result.changes },
        });

        notify(
          restored
            ? `Restored v${version} of ${file.path} locally. Review it, then press Push.`
            : `${file.path} already matches v${version}.`,
        );
      } catch (error) {
        update({ asking: undefined, outcome: { kind: "refused", message: errorText(error) } });
        notify("Restore refused; see History.", true);
      }
    });
  }

  async function open(checkout: ICheckoutView, file: IFileView) {
    await busy(`Loading history of ${file.path}...`, async () => {
      pane = { root: checkout.root, file, history: await load(checkout.root, file.path) };
      draw();
      reveal(byId("history-section"));
      notify(`History of ${file.path}. Key names only, never values.`);
    });
  }

  // A refresh can change the file's status, which decides whether restore is offered.
  function track(repos: IRepoView[]) {
    const open = pane;
    if (!open) return;

    const file = repos
      .flatMap((repo) => repo.checkouts)
      .find((checkout) => checkout.root === open.root)
      ?.files.find((item) => item.path === open.file.path);

    if (file) update({ file });
  }

  return { open, track };
}
