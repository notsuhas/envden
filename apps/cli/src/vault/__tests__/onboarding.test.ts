import { test, expect } from "bun:test";
import { loadState } from "../../state/store/repository.ts";
import { checkCompletion } from "./completion.ts";
import { setupFlow } from "./setup-flow.ts";
import { joinedFlow, pairedFlow } from "./pair-flow.ts";

test("setup resumes after losing the creation response", async () => {
  const flow = await setupFlow();

  try {
    expect((await loadState(flow.first.home))?.creationPending).toBeUndefined();
    expect(flow.result.state.vaultId).toBe(flow.result.kit.vaultId);
  } finally {
    await flow.cleanup();
  }
});

test("pairing persists a confirmed second device", async () => {
  const flow = await pairedFlow();

  try {
    expect((await loadState(flow.second.home))?.vaultId).toBe(flow.result.kit.vaultId);
  } finally {
    await flow.cleanup();
  }
});

test("kit join adopts the history after pairing", async () => {
  const flow = await joinedFlow();

  try {
    expect(flow.recovered.vaultId).toBe(flow.result.kit.vaultId);
    expect(flow.recovered.entries).toHaveLength(4);
  } finally {
    await flow.cleanup();
  }
});

test("onboarding completion resumes and unlocks joined homes", async () => {
  const flow = await joinedFlow();

  try {
    await checkCompletion({ ...flow, kit: flow.result.kit });
  } finally {
    await flow.cleanup();
  }
});

test("pairing stores only headers through its approved checkpoint", async () => {
  const { rotateVault } = await import("../../admin/devices/rotate.ts");
  const { pull } = await import("../../sync/engine.ts");

  const flow = await pairedFlow(async (f) => {
    await rotateVault(f.first, "master password", f.now);
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
