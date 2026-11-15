import type { IConflictView, IDeviceView, TDashboardStatus } from "../view/model.ts";
import { createApi } from "./api.ts";
import { createHistory } from "./history.ts";
import { busy, errorText, notify } from "./notice.ts";
import { createRename } from "./rename.ts";
import { byId } from "./render/dom.ts";
import { renderConflicts } from "./render/conflicts.ts";
import { syncSummary } from "../view/summary.ts";
import { renderDevices } from "./render/devices/list.ts";
import { renderOverview } from "./render/overview.ts";
import { renderRepos } from "./render/repos.ts";
import { reveal } from "./render/reveal.ts";

interface ISyncResult {
  changed: number;
  conflicts: number;
  reports?: string[];
}

const call = createApi(location.hash.slice(1));
const history = createHistory(call, refresh);
const rename = createRename(call, refresh);

async function refresh(): Promise<boolean> {
  const status = await call<TDashboardStatus>("status");

  if (status.kind === "not-configured") {
    notify("This device isn't set up. Run envden setup or envden join in a terminal.", true);

    return false;
  }

  byId("device").textContent = status.overview.deviceName;
  renderOverview(byId("overview"), status.overview, status.conflicts.length);
  renderConflicts(byId("conflicts"), status.conflicts, resolve);
  renderRepos(byId("repos"), status.repos, { showConflict, history: history.open });
  history.track(status.repos);

  await call<IDeviceView[]>("devices").then(
    (devices) => renderDevices(byId("devices"), devices, rename),
    (error: unknown) => {
      byId("devices").textContent = errorText(error);
    },
  );

  return true;
}

function showConflict(id: string) {
  const panes = byId("conflicts").querySelectorAll<HTMLElement>("[data-conflict]");
  const pane = [...panes].find((item) => item.dataset.conflict === id);

  if (pane) reveal(pane);
}

function sync(kind: "pull" | "push") {
  return busy(
    kind === "pull" ? "Pulling from the server..." : "Pushing to the server...",
    async () => {
      const result = await call<ISyncResult>(kind, {});
      await refresh();

      notify(
        [syncSummary(kind, result.changed, result.conflicts), ...(result.reports ?? [])].join(" "),
        result.conflicts > 0,
      );
    },
  );
}

function resolve(conflict: IConflictView, choice: "keep-mine" | "take-server") {
  const side = choice === "keep-mine" ? "your version" : "the server's version";
  if (!confirm(`Use ${side} of ${conflict.path}? The other side is backed up.`)) return;

  void busy("Resolving...", async () => {
    await call("resolve", { id: conflict.id, choice });
    await refresh();
    notify(`Resolved ${conflict.path}. Push to send it to your other devices.`);
  });
}

function ready() {
  notify("Ready. Nothing syncs until you press Pull or Push.");
}

byId("refresh").addEventListener(
  "click",
  () =>
    void busy("Refreshing...", async () => {
      if (await refresh()) ready();
    }),
);

byId("pull").addEventListener("click", () => void sync("pull"));

byId("push").addEventListener("click", () => void sync("push"));

if (location.hash.length > 1)
  void busy("Loading...", async () => {
    if (await refresh()) ready();
  });
else notify("Open the link that envden ui printed in your terminal.", true);
