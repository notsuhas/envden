import { InvalidArgumentError } from "@commander-js/extra-typings";

// 0 asks the OS for a free port.
export function parsePort(value: string): number {
  const port = /^\d{1,5}$/.test(value) ? Number(value) : -1;

  if (port < 0 || port > 65535)
    throw new InvalidArgumentError("Expected a port from 0 (any free port) to 65535.");

  return port;
}
