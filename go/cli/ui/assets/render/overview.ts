import { format } from "date-fns";
import type { IOverview } from "../../view/model.ts";
import { unlockText } from "../../view/unlock/text.ts";
import { el } from "./dom.ts";

const lights: Record<string, string> = { reachable: "good", error: "bad" };

export function renderOverview(target: HTMLElement, overview: IOverview, conflicts: number) {
  const cell = (term: string, value: Node[], attention = false) =>
    el("div", { data: { attention: String(attention) } }, [
      el("dt", { className: "label", text: term }),
      el("dd", { className: "mono" }, value),
    ]);

  const text = (value: string) => el("span", { text: value });

  target.replaceChildren(
    cell("Server", [
      el("span", {
        className: "light",
        label: overview.server.reachability,
        data: { tone: lights[overview.server.reachability] ?? "idle" },
      }),
      text(overview.server.address),
    ]),
    cell("Vault", [text(overview.vaultId)]),
    cell(
      "Unlock",
      [text(unlockText(overview.unlock, overview.checkedAt, (ms) => format(ms, "PP p")))],
      overview.unlock.kind === "locked",
    ),
    cell("Pending", [text(String(overview.pending))], overview.pending > 0),
    cell("Conflicts", [text(String(conflicts))], conflicts > 0),
  );
}
