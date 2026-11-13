import { expect, test } from "bun:test";
import { readBody } from "../middleware/body.ts";

for (const path of ["/v1/opaque/login/start", "/v1/pairing/mailboxes", "/v1/vault"])
  test(`stream cap cancels oversized ${path}`, async () => {
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(65537));
      },
      cancel() {
        cancelled = true;
      },
    });

    expect(
      readBody(new Request(`http://server${path}`, { method: "POST", body: stream })),
    ).rejects.toThrow("Request too large");

    expect(cancelled).toBe(true);
  });

test("content length is checked before reading", async () => {
  const request = new Request("http://server/v1/opaque/login/start", {
    method: "POST",
    headers: { "Content-Length": "65537" },
    body: "small",
  });

  expect(readBody(request)).rejects.toThrow("Request too large");
  expect(request.bodyUsed).toBe(false);
});

test("blob endpoints allow bodies larger than the auth cap", async () => {
  const body = new Uint8Array(65537);

  expect(
    await readBody(new Request("http://server/v1/blobs/hash", { method: "PUT", body })),
  ).toEqual(body);
});
