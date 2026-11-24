import { parseServe } from "./conflict.ts";

type TConfig = ReturnType<typeof parseServe>;

// A foreground config on a port hides everything else served there, so any use counts.
export function portTaken(stdout: string, port: number): boolean {
  const config = parseServe(stdout);

  return [config, ...Object.values(config.Foreground ?? {})].some((item) => usesPort(item, port));
}

function usesPort(config: TConfig, port: number): boolean {
  if (config.TCP?.[String(port)]) return true;

  return Object.keys(config.Web ?? {}).some((address) => address.endsWith(`:${port}`));
}
