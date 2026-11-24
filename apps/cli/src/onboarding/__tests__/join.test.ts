import { test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import * as questions from "../../output/prompts/questions.ts";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { runJoin } from "../join.ts";

const fixtureClock = () => 1800000000000;

test("a fresh join clears an abandoned join request before asking anything", async () => {
  const f = await fixture();
  const stop = new Error("stop at the words");
  const prompt = spyOn(questions, "consent").mockRejectedValue(stop);
  const log = spyOn(console, "log").mockImplementation(() => {});

  try {
    const home = f.home("abandoned");
    await atomicWrite(join(home.home, "state", "join-request"), "{}", fixtureClock);
    const joining = runJoin(home, f.result.address, { name: "new name" }, f.now);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await optionalRead(join(home.home, "state", "join-request"))).toBeUndefined();

    const { runDeviceApprove } = await import("../approve.ts");

    const approving = runDeviceApprove(f.first, f.now, undefined, {
      confirm: async () => false,
      report: () => {},
      choose: async () => 1,
      pause: () => new Promise((resolve) => setTimeout(resolve, 1)),
    });

    await Promise.resolve(expect(joining).rejects.toBe(stop));
    await approving.catch(() => {});
  } finally {
    prompt.mockRestore();
    log.mockRestore();
    await f.close();
  }
});

test("join --resume without a saved join fails before asking for a name", async () => {
  const f = await fixture();
  const name = spyOn(questions, "input").mockRejectedValue(new Error("asked for a name"));

  try {
    await Promise.resolve(
      expect(
        runJoin(f.home("unpaired"), f.result.address, { resume: true }, f.now),
      ).rejects.toMatchObject({ code: "NOT_FOUND" }),
    );
  } finally {
    name.mockRestore();
    await f.close();
  }
});

test("a recovery join without a terminal names itself after the host and numbers a taken name", async () => {
  const { listDevices } = await import("../../admin/devices/list.ts");
  const { readIdentity } = await import("../../identity/stored.ts");
  const { loadState } = await import("../../state/store/repository.ts");
  const f = await fixture();
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const input = spyOn(questions, "input").mockRejectedValue(new Error("asked for input"));
  const log = spyOn(console, "log").mockImplementation(() => {});
  const secret = spyOn(questions, "secret").mockResolvedValue(f.result.code);

  try {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    const home = f.home("second");
    home.hostname = "first.local";

    await runJoin(home, f.result.address, { recovery: true }, f.now);

    const stored = await home.keychain.get(`envden/${home.home}/device`);

    expect(input).not.toHaveBeenCalled();
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
