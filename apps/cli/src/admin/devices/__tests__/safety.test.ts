import { test, expect } from "bun:test";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { adminContext } from "../../shared/context.ts";
import { currentHistory } from "../../shared/history.ts";
import { exposedNames } from "../exposure.ts";
import { removeDevice } from "../remove.ts";
import { listDevices } from "../list.ts";

test("device removal asks about recovery keys before committing", async () => {
  const f = await fixture(["second"]);

  try {
    const second = f.joined.second!;
    let asked = false;

    await removeDevice(second, "first", "old password", f.now, f.fetcher, false, async () => {
      asked = true;

      expect((await listDevices(second, f.now)).some((device) => device.name === "first")).toBe(
        true,
      );

      return false;
    });

    expect(asked).toBe(true);

    expect((await listDevices(second, f.now)).some((device) => device.name === "first")).toBe(
      false,
    );
  } finally {
    await f.close();
  }
});

test("exposure downloads identical historical file lists once", async () => {
  const f = await fixture();

  try {
    const context = await adminContext(f.first, f.now);
    const history = await currentHistory(context);
    history.headers.push(...history.headers);
    const original = context.client.request;
    let downloads = 0;

    context.client.request = (...args) => {
      if (args[0].startsWith("/v1/files/")) downloads++;

      return original(...args);
    };

    await exposedNames(context, history);
    expect(downloads).toBe(1);
  } finally {
    await f.close();
  }
});

test("unknown device does not ask for credentials and confirmation precedes removal", async () => {
  const f = await fixture(["second"]);

  try {
    let passwords = 0;

    await Promise.resolve(
      expect(
        removeDevice(
          f.first,
          "missing",
          async () => {
            passwords++;

            return "old password";
          },
          f.now,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" }),
    );

    expect(passwords).toBe(0);
    const second = f.joined.second!;
    let confirmed = false;

    await Promise.resolve(
      expect(
        removeDevice(
          second,
          "first",
          async () => "old password",
          f.now,
          f.fetcher,
          false,
          undefined,
          async (exposure) => {
            confirmed = true;
            expect(exposure.files).toEqual([]);

            expect(
              (await listDevices(second, f.now)).some((device) => device.name === "first"),
            ).toBe(true);

            return false;
          },
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

    expect(confirmed).toBe(true);
    expect((await listDevices(second, f.now)).some((device) => device.name === "first")).toBe(true);
  } finally {
    await f.close();
  }
});

test("a dropped rotation acknowledgement cannot advance the local checkpoint", async () => {
  const { rotateVault } = await import("../rotate.ts");
  const f = await fixture();

  try {
    const fetcher: typeof f.fetcher = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/v1/swap") return Response.json({ ok: true });

      return f.fetcher(input, init);
    };

    await Promise.resolve(
      expect(rotateVault(f.first, "old password", f.now, fetcher)).rejects.toMatchObject({
        code: "INVALID_DATA",
      }),
    );
  } finally {
    await f.close();
  }
});

test("checkpoint advances reject a signed header with an invalid operation shape", async () => {
  const p = await import("@envden/core/protocol");
  const { acceptJoin } = await import("../../../vault/join/accept.ts");
  const f = await fixture();

  try {
    const context = await adminContext(f.first, f.now);
    const history = await currentHistory(context);
    const previous = history.headers.at(-1)!;

    const header = p.signObject(
      p.ManifestHeaderCodec,
      {
        ...previous.body,
        seq: previous.body.seq + 1n,
        prev: p.objectHash(p.ManifestHeaderCodec, previous, "manifest"),
        op: 1,
      },
      context.identity.keys.objSk,
      "manifest",
    );

    history.headers.push(header);

    const { createClient } = await import("../../../client/request.ts");

    const client = createClient({
      address: f.result.kit.server,
      pin: history.state.serverPin,
      vaultId: context.vaultId,
      identity: context.identity,
      now: f.now,
      version: "0.1.0",
      fetcher: async (input, init) => {
        if (
          new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/head"
        )
          return new Response(p.signedCodec(p.ManifestHeaderCodec).write(header));

        return f.fetcher(input, init);
      },
    });

    await Promise.resolve(
      expect(
        acceptJoin(
          f.first,
          client,
          context.identity,
          f.result.kit.server,
          history.state.serverPin,
          history,
          p.objectHash(p.ManifestHeaderCodec, header, "manifest"),
        ),
      ).rejects.toMatchObject({ code: "INVALID_DATA" }),
    );
  } finally {
    await f.close();
  }
});
