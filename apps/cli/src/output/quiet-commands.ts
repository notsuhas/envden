// commands that run without the notice check: machine output, the update flow, the server itself, and export, which stays offline
const QUIET = new Set(["status", "version", "config", "help", "update", "serve", "export"]);

export function skipsNotices(name: string, json: boolean) {
  return json || QUIET.has(name);
}
