import type { TEntry } from "@envden/core/protocol";
import { expect, spyOn, test } from "bun:test";
import * as questions from "../../../output/questions.ts";
import { runRejoin } from "../run.ts";
import { fixture } from "../../recovery/__tests__/fixture.ts";

test("rejoin --recovery accepts a pasted kit", async () => {
  const f = await fixture();

  const promptInput = spyOn(questions, "input").mockImplementation(
    async () => f.result.kit.vaultId,
  );

  const promptSecret = spyOn(questions, "secret").mockImplementation(async (label) =>
    label === "Recovery secret key" ? f.result.kit.secretKey : "old password",
  );

  try {
    const adapters = f.home("pasted");

    await runRejoin(
      adapters,
      f.running.server.url.toString(),
      { recovery: true, name: "pasted" },
      f.now,
    );

    const { loadState } = await import("../../../state/store/repository.ts");
    const state = await loadState(adapters.home);
    const unlockedUntil = f.now() + 2592000000;

    expect(state?.deviceName).toBe("pasted");
    expect(state?.session).toEqual({ unlockedUntil, freshUntil: 0 });

    expect((await loadState(f.first.home))?.session).toEqual({
      unlockedUntil,
      freshUntil: f.now() + 600000,
    });

    expect(promptSecret.mock.calls.some(([label]) => label === "Recovery secret key")).toBe(true);
  } finally {
    promptInput.mockRestore();
    promptSecret.mockRestore();
    await f.close();
  }
});

test("classifying a device dropped by repair preserves its stored floor", async () => {
  const p = await import("@envden/core/protocol");
  const { verifyChain } = await import("@envden/core/chain");
  const { kitJoin } = await import("../../../vault/recovery/kit.ts");
  const { loadState } = await import("../../../state/store/repository.ts");
  const { adminContext } = await import("../../shared/context.ts");
  const { currentHistory } = await import("../../shared/history.ts");
  const { adoptRejoin } = await import("../classify.ts");
  const f = await fixture();

  try {
    const second = f.home("second");

    await kitJoin(second, {
      ...f.result.kit,
      address: f.result.kit.server,
      name: "second",
      password: "old password",
      now: f.now,
      fetcher: f.fetcher,
    });

    const before = (await loadState(second.home))!;
    const context = await adminContext(f.first, f.now);
    const history = await currentHistory(context);
    const first = history.headers[0]!;
    const entries = history.entries.filter((e) => e.body.seq <= first.body.listSeq);
    const initial = verifyChain(entries);
    if (initial.kind !== "valid") throw new Error("Invalid fixture");

    const entry = p.signObject<TEntry>(
      p.EntryCodec,
      {
        vaultId: context.vaultId,
        seq: initial.state.seq + 1n,
        parent: initial.state.head,
        kind: 6,
        payload: {
          repairId: p.randomBytes(32),
          restoredHead: p.objectHash(p.ManifestHeaderCodec, first, "manifest"),
        },
        signer: context.identity.record.id,
      },
      context.identity.keys.objSk,
      "entry",
    );

    entries.push(entry);
    const repaired = verifyChain(entries);
    if (repaired.kind !== "valid") throw new Error("Invalid repair fixture");

    const header = p.signObject(
      p.ManifestHeaderCodec,
      {
        ...first.body,
        seq: 2n,
        op: 12,
        prev: p.objectHash(p.ManifestHeaderCodec, first, "manifest"),
        listSeq: repaired.state.seq,
        listHead: repaired.state.head,
      },
      context.identity.keys.objSk,
      "manifest",
    );

    await adoptRejoin(second, { headers: [first, header], entries, state: repaired.state });
    expect((await loadState(second.home))?.checkpoint).toBe(before.checkpoint);
    expect((await loadState(second.home))?.headers).toEqual(before.headers);
  } finally {
    await f.close();
  }
});
