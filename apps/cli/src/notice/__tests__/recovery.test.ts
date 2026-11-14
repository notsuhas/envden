import type { TFetch } from "../../client/fetch.ts";
import { requireConfigured } from "../../state/configured.ts";
import { test, expect, spyOn } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { reportRecoveryJoins } from "../recovery.ts";
import { vaultConnection } from "../../vault/connection.ts";
import { readHistory } from "../../vault/history.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { text } from "../../client/encoding.ts";

test("accepted recovery-signed joins report once per event and skip the joining device", async () => {
  const f = await fixture();
  const output = spyOn(console, "error").mockImplementation(() => {});

  try {
    const identity = await deviceIdentity(f.first.keychain, f.first.home, "first");

    const { client, vaultId } = await vaultConnection(
      f.first,
      requireConfigured(f.result.state, "Expected vault"),
      f.now,
      f.fetcher,
    );

    const report = async () => {
      const history = await readHistory(client, vaultId);

      const state = {
        ...f.result.state,
        entries: history.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      };

      await reportRecoveryJoins(f.first.home, state, identity.record.id);

      return state;
    };

    await report();
    expect(output.mock.calls).toEqual([]);

    await f.joinHome("second");
    const state = await report();
    expect(output.mock.calls.flat()).toEqual(["envden: second joined with the recovery kit"]);
    await report();
    expect(output.mock.calls).toHaveLength(1);
    await f.joinHome("third");
    const final = await report();

    expect(output.mock.calls.flat()).toEqual([
      "envden: second joined with the recovery kit",
      "envden: third joined with the recovery kit",
    ]);

    const own = p.decode(
      p.signedCodec(p.EntryCodec),
      Buffer.from(state.entries.at(-1)!, "base64url"),
    ).body;

    if (own.kind !== 1) throw new Error("Expected join");
    output.mockClear();
    await reportRecoveryJoins(f.home("new-notice").home, final, own.payload.device.id);
    expect(output.mock.calls.flat()).toEqual(["envden: third joined with the recovery kit"]);
  } finally {
    output.mockRestore();
    await f.close();
  }
});

test("the next foreground command reports a kit join even with a fresh notice cache", async () => {
  const { commandNotice } = await import("../command.ts");
  const f = await fixture();
  const output = spyOn(console, "error").mockImplementation(() => {});

  try {
    const responses = new Map<
      string,
      { body: ArrayBuffer; status: number; headers: [string, string][] }
    >();

    const capture: TFetch = async (input, init) => {
      const response = await f.fetcher(input, init);

      responses.set(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        {
          body: await response.clone().arrayBuffer(),
          status: response.status,
          headers: [...response.headers],
        },
      );

      return response;
    };

    await commandNotice(f.first, f.now(), capture, false);

    const replay: TFetch = async (input, init) => {
      if (new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/hello")
        return f.fetcher(input, init);

      const response = responses.get(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );

      if (!response) throw new Error("Unexpected replay request");

      return new Response(response.body, { status: response.status, headers: response.headers });
    };

    await f.joinHome("second");
    const { remoteNotice } = await import("../remote.ts");
    await remoteNotice(f.first, { now: f.now, fetcher: f.fetcher, all: true });
    expect(output.mock.calls.flat()).not.toContain("envden: second joined with the recovery kit");

    await remoteNotice(f.first, { now: f.now, fetcher: replay, all: true });

    let printedBeforeRefresh: boolean | undefined;

    await commandNotice(
      f.first,
      f.now(),
      async (input, init) => {
        printedBeforeRefresh ??= output.mock.calls
          .flat()
          .includes("envden: second joined with the recovery kit");

        return replay(input, init);
      },
      false,
    );

    expect(printedBeforeRefresh).toBe(true);

    expect(output.mock.calls.flat()).toContain("envden: second joined with the recovery kit");
    output.mockClear();
    await commandNotice(f.first, f.now(), f.fetcher, false);
    expect(output.mock.calls.flat()).not.toContain("envden: second joined with the recovery kit");
  } finally {
    output.mockRestore();
    await f.close();
  }
});
