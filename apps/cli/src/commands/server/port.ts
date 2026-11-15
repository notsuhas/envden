import { InvalidArgumentError } from "@commander-js/extra-typings";

export function parsePort(value: string): number {
  const port = /^\d{1,5}$/.test(value) ? Number(value) : 0;
  if (port < 1 || port > 65535) throw new InvalidArgumentError("Expected a port from 1 to 65535.");

  return port;
}
