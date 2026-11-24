import { sanitizeConsole } from "../sanitize.ts";
import { templateLine } from "./template.ts";
import type { doctor } from "../../diagnostics/doctor.ts";

type TReport = Awaited<ReturnType<typeof doctor>>;

export function doctorText(report: TReport) {
  const shells = report.shells.filter((shell) => shell.installed);

  const lines = [
    report.keys.ownerOnly
      ? pass(`Keys: private files in ${report.keys.location} (owner-only, like ~/.ssh)`)
      : fail(
          `Keys: other users can read key files in ${report.keys.location}; run chmod -R go-rwx ${report.keys.location}`,
        ),
    report.symlinks ? pass("Symlinks work") : warn("Symlinks unavailable; checkouts get copies"),
    updateLine(report.update),
    tailscaleLine(report.tailscale),
    report.https.kind === "ready"
      ? pass("HTTPS certificates enabled")
      : fail(`HTTPS certificates: ${report.https.message}`),
    ...(shells.length
      ? shells.map((shell) => pass(`Shell notice: ${shell.shell} (${shell.path})`))
      : [warn("Shell notice: not installed; run envden shell install")]),
    ...report.templates.map((check) => warn(templateLine(check.location, check.template, check))),
  ];

  return sanitizeConsole(lines.join("\n"));
}

function updateLine(update: TReport["update"]) {
  const note = update.message ? ` (${update.message})` : "";

  if (update.required) return fail(`Update required; run envden update${note}`);
  if (update.available) return warn(`Update available; run envden update${note}`);

  return update.message ? warn(update.message) : pass("envden is up to date");
}

function tailscaleLine(status: TReport["tailscale"]) {
  if (status.ready)
    return pass(
      status.hostname ? `Tailscale: connected as ${status.hostname}` : "Tailscale: connected",
    );

  return fail(`Tailscale: ${status.problem?.message ?? statusProblem(status)}`);
}

function statusProblem(status: TReport["tailscale"]) {
  if (!status.running) return "not running";

  return status.loggedIn ? "not ready" : "not logged in";
}

function pass(text: string) {
  return `✓ ${text}`;
}

function warn(text: string) {
  return `! ${text}`;
}

function fail(text: string) {
  return `✗ ${text}`;
}
