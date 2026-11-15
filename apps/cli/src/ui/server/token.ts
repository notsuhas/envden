import * as p from "@envden/core/protocol";

export function newToken(): string {
  return Buffer.from(p.randomBytes(32)).toString("base64url");
}

export function tokenMatches(authorization: string | undefined, token: string): boolean {
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const encoder = new TextEncoder();

  return p.equal(encoder.encode(presented), encoder.encode(token));
}
