import { isAbsolute, join, relative, sep } from "node:path";
import { homePath } from "../../home-path.ts";
import { sanitizeConsole } from "../../sanitize.ts";
import { NOT_SET_UP } from "../../../state/configured.ts";
import type { TFileState } from "../../../status/file-state.ts";
import type { TStatusReport } from "../../../status/report.ts";

type TConfigured = Extract<TStatusReport, { configured: true }>;

type TFile = TConfigured["files"][number];

interface IPlace {
  cwd: string;
  userHome: string;
}

const groups: [TFileState[], string][] = [
  [["changed", "diverged"], "Changed here (run envden push)"],
  [["remote", "diverged"], "Newer on server (run envden pull)"],
  [["conflict"], "Conflicts (run envden resolve --list)"],
  [["detached"], "Detached (run envden pull)"],
  [["missing"], "Missing here (run envden pull)"],
];

export function statusText(report: TStatusReport, place: IPlace) {
  const lines = report.configured ? configuredLines(report, place) : [NOT_SET_UP];

  if (report.update.message) lines.push(report.update.message);

  return sanitizeConsole(lines.join("\n"));
}

function configuredLines(report: TConfigured, place: IPlace) {
  const tracked = report.files.filter((file) => file.state !== "local-only");
  const name = (file: TFile) => displayPath(join(file.root, file.path), place);

  const pending = [
    ...groups.flatMap(([states, label]) => {
      const files = tracked.filter((file) => states.includes(file.state));

      return files.length ? [`${label}: ${files.map(name).join(", ")}`] : [];
    }),
    ...tracked
      .filter((file) => file.state === "held-back")
      .map((file) => `Held back: ${name(file)}: ${file.reason ?? "run envden doctor"}`),
  ];

  if (!pending.length && report.server === "reachable" && report.serverChecked)
    return [
      tracked.length
        ? `In sync: ${countText(tracked)}. Server reachable.`
        : "Nothing tracked yet. Run envden track in a checkout.",
    ];

  return [serverLine(report), ...(pending.length ? pending : ["No changes here"])];
}

function serverLine(report: TConfigured) {
  if (report.server !== "reachable") return `Server: ${report.server} (${report.serverReason})`;

  return report.serverChecked
    ? "Server: reachable"
    : "Server: reachable, but couldn't check it for newer changes";
}

function countText(files: TFile[]) {
  const repos = new Set(files.map((file) => file.repoId ?? file.root)).size;

  return `${plural(repos, "repo")}, ${plural(files.length, "env file")}`;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function displayPath(path: string, place: IPlace) {
  const fromCwd = relative(place.cwd, path);
  const inside = fromCwd !== ".." && !fromCwd.startsWith(`..${sep}`) && !isAbsolute(fromCwd);

  return inside ? fromCwd : homePath(path, place.userHome);
}
