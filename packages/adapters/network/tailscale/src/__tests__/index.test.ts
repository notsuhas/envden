import { expect, test } from "bun:test";
import fixture from "./running.json";
import { createTailscaleNetworkAdapter } from "../index.ts";

test("status and serve use the recorded JSON and current CLI syntax", async () => {
  const calls: string[][] = [];

  const adapter = createTailscaleNetworkAdapter(async (args) => {
    calls.push(args);

    return {
      exitCode: 0,
      stdout: args[0] === "serve" ? "{}" : JSON.stringify(fixture),
      stderr: "",
    };
  });

  expect(await adapter.status()).toEqual({
    ready: true,
    running: true,
    loggedIn: true,
    httpsEnabled: true,
    hostname: "laptop.tail.example",
  });

  expect(await adapter.checkHttpsCertificate()).toEqual({ kind: "ready" });
  expect(await adapter.expose(3000)).toBe("https://laptop.tail.example:3000");

  expect(calls.slice(-2)).toEqual([
    ["serve", "status", "--json"],
    ["serve", "--bg", "--https=3000", "http://127.0.0.1:3000"],
  ]);
});

for (const [name, result, kind] of [
  [
    "daemon down",
    { exitCode: 1, stdout: "", stderr: "failed to connect to local tailscaled" },
    "not-running",
  ],
  ["malformed", { exitCode: 0, stdout: "[]", stderr: "" }, "unreadable"],
] as const)
  test(`status names the cause: ${name}`, async () => {
    const adapter = createTailscaleNetworkAdapter(async () => result);

    expect((await adapter.checkHttpsCertificate()).kind).toBe(kind);
  });

test("serve failures carry Tailscale's own output, capped", async () => {
  const hint =
    "Serve is not enabled on your tailnet. To enable, visit: https://login.tailscale.com/f/serve";

  const adapter = createTailscaleNetworkAdapter(async (args) =>
    args[0] !== "serve"
      ? { exitCode: 0, stdout: JSON.stringify(fixture), stderr: "" }
      : args[1] === "status"
        ? { exitCode: 0, stdout: "{}", stderr: "" }
        : { exitCode: 1, stdout: "", stderr: `${hint}\n${"x".repeat(2000)}` },
  );

  const message = await adapter.expose(4280).then(
    () => "",
    (cause: Error) => cause.message,
  );

  expect(message).toContain(hint);
  expect(message.length).toBeLessThan(600);
});

test("serve refuses to replace another service on its port, and leaves 443 alone", async () => {
  const calls: string[][] = [];

  const taken = {
    Web: {
      "laptop.tail.example:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:3773" } } },
      "laptop.tail.example:4280": { Handlers: { "/": { Proxy: "http://127.0.0.1:9000" } } },
    },
  };

  const adapter = createTailscaleNetworkAdapter(async (args) => {
    calls.push(args);

    return {
      exitCode: 0,
      stdout: JSON.stringify(args[0] === "serve" ? taken : fixture),
      stderr: "",
    };
  });

  await Promise.resolve(expect(adapter.expose(4280)).rejects.toMatchObject({ code: "CONFLICT" }));
  expect(calls.some((args) => args.includes("--bg"))).toBe(false);
});
