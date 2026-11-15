import { test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import * as questions from "../../output/questions.ts";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { runJoin } from "../join.ts";

const fixtureClock = () => 1800000000000;

test("a fresh pairing ignores the abandoned server pin", async () => {
  const f = await fixture();
  const stop = new Error("stop at code entry");
  const prompt = spyOn(questions, "input").mockRejectedValue(stop);

  try {
    const home = f.home("abandoned");

    await atomicWrite(
      join(home.home, "state", "pair-pin"),
      Buffer.from(p.randomBytes(32)).toString("base64url"),
      fixtureClock,
    );

    await Promise.resolve(
      expect(runJoin(home, f.result.kit.server, { name: "new name" }, f.now)).rejects.toBe(stop),
    );

    expect(await readFile(join(home.home, "state", "pair-pin"), "utf8")).toBe(
      f.result.state.server!.pin,
    );
  } finally {
    prompt.mockRestore();
    await f.close();
  }
});

test("join --resume without an exchange fails before asking for a name", async () => {
  const f = await fixture();
  const name = spyOn(questions, "input").mockRejectedValue(new Error("asked for a name"));

  try {
    await Promise.resolve(
      expect(
        runJoin(f.home("unpaired"), f.result.kit.server, { resume: true }, f.now),
      ).rejects.toMatchObject({ code: "NOT_FOUND" }),
    );
  } finally {
    name.mockRestore();
    await f.close();
  }
});

test("a kit join without a terminal names itself after the host and numbers a taken name", async () => {
  const { listDevices } = await import("../../admin/devices/list.ts");
  const { readIdentity } = await import("../../identity/stored.ts");
  const { loadState } = await import("../../state/store/repository.ts");
  const f = await fixture();
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const input = spyOn(questions, "input").mockResolvedValue(f.result.kit.vaultId);
  const log = spyOn(console, "log").mockImplementation(() => {});

  const secret = spyOn(questions, "secret").mockImplementation(async (label) =>
    label === "Recovery secret key" ? f.result.kit.secretKey : "old password",
  );

  try {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    const home = f.home("second");
    home.hostname = "first.local";

    await runJoin(home, f.result.kit.server, { recovery: true }, f.now);

    const stored = await home.keychain.get(`envden/${home.home}/device`);

    expect(input.mock.calls.map(([label]) => label)).toEqual(["Vault ID"]);
    expect((await loadState(home.home))?.deviceName).toBe("first-2");
    expect(readIdentity(stored!).record.name).toBe("first-2");

    expect((await listDevices(f.first, f.now)).map((device) => device.name)).toEqual([
      "first",
      "first-2",
    ]);
  } finally {
    input.mockRestore();
    log.mockRestore();
    secret.mockRestore();

    if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
    else Reflect.deleteProperty(process.stdin, "isTTY");

    await f.close();
  }
});
