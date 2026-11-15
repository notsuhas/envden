import type { IConflictView } from "../../view/model.ts";
import { button, el } from "./dom.ts";
import { windowPane } from "./window.ts";

type TChoice = "keep-mine" | "take-server";

export function renderConflicts(
  target: HTMLElement,
  conflicts: IConflictView[],
  resolve: (conflict: IConflictView, choice: TChoice) => void,
) {
  if (!conflicts.length) {
    target.replaceChildren(el("p", { className: "empty", text: "No conflicts." }));

    return;
  }

  target.replaceChildren(
    ...conflicts.map((conflict) => {
      const pane = windowPane(
        conflict.path,
        el("span", { className: "chip", text: "conflict", data: { tone: "alarm" } }),
        true,
        [
          ...conflict.roots.map((root) => el("span", { className: "mono muted", text: root })),
          sides(conflict),
          el("div", { className: "actions" }, [
            choiceButton(conflict, "keep-mine", resolve),
            choiceButton(conflict, "take-server", resolve),
          ]),
        ],
      );

      pane.dataset.conflict = conflict.id;

      return pane;
    }),
  );
}

function sides(conflict: IConflictView) {
  const keys = conflict.keys;

  const yours = conflict.mineDeleted
    ? ["deleted"]
    : keys.kind === "diff"
      ? [...keys.changed, ...keys.added.map((key) => `${key} (only here)`)]
      : [`not parsed (${keys.reason})`];

  const server = conflict.serverDeleted
    ? ["deleted"]
    : keys.kind === "diff"
      ? [...keys.changed, ...keys.removed.map((key) => `${key} (only there)`)]
      : [`not parsed (${keys.reason})`];

  const side = (label: string, items: string[]) =>
    el("div", {}, [
      el("p", { className: "label", text: label }),
      el(
        "div",
        { className: "keys" },
        (items.length ? items : ["no key changes"]).map((text) => el("span", { text })),
      ),
    ]);

  return el("div", { className: "sides" }, [side("Yours", yours), side("Server", server)]);
}

function choiceButton(
  conflict: IConflictView,
  choice: TChoice,
  resolve: (conflict: IConflictView, choice: TChoice) => void,
) {
  const text = choice === "keep-mine" ? "Keep mine" : "Take server";
  const tone = choice === "keep-mine" ? "quiet" : "primary";

  return button(text, tone, `${text} for ${conflict.path}`, () => resolve(conflict, choice));
}
