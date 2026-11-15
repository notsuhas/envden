import * as p from "@envden/core/protocol";

interface ICredentials {
  pin: Uint8Array;
  secret: Uint8Array;
  keys: ReturnType<typeof p.generateDeviceKeys>;
}

export function createRequests(credentials: ICredentials) {
  const { pin, secret, keys } = credentials;

  const device = {
    id: p.deviceId(keys),
    name: "transport",
    encPub: keys.encPub,
    objPub: keys.objPub,
    reqPub: keys.reqPub,
  };

  return function signed(path: string, body = "", version = "1.0.0", bad = false) {
    const method = body ? "POST" : "GET";

    const r = {
      serverPin: pin,
      vaultId: new Uint8Array(32).fill(9),
      method,
      pathAndQuery: path,
      bodyHash: p.sha256(Buffer.from(body)),
      time: BigInt(Date.now()),
      nonce: p.randomBytes(16),
      device: device.id,
      clientVersion: version,
    };

    const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

    const headers = {
      Host: "localhost",
      Connection: "close",
      "Content-Length": Buffer.byteLength(body),
      "Envden-Request": encode(p.RequestCodec.write(r)),
      "Envden-Device": encode(r.device),
      "Envden-Time": String(r.time),
      "Envden-Nonce": encode(r.nonce),
      "Envden-Body-Hash": encode(r.bodyHash),
      "Envden-Signature": encode(bad ? new Uint8Array(64) : p.signRequest(r, keys.reqSk).signature),
      "Envden-Device-Record": encode(p.DeviceRecordCodec.write(device)),
      "Envden-Proof": encode(p.tokenProof("setup", p.tokenKey("setup", secret), r)),
    };

    return `${method} ${path} HTTP/1.1\r\n${Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join("\r\n")}\r\n\r\n${body}`;
  };
}
