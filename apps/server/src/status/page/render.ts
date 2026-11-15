import { formatBytes, formatUptime } from "./format.ts";
import { style } from "./style.ts";
import type { TQuotaBand, TServerMode, TStatusResponse } from "@envden/core/protocol";

const modes: Record<TServerMode, string> = {
  normal: "Normal",
  restored: "Restored from backup, accepting repairs only",
  moved: "Moved to another server, read-only",
};

const bands: Record<TQuotaBand, string> = {
  "below-50": "under 50% of quota",
  "50-80": "50–80% of quota",
  "80-95": "80–95% of quota",
  "95-plus": "95% of quota or more",
};

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => entities[char]!);

function row(label: string, value: string, alarm = false) {
  return `<dt>${escape(label)}</dt><dd${alarm ? ' class="alarm"' : ""}>${escape(value)}</dd>`;
}

function pruneText(prune: TStatusResponse["lastPrune"]) {
  if (!prune) return "not yet";

  return `${prune.at.replace("T", " ").replace(/\.\d+Z$/, " UTC")}, ${prune.ok ? "succeeded" : "failed"}`;
}

export function renderStatusPage(status: TStatusResponse): string {
  const rows = [
    row("Version", status.version),
    row("Uptime", formatUptime(status.uptimeSeconds)),
    row("Mode", modes[status.mode], status.mode !== "normal"),
    row("Vaults", String(status.vaults)),
    row("Storage", formatBytes(status.storageBytes)),
    ...(status.fullestVault
      ? [row("Fullest vault", bands[status.fullestVault], status.fullestVault === "95-plus")]
      : []),
    row("Last prune", pruneText(status.lastPrune), status.lastPrune?.ok === false),
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>envden server</title>
<style>${style}</style>
</head>
<body>
<main>
<h1><span>envden</span> server</h1>
<dl>${rows.join("")}</dl>
<p>Per-vault details are only in <code>envden ui</code> on a member device.</p>
</main>
</body>
</html>
`;
}
