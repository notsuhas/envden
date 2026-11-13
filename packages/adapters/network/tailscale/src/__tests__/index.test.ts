import { expect, test } from "bun:test";
import fixture from "./running.json";
import { createTailscaleNetworkAdapter } from "../index.ts";

test("status and serve use the recorded JSON and current CLI syntax", async () => {
  const calls: string[][] = [];

  const adapter = createTailscaleNetworkAdapter(async (args) => {
    calls.push(args);

    return { exitCode: 0, stdout: JSON.stringify(fixture), stderr: "" };
  });

  expect(await adapter.status()).toEqual({
    ready: true,
    running: true,
    loggedIn: true,
    httpsEnabled: true,
    hostname: "laptop.tail.example",
  });

  expect(await adapter.checkHttpsCertificate()).toBe(true);
  expect(await adapter.expose(3000)).toBe("https://laptop.tail.example");
  expect(calls.at(-1)).toEqual(["serve", "--bg", "--https=443", "http://127.0.0.1:3000"]);
  expect(adapter.expose(0)).rejects.toThrow("Invalid port");
});

test("missing certificates, logged-out, malformed and unavailable status fail closed", async () => {
  for (const stdout of [
    JSON.stringify({ ...fixture, CertDomains: [] }),
    '{"BackendState":"NeedsLogin"}',
    "[]",
    "bad json",
  ]) {
    const adapter = createTailscaleNetworkAdapter(async () => ({
      exitCode: 0,
      stdout,
      stderr: "",
    }));

    expect((await adapter.status()).ready).toBe(false);
  }

  const adapter = createTailscaleNetworkAdapter(async () => ({
    exitCode: 0,
    stdout: JSON.stringify({ ...fixture, CertDomains: [] }),
    stderr: "",
  }));

  expect(await adapter.checkHttpsCertificate()).toBe(false);
  await Promise.resolve(expect(adapter.expose(8080)).rejects.toBeInstanceOf(Error));
});
