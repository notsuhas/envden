import type { TFetch } from "../fetch.ts";
import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { createClient } from "../request.ts";
import { hello } from "../hello.ts";
import { text, binary } from "../encoding.ts";
import { fixture } from "./fixture.ts";

test("request signs the exact body, query and pin; locked retries once", async () => {
  const { options, greeting } = await fixture();
  let attempts = 0;
  let unlocked = 0;

  const client = createClient({
    ...options,
    unlock: async () => {
      unlocked++;
    },
    fetcher: async (url, init) => {
      const welcome = greeting(url);
      if (welcome) return welcome;
      attempts++;
      const headers = new Headers(init?.headers);
      const request = p.decode(p.RequestCodec, binary(headers.get("Envden-Request")!));
      expect(binary(headers.get("Envden-Body-Hash")!)).toEqual(request.bodyHash);
      expect(request.pathAndQuery).toBe("/v1/test?q=1");

      expect(
        p.verifyRequest(
          { body: request, signature: binary(headers.get("Envden-Signature")!) },
          options.identity.record.reqPub,
          options.pin,
          new TextEncoder().encode(typeof init?.body === "string" ? init.body : ""),
          1000000n,
          false,
        ).ok,
      ).toBe(true);

      expect(url instanceof Request ? url.url : url.toString()).toContain("server.example");

      return attempts === 1
        ? Response.json({ error: "LOCKED" }, { status: 403 })
        : Response.json({ kind: "ok" });
    },
  });

  await client.request("/v1/test?q=1", "POST", { message: "test" });
  expect(unlocked).toBe(1);
  expect(attempts).toBe(2);

  expect(client.request("https://other.example/", "GET")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});

for (const latest of [undefined, "v1.0.0"])
  test(`426 trusts the fresh signed hello, never the unsigned minimum: ${latest}`, async () => {
    const { options, server } = await fixture();

    const fetcher: TFetch = async (url) => {
      const address = new URL(url instanceof Request ? url.url : url.toString());

      if (address.hostname.endsWith("github.com") && latest) {
        if (address.hostname === "api.github.com") return Response.json({ tag_name: latest });

        return new Response(null, { status: 503 });
      }

      if (address.pathname !== "/v1/hello")
        return Response.json({ minClient: "99.0.0" }, { status: 426 });

      const signed = p.buildHello(
        {
          challenge: binary(address.searchParams.get("challenge")!),
          host: address.hostname,
          serverSignPub: server.objPub,
          appVersion: "1.0.0",
          minClient: "2.0.0",
          protocols: [1],
        },
        server.objSk,
      );

      return Response.json({ hello: text(p.signedCodec(p.ServerHelloCodec).write(signed)) });
    };

    expect(createClient({ ...options, fetcher }).request("/v1/test")).rejects.toMatchObject({
      code: "CLIENT_TOO_OLD",
      message: latest
        ? "The server requires a version that doesn't exist"
        : "Update envden to meet the signed server minimum",
    });

    expect(hello(options.address, p.randomBytes(32), fetcher, "0.0.0")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

test("typed routes use the signed binary transport", async () => {
  const { options, greeting } = await fixture();
  const bytes = p.randomBytes(48);

  const client = createClient({
    ...options,
    fetcher: async (_input, init) => {
      const welcome = greeting(_input);
      if (welcome) return welcome;
      const headers = new Headers(init?.headers);
      const value = p.decode(p.RequestCodec, binary(headers.get("Envden-Request")!));
      expect(value.pathAndQuery).toBe("/v1/swap");
      expect(p.equal(value.bodyHash, p.sha256(bytes))).toBe(true);
      expect(value.method).toBe("POST");

      return Response.json({ kind: "committed" });
    },
  });

  const response = await client.rpc.v1.swap.$post({}, { init: { body: new Uint8Array(bytes) } });
  expect(await response.json()).toEqual({ kind: "committed" });
});

test("transport failures become a fixed unreachable error without leaking raw text", async () => {
  const { serverFetch } = await import("../fetch.ts");

  const failure = serverFetch(async () => {
    throw new Error("secret server address");
  }, "https://server.invalid");

  await Promise.resolve(
    expect(failure).rejects.toMatchObject({
      code: "SERVER_UNREACHABLE",
    }),
  );
});

test("wire errors use the shared code schema", async () => {
  const { responseError } = await import("../errors.ts");

  expect((await responseError(Response.json({ error: "SERVER_UNREACHABLE" }))).code).toBe(
    "SERVER_UNREACHABLE",
  );

  expect((await responseError(Response.json({ error: "MADE_UP" }))).code).toBe("INVALID_DATA");
});

for (const recover of [true, false])
  test(`BUSY retries use fresh signatures and bounded backoff; recover=${recover}`, async () => {
    const { options, greeting } = await fixture();
    const nonces = new Set<string>();
    const delays: number[] = [];
    let attempts = 0;

    const client = createClient({
      ...options,
      backoff: async (ms) => {
        delays.push(ms);
      },
      fetcher: async (_input, init) => {
        const welcome = greeting(_input);
        if (welcome) return welcome;
        const headers = new Headers(init?.headers);
        nonces.add(headers.get("Envden-Nonce")!);
        attempts++;

        return recover && attempts === 3
          ? Response.json({ ok: true })
          : Response.json({ error: "BUSY" }, { status: 503 });
      },
    });

    if (recover) expect((await client.request("/v1/head")).status).toBe(200);
    else
      await Promise.resolve(
        expect(client.request("/v1/head")).rejects.toMatchObject({ code: "BUSY" }),
      );

    expect(attempts).toBe(3);
    expect(nonces.size).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

test("every signed request installs a bounded timeout signal", async () => {
  const { spyOn } = await import("bun:test");
  const { options, greeting } = await fixture();
  const signal = new AbortController().signal;
  const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(signal);

  try {
    const client = createClient({
      ...options,
      fetcher: async (_url, init) => {
        const welcome = greeting(_url);
        if (welcome) return welcome;
        expect(init?.signal).toBe(signal);

        return Response.json({ kind: "ok" });
      },
    });

    await client.request("/v1/head");
    expect(timeout).toHaveBeenCalledWith(15000);
  } finally {
    timeout.mockRestore();
  }
});

test("kit replacement refusal never retries unlock", async () => {
  const { options, greeting } = await fixture();
  let attempts = 0;
  let unlocked = 0;

  const client = createClient({
    ...options,
    unlock: async () => {
      unlocked++;
    },
    fetcher: async (url) => {
      const welcome = greeting(url);
      if (welcome) return welcome;
      attempts++;

      return Response.json({ error: "RECOVERY_KIT_REQUIRED" }, { status: 409 });
    },
  });

  await Promise.resolve(
    expect(client.request("/v1/move/sk-pub")).rejects.toMatchObject({
      code: "RECOVERY_KIT_REQUIRED",
      message: "Replace the recovery kit first: envden vault kit replace",
    }),
  );

  expect(attempts).toBe(1);
  expect(unlocked).toBe(0);
});
