import { posix } from "node:path";

export function managerEnvironment(manager: string, inherited = process.env) {
  const windows = /^[A-Za-z]:[\\/]/.test(manager);
  const directory = posix.dirname(manager.replaceAll("\\", "/"));

  const env = Object.fromEntries(
    Object.entries(inherited).filter(
      ([key]) => !/^(path|node_options|bun_options|npm_config_.*)$/i.test(key),
    ),
  );

  env.PATH = windows
    ? `${directory};${inherited.SystemRoot ?? "C:\\Windows"}\\System32`
    : `${directory}:/usr/bin:/bin:/usr/sbin:/sbin`;

  return env;
}
