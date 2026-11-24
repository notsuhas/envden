import { expect, test } from "bun:test";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { listDevices } from "../../admin/devices/list.ts";
import { removeDevice } from "../../admin/devices/remove.ts";
import { rotateVault } from "../../admin/devices/rotate.ts";
import { loadState } from "../../state/store/repository.ts";
import { wordApproval } from "./flow.ts";

const WORDS = /^[a-z]+ [a-z]+ [a-z]+$/;

test("both screens show the same three words, and approving adds the device", async () => {
  const f = await fixture();

  try {
    const second = f.home("second");
    const result = await wordApproval(f, { joiner: second });

    expect(result.words.joiner).toMatch(WORDS);
    expect(result.words.approver).toBe(result.words.joiner);
    expect(result.approval.status).toBe("fulfilled");

    await result.finish();
    expect((await loadState(second.home))?.vaultId).toBe(f.result.vaultId);

    expect((await listDevices(f.first, f.now)).map((device) => device.name)).toEqual([
      "first",
      "second",
    ]);
  } finally {
    await f.close();
  }
});

test("a taken name is numbered, and the joiner adopts the committed name", async () => {
  const f = await fixture();

  try {
    const joiner = f.home("joiner");
    const result = await wordApproval(f, { joiner, name: "first" });
    await result.finish();

    expect((await listDevices(f.first, f.now)).map((device) => device.name)).toEqual([
      "first",
      "first-2",
    ]);

    expect((await loadState(joiner.home))?.deviceName).toBe("first-2");
  } finally {
    await f.close();
  }
});

test("the joiner keeps headers only through its approval and catches up on pull", async () => {
  const { pull } = await import("../../sync/engine.ts");
  const f = await fixture();

  try {
    const second = f.home("second");
    const result = await wordApproval(f, { joiner: second });
    await rotateVault(f.first, f.now);
    await result.finish();

    const joined = (await loadState(second.home))!;
    await pull(second, { now: f.now, fetcher: f.fetcher, all: true });
    expect((await loadState(second.home))!.headers.length).toBe(joined.headers.length + 1);
  } finally {
    await f.close();
  }
});

test("a no on the approving screen cancels the join for both", async () => {
  const f = await fixture();

  try {
    const second = f.home("second");
    const result = await wordApproval(f, { joiner: second, approverSays: async () => false });

    expect(result.approval.status).toBe("fulfilled");
    await Promise.resolve(expect(result.finish()).rejects.toMatchObject({ code: "UNAUTHORIZED" }));
    expect((await listDevices(f.first, f.now)).map((device) => device.name)).toEqual(["first"]);
  } finally {
    await f.close();
  }
});

test("a no on the joining screen cancels the request, so a yes on the other can't add it", async () => {
  const f = await fixture();

  try {
    const second = f.home("second");
    const result = await wordApproval(f, { joiner: second, joinerSays: false });

    expect(result.joined).toMatchObject({ status: "rejected", reason: { code: "INVALID_INPUT" } });
    expect(result.approval.status).toBe("rejected");
    expect((await listDevices(f.first, f.now)).map((device) => device.name)).toEqual(["first"]);
  } finally {
    await f.close();
  }
});

test("a removed device rejoins by word approval with a new identity", async () => {
  const f = await fixture(["second"]);

  try {
    const second = f.joined.second!;
    const before = (await loadState(second.home))!;
    await removeDevice(f.first, "second", f.now);
    const result = await wordApproval(f, { joiner: second, rejoin: true });
    await result.finish();

    const after = (await loadState(second.home))!;
    expect(after.vaultId).toBe(before.vaultId);
    expect(after.headers.length).toBeGreaterThan(before.headers.length);
    expect(await second.keychain.get(`envden/${second.home}/rejoin/device`)).toBeUndefined();
  } finally {
    await f.close();
  }
});
