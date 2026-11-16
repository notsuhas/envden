import { join } from "node:path";

export function environment(root: string, name: string, home: string, temporary: string) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    ENVDEN_HOME: join(root, name, "envden"),
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    ENVDEN_NO_UPDATE_CHECK: "1",
    ENVDEN_TELEMETRY: "0",
    ENVDEN_NO_REPORT: "1",
    TERM: "xterm-256color",
    LANG: "en_US.UTF-8",
    TZ: "UTC",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "Parity",
    GIT_AUTHOR_EMAIL: "parity@example.com",
    GIT_COMMITTER_NAME: "Parity",
    GIT_COMMITTER_EMAIL: "parity@example.com",
    GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
  };
}
