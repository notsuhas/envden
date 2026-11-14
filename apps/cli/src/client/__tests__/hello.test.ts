import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import type { TFetch } from "../fetch.ts";
import { hello } from "../hello.ts";
import { createClient } from "../request.ts";
import { text, binary } from "../encoding.ts";
import { fixture } from "./fixture.ts";

test("authenticated old server has its own version outcome", async () => {
  const { options, server } = await fixture();

  const fetcher: TFetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());

    const signed = p.buildHello(
      {
        challenge: binary(url.searchParams.get("challenge")!),
        host: url.hostname,
        serverSignPub: server.objPub,
        appVersion: "0.0.0",
        minClient: "0.0.0",
        protocols: [1],
      },
      server.objSk,
    );

    return Response.json({ hello: text(p.signedCodec(p.ServerHelloCodec).write(signed)) });
  };

  await Promise.resolve(
    expect(hello(options.address, options.pin, fetcher, "1.0.0")).rejects.toMatchObject({
      code: "SERVER_TOO_OLD",
    }),
  );
});

test("unauthenticated hello tags are invalid data", async () => {
  const { options } = await fixture();

  await Promise.resolve(
    expect(
      hello(
        options.address,
        options.pin,
        async () => Response.json({ hello: text(Uint8Array.of(99)) }),
        "0.0.0",
      ),
    ).rejects.toMatchObject({ code: "INVALID_DATA" }),
  );
});

test("member paths verify hello before exposing signed device requests", async () => {
  const { options, greeting } = await fixture();
  let signed = 0;

  const client = createClient({
    ...options,
    pin: p.randomBytes(32),
    fetcher: async (input) => {
      const welcome = greeting(input);
      if (welcome) return welcome;
      signed++;

      return Response.json({ ok: true });
    },
  });

  await Promise.resolve(
    expect(client.request("/v1/head")).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
  );

  expect(signed).toBe(0);
});

test("malformed hello response is invalid server data", async () => {
  const { options } = await fixture();

  await Promise.resolve(
    expect(
      hello(options.address, options.pin, async () => Response.json({ hello: null })),
    ).rejects.toMatchObject({ code: "INVALID_DATA" }),
  );
});
