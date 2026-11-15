// commands that run without the notice check: machine output, the update flow, and the server itself
const QUIET = new Set(["status", "version", "config", "help", "update", "serve"]);

export function skipsNotices(name: string, json: boolean) {
  return json || QUIET.has(name);
}
