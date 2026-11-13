import { requireValue } from "../encoding/binary.ts";

export function checkIdentifiers(identifiers: { client: string; server: string }): void {
  requireValue(
    typeof identifiers?.client === "string" &&
      identifiers.client.length > 0 &&
      typeof identifiers.server === "string" &&
      identifiers.server.length > 0,
    "Missing OPAQUE identifiers",
  );
}

export function checkUserIdentifier(userIdentifier: string): void {
  requireValue(
    typeof userIdentifier === "string" && userIdentifier.length > 0,
    "Missing OPAQUE user identifier",
  );
}
