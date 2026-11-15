import type { ILocalState } from "../../../state/model.ts";
import { homePath } from "../../home-path.ts";
import { sanitizeTerminal } from "../../sanitize.ts";

export function setupSummary(state: ILocalState, userHome: string): string[] {
  const files = syncedFiles(state, userHome);
  const server = state.server?.address ?? "the server";
  const tracking = files ? `tracking ${files}` : "tracking no env files yet";

  return [
    sanitizeTerminal(
      `Setup complete. Vault on ${server}, this device is ${state.deviceName}, ${tracking}.`,
    ),
    files
      ? "Add another device with: envden device add"
      : "Track a checkout with: envden track <path>",
  ];
}

export function joinSummary(state: ILocalState, userHome: string): string[] {
  const files = syncedFiles(state, userHome);

  return [
    sanitizeTerminal(
      `Joined as ${state.deviceName}. ${files ? `Synced ${files}.` : "No env files synced yet."}`,
    ),
  ];
}

function syncedFiles(state: ILocalState, userHome: string) {
  const links = state.links.filter((link) => !link.localOnly);
  if (!links.length) return undefined;

  const roots = [...new Set(links.map((link) => homePath(link.root, userHome)))];
  const where = roots.length > 3 ? `${roots.length} checkouts` : roots.join(", ");

  return `${links.length} env ${links.length === 1 ? "file" : "files"} in ${where}`;
}
