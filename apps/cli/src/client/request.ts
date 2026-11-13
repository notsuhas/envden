import { serverFetch } from "./fetch.ts";
import { hc } from "hono/client";
import type { AppType } from "@envden/server";
import type { TFetch } from "./fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TDeviceIdentity } from "../identity/device.ts";
import { text } from "./encoding.ts";
import { hello } from "./hello.ts";
import { responseError } from "./errors.ts";
import { VERSION } from "../version.ts";

export interface IClientOptions {
  address: string;
  pin: Uint8Array;
  vaultId: Uint8Array;
  identity: TDeviceIdentity;
  version: string;
  now: () => number;
  fetcher: TFetch;
  proof?: (request: p.IRequest) => Uint8Array;
  unlock?: () => Promise<void>;
}

type TRpc = ReturnType<typeof hc<AppType>>;

export interface IClient {
  request: (path: string, method?: string, body?: unknown, retry?: boolean) => Promise<Response>;
  rpc: TRpc;
  forVault: (vaultId: Uint8Array) => IClient;
}

export function createClient(options: IClientOptions): IClient {
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    retry = true,
  ): Promise<Response> {
    const serialized = serializeRequestBody(body);

    const url = new URL(path, options.address);

    if (url.origin !== new URL(options.address).origin)
      throw new EnvdenError("INVALID_INPUT", "Invalid request destination");

    const value: p.IRequest = {
      serverPin: options.pin,
      vaultId: options.vaultId,
      method,
      pathAndQuery: url.pathname + url.search,
      bodyHash: p.sha256(
        typeof serialized === "string" ? new TextEncoder().encode(serialized) : serialized,
      ),
      time: BigInt(options.now()),
      nonce: p.randomBytes(16),
      device: options.identity.record.id,
      clientVersion: options.version,
    };

    const headers = new Headers({
      "Content-Type": "application/json",
      "Envden-Request": text(p.encode(p.RequestCodec, value)),
      "Envden-Device": text(value.device),
      "Envden-Body-Hash": text(value.bodyHash),
      "Envden-Time": String(value.time),
      "Envden-Nonce": text(value.nonce),
      "Envden-Signature": text(p.signRequest(value, options.identity.keys.reqSk).signature),
      "Envden-Device-Record": text(p.encode(p.DeviceRecordCodec, options.identity.record)),
    });

    if (options.proof) headers.set("Envden-Proof", text(options.proof(value)));

    const response = await serverFetch(options.fetcher, url, {
      method,
      headers,
      ...(serialized ? { body: serialized } : {}),
      redirect: "error",
    });

    await checkServerMinimum(response, options);

    if (!response.ok) {
      const error = await responseError(response);

      if (error.code === "LOCKED" && retry && options.unlock) {
        await options.unlock();

        return request(path, method, body, false);
      }

      throw error;
    }

    return response;
  }

  const rpc = hc<AppType>(options.address, {
    fetch: async (input: string | Request | URL, init?: RequestInit) => {
      const wire = new Request(input instanceof Request ? input.url : input.toString(), init);
      const url = new URL(wire.url);
      const bytes = new Uint8Array(await wire.arrayBuffer());

      return request(url.pathname + url.search, wire.method, bytes.length ? bytes : undefined);
    },
  });

  return {
    request,
    rpc,
    forVault: (vaultId: Uint8Array): TClient => createClient({ ...options, vaultId }),
  };
}

export type TClient = ReturnType<typeof createClient>;

async function checkServerMinimum(response: Response, options: IClientOptions) {
  if (response.status === 426) {
    const verified = await hello(options.address, options.pin, options.fetcher, VERSION);

    if (p.compareSemver(options.version, verified.hello.minClient) < 0)
      throw new EnvdenError("CLIENT_TOO_OLD", "Update envden to meet the signed server minimum");

    throw new EnvdenError("INVALID_DATA", "Server rejected a supported client");
  }
}

function serializeRequestBody(body: unknown) {
  if (body instanceof Uint8Array) return body;

  return body === undefined ? "" : JSON.stringify(body);
}
