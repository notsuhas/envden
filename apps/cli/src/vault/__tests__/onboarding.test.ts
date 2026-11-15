import { test, expect } from "bun:test";
import { loadState } from "../../state/store/repository.ts";
import { checkCompletion } from "./completion.ts";
import { setupFlow } from "./setup-flow.ts";
import { joinedFlow, pairedFlow } from "./pair-flow.ts";

const period = 2592000000;

test("setup resumes after losing the creation response", async () => {
  const flow = await setupFlow();

  try {
    const state = await loadState(flow.first.home);

    expect(state?.creationPending).toBeUndefined();

    expect(state?.session).toEqual({
      unlockedUntil: flow.now() + period,
      freshUntil: flow.now() + 600000,
    });

    expect(flow.result.state.vaultId).toBe(flow.result.kit.vaultId);
  } finally {
    await flow.cleanup();
  }
});

test("pairing persists the joiner and numbers a taken name it adopts", async () => {
  const { listDevices } = await import("../../admin/devices/list.ts");
  const { readIdentity } = await import("../../identity/stored.ts");
  const flow = await pairedFlow(undefined, false, "first");

  try {
    const stored = await flow.second.keychain.get(`envden/${flow.second.home}/device`);

    expect(flow.confirmed).toEqual(["first-2"]);

    expect((await listDevices(flow.first, flow.now)).map((device) => device.name)).toEqual([
      "first",
      "first-2",
    ]);

    const state = await loadState(flow.second.home);

    expect(state?.vaultId).toBe(flow.result.kit.vaultId);
    expect(state?.session).toEqual({ unlockedUntil: flow.now() + period, freshUntil: 0 });
    expect(state?.deviceName).toBe("first-2");
    expect(readIdentity(stored!).record.name).toBe("first-2");
  } finally {
    await flow.cleanup();
  }
});

test("kit join adopts the history and onboarding completion unlocks joined homes", async () => {
  const flow = await joinedFlow();

  try {
    expect(flow.recovered.session).toEqual({ unlockedUntil: flow.now() + period, freshUntil: 0 });
    await checkCompletion({ ...flow, kit: flow.result.kit });
  } finally {
    await flow.cleanup();
  }
});

test("pairing stores only headers through its approved checkpoint", async () => {
  const { rotateVault } = await import("../../admin/devices/rotate.ts");
  const { pull } = await import("../../sync/engine.ts");

  const flow = await pairedFlow(async (f) => {
    await rotateVault(f.first, "old password", f.now);
  });

  try {
    expect((await loadState(flow.second.home))?.headers).toHaveLength(3);
    await pull(flow.second, { now: flow.now, fetcher: flow.fetcher, all: true });
    const state = (await loadState(flow.second.home))!;
    expect(state.headers).toHaveLength(4);
    await pull(flow.second, { now: flow.now, fetcher: flow.fetcher, all: true });
    expect((await loadState(flow.second.home))?.headers).toHaveLength(4);
  } finally {
    await flow.cleanup();
  }
});

test("setup does not re-record file baselines after another manifest commit", async () => {
  const { rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { appliedFiles } = await import("../../sync/local/applied.ts");
  const { pushInitialFiles } = await import("../initial/push.ts");
  const flow = await pairedFlow();

  try {
    await rm(join(flow.first.home, "state", "applied-files.json"));
    const state = (await loadState(flow.first.home))!;
    await pushInitialFiles(flow.first, state, flow.now);
    expect(Object.keys(await appliedFiles(flow.first.home))).toHaveLength(0);
  } finally {
    await flow.cleanup();
  }
});

test("pairing resends persisted messages and accepts its committed swap after interruption", async () => {
  const flow = await pairedFlow(undefined, true);

  try {
    expect((await loadState(flow.second.home))?.vaultId).toBe(flow.result.kit.vaultId);
  } finally {
    await flow.cleanup();
  }
});

test("kit join succeeds after failed setup with an already used token", async () => {
  const { setupVault } = await import("../setup.ts");
  const { kitJoin } = await import("../recovery/kit.ts");
  const flow = await setupFlow();

  try {
    await Promise.resolve(
      expect(
        setupVault(flow.second, {
          address: flow.address,
          token: flow.token,
          name: "second",
          password: "other",
          now: flow.now,
          fetcher: flow.fetcher,
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    );

    expect(await flow.second.keychain.get(`envden/${flow.second.home}/id-key`)).toBeUndefined();

    await flow.second.keychain.set(`envden/${flow.second.home}/id-key`, new Uint8Array(32));

    await kitJoin(flow.second, {
      address: flow.address,
      vaultId: flow.result.kit.vaultId,
      secretKey: flow.result.kit.secretKey,
      password: "master password",
      name: "second",
      now: flow.now,
      fetcher: flow.fetcher,
    });

    expect((await loadState(flow.second.home))?.vaultId).toBe(flow.result.kit.vaultId);
  } finally {
    await flow.cleanup();
  }
});
