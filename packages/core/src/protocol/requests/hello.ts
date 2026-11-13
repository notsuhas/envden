import { type IServerHello } from "../codecs/server/hello.ts";
import { ServerHelloCodec } from "../codecs/server/hello.ts";
import { type ISigned } from "../codecs/signed.ts";
import { signObject, verifyObject } from "../crypto/signed-object.ts";
import { type TVerification } from "../crypto/sign.ts";
import { equal } from "../encoding/binary.ts";
import { serverPin } from "../keys/identifiers.ts";
import { compareSemver } from "../versions/semver.ts";

export function buildHello(body: IServerHello, sk: Uint8Array): ISigned<IServerHello> {
  return signObject(ServerHelloCodec, body, sk, "server-hello");
}

export function verifyHello(
  value: ISigned<IServerHello>,
  challenge: Uint8Array,
  host: string,
  pin: Uint8Array,
  minServer: string,
): TVerification<IServerHello> {
  const b = value.body;

  try {
    if (
      !equal(b.challenge, challenge) ||
      b.host !== host.toLowerCase() ||
      !equal(serverPin(b.serverSignPub), pin) ||
      compareSemver(b.appVersion, minServer) < 0
    )
      return { ok: false, reason: "Hello binding or version mismatch" };

    return verifyObject(ServerHelloCodec, value, b.serverSignPub, "server-hello");
  } catch {
    return { ok: false, reason: "Invalid hello" };
  }
}
