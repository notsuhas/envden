import { expect, test } from "bun:test";
import { createTailscaleNetworkAdapter } from "../../index.ts";
import { FUNNEL_UP, funnelChild } from "../../__tests__/funnel-child.ts";
import running from "../../__tests__/running.json";
import { funnelAccess } from "../access.ts";
import { publicName } from "../public-name.ts";

const caps = (...names: string[]) =>
  JSON.stringify({
    ...running,
    Self: { ...running.Self, CapMap: Object.fromEntries(names.map((n) => [n, null])) },
  });

const ports = (list: string) => `https://tailscale.com/cap/funnel-ports?ports=${list}`;

test("funnel access mirrors Tailscale's node attributes", () => {
  for (const [stdout, access] of [
    [caps("funnel", ports("443,8443,10000")), "allowed"],
    [caps("funnel", ports("9000-11000")), "allowed"],
    [caps("funnel", ports("443,8443")), "port-denied"],
    [caps("funnel"), "port-denied"],
    [caps("https", ports("10000")), "no-funnel"],
    [JSON.stringify({ BackendState: "Running" }), "no-funnel"],
  ] as const)
    expect(funnelAccess(stdout, 10000)).toBe(access);
});

function adapter(status: string, serve: unknown, spawned: string[][] = []) {
  return createTailscaleNetworkAdapter(
    async (args) => ({
      exitCode: 0,
      stdout: args[0] === "serve" ? JSON.stringify(serve) : status,
      stderr: "",
    }),
    {
      spawn: (args) => {
        spawned.push(args);

        return funnelChild(FUNNEL_UP);
      },
      lookup: async () => "found",
    },
  );
}

test("the funnel runs in the foreground for the share path only", async () => {
  const spawned: string[][] = [];
  const share = await adapter(JSON.stringify(running), {}, spawned).openPublicShare(8080, "/s/abc");

  expect(spawned).toEqual([
    ["funnel", "--https=10000", "--set-path=/s/abc", "http://127.0.0.1:8080/s/abc"],
  ]);

  expect(share.url).toBe("https://laptop.tail.example:10000/s/abc");
  expect(await share.ready).toBe("public");
  await share.close();
});

const web = (...hosts: string[]) => ({
  Web: Object.fromEntries(
    hosts.map((host) => [host, { Handlers: { "/": { Proxy: "http://127.0.0.1:3000" } } }]),
  ),
});

const allTaken = web(
  "laptop.tail.example:10000",
  "laptop.tail.example:8443",
  "laptop.tail.example:443",
);

test("the funnel takes the first allowed port nothing serves", async () => {
  for (const [status, serve, args, url] of [
    [
      caps("funnel", ports("443,8443,10000")),
      web("laptop.tail.example:10000"),
      "--https=8443",
      ":8443/s/abc",
    ],
    [caps("funnel", ports("443")), {}, "--https=443", "laptop.tail.example/s/abc"],
  ] as const) {
    const spawned: string[][] = [];
    const share = await adapter(status, serve, spawned).openPublicShare(8080, "/s/abc");

    expect(spawned[0]?.[1]).toBe(args);
    expect(share.url).toEndWith(url);
    expect(await share.ready).toBe("public");
    await share.close();
  }
});

test("refusals name the fix and start no funnel", async () => {
  for (const [status, serve, code, message] of [
    [caps("https"), {}, "UNAUTHORIZED", '{"target": ["autogroup:member"], "attr": ["funnel"]}'],
    [
      caps("funnel", ports("9000")),
      {},
      "UNAUTHORIZED",
      "isn't allowed on ports 10000, 8443 or 443",
    ],
    [JSON.stringify({ ...running, CertDomains: [] }), {}, "INVALID_INPUT", "Enable HTTPS"],
    [JSON.stringify({ ...running, BackendState: "Stopped" }), {}, "INVALID_INPUT", "isn't running"],
    [caps("funnel", ports("10000")), web("laptop.tail.example:10000"), "INVALID_INPUT", "10000"],
    [
      caps("funnel", ports("10000")),
      { TCP: { "10000": { HTTPS: true } } },
      "INVALID_INPUT",
      "10000",
    ],
    [
      caps("funnel", ports("10000")),
      { Foreground: { session: web("other:10000") } },
      "INVALID_INPUT",
      "10000",
    ],
    [JSON.stringify(running), allTaken, "INVALID_INPUT", "10000, 8443 and 443"],
  ] as const) {
    const spawned: string[][] = [];

    const error = await adapter(status, serve, spawned)
      .openPublicShare(8080, "/s/abc")
      .catch((cause: unknown) => cause);

    expect(error).toMatchObject({ code, message: expect.stringContaining(message) });
    expect(spawned).toEqual([]);
  }
});

test("a funnel that stops before it is up rejects with Tailscale's own output", async () => {
  const share = await createTailscaleNetworkAdapter(
    async () => ({ exitCode: 0, stdout: JSON.stringify(running), stderr: "" }),
    { spawn: () => funnelChild("", { stderr: "Another client is changing the serve config" }) },
  ).openPublicShare(8080, "/s/abc");

  await Promise.resolve(
    expect(share.ready).rejects.toThrow("Tailscale Funnel stopped: Another client is changing"),
  );

  await share.ended;
});

const abortable = (_ms: number, signal: AbortSignal) =>
  new Promise<void>((_resolve, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason)),
  );

test("a funnel that stops while DNS is pending rejects ready", async () => {
  const child = funnelChild(FUNNEL_UP);

  const share = await createTailscaleNetworkAdapter(
    async () => ({ exitCode: 0, stdout: JSON.stringify(running), stderr: "" }),
    { spawn: () => child, lookup: async () => "missing", pause: abortable },
  ).openPublicShare(8080, "/s/abc");

  child.kill();
  await Promise.resolve(expect(share.ready).rejects.toThrow("Tailscale Funnel stopped"));
});

test("closing stops the funnel and a pending DNS wait", async () => {
  const share = await createTailscaleNetworkAdapter(
    async () => ({ exitCode: 0, stdout: JSON.stringify(running), stderr: "" }),
    {
      spawn: () => funnelChild(FUNNEL_UP),
      lookup: async () => "missing",
      pause: abortable,
    },
  ).openPublicShare(8080, "/s/abc");

  await share.close();
  await share.ended;
  await Promise.resolve(expect(share.ready).rejects.toThrow());
});

test("the link waits for public DNS, and says when it can't be checked", async () => {
  const signal = new AbortController().signal;

  for (const [answers, readiness, pauses] of [
    [["missing", "missing", "found"], "public", 2],
    [["missing", "unknown"], "unchecked", 1],
  ] as const) {
    const remaining = [...answers];
    let paused = 0;

    const result = await publicName(
      "laptop.tail.example",
      async () => remaining.shift()!,
      async () => {
        paused++;
      },
      signal,
    );

    expect([result, paused]).toEqual([readiness, pauses]);
  }
});
