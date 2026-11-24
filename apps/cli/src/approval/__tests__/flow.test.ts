import { expect, test } from "bun:test";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { listDevices } from "../../admin/devices/list.ts";
import { removeDevice } from "../../admin/devices/remove.ts";
import { rotateVault } from "../../admin/devices/rotate.ts";
import { loadState } from "../../state/store/repository.ts";
import * as p from "@envden/core/protocol";
import { binary, text } from "../../client/encoding.ts";
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

test("an approval whose swap never reached the server resumes on the next approve", async () => {
  const { runDeviceApprove } = await import("../../onboarding/approve.ts");
  const f = await fixture();

  try {
    const second = f.home("second");
    let dropped = false;

    const approver = {
      ...f.first,
      fetcher: (async (input, init) => {
        if (
          !dropped &&
          (input instanceof Request ? input.url : input.toString()).includes("/v1/swap?")
        ) {
          dropped = true;
          throw new Error("connection lost");
        }

        return f.fetcher(input, init);
      }) as typeof f.fetcher,
    };

    const result = await wordApproval(f, { joiner: second, approver });
    expect(result.approval.status).toBe("rejected");

    await runDeviceApprove(f.first, f.now, undefined, {
      confirm: async () => false,
      report: () => {},
      choose: async () => 0,
    });

    await result.finish();
    expect((await loadState(second.home))?.vaultId).toBe(f.result.vaultId);
  } finally {
    await f.close();
  }
});

test("the joiner refuses an approval naming a header other than the one that added it", async () => {
  const f = await fixture();

  try {
    const second = f.home("second");
    const later = { hash: "" };

    const joinerFetcher: typeof f.fetcher = async (input, init) => {
      const response = await f.fetcher(input, init);
      const url = input instanceof Request ? input.url : input.toString();
      if (!later.hash || !url.endsWith("/v1/join-requests/approved")) return response;
      const { message } = p.MessageResponseSchema.parse(await response.json());
      const approved = p.decode(p.JoinApprovedCodec, binary(message));
      const moved = { ...approved, manifestHash: binary(later.hash) };

      return Response.json({ message: text(p.encode(p.JoinApprovedCodec, moved)) });
    };

    const result = await wordApproval(f, { joiner: second, joinerFetcher });
    await rotateVault(f.first, f.now);
    later.hash = (await loadState(f.first.home))!.checkpoint!;

    await Promise.resolve(expect(result.finish()).rejects.toMatchObject({ code: "INVALID_DATA" }));
    expect(await loadState(second.home)).toBeUndefined();
  } finally {
    await f.close();
  }
});
