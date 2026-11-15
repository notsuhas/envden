// Only the loopback names this server printed; anything else is a rebinding attempt.
export function allowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  return !!origin && !!host && origin === `http://${host}`;
}
