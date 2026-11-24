import { fixture } from "./fixture.ts";
import * as protocol from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { test, expect, spyOn } from "bun:test";
import { recoveryJoin } from "../../../vault/recovery/join.ts";
import { adminContext } from "../../shared/context.ts";
import { rotateVault } from "../../devices/rotate.ts";
import { removeDevice } from "../../devices/remove.ts";
import { replaceCode } from "../replace.ts";

test("rotate and remove need only a member, and revoke the removed device", async () => {
  const f = await fixture(["second"]);

  try {
    const second = f.joined.second!;

    await rotateVault(f.first, f.now);
    expect(await removeDevice(f.first, "second", f.now)).toMatchObject({ recommendNewCode: true });
    const removed = await adminContext(second, f.now);

    await Promise.resolve(
      expect(removed.client.request("/v1/head")).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    );

    await Promise.resolve(
      expect(removeDevice(f.first, "first", f.now)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      }),
    );
  } finally {
    await f.close();
  }
});

test("a new recovery code opens the vault and the old one stops working", async () => {
  const f = await fixture();

  try {
    let code = "";

    const replaced = await replaceCode(f.first, f.now, async (shown) => {
      code = shown;
    });

    expect(replaced.kind).toBe("replaced");
    expect(code).not.toBe(f.result.code);

    await Promise.resolve(
      expect(f.joinHome("old-code")).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    );

    const joined = await f.joinHome("new-code", code);
    expect(joined.vaultId).toBe(f.result.vaultId);

    const future = new EnvdenError("UPDATE_REQUIRED", "Future envelope");

    const open = spyOn(protocol, "openEnvelope").mockImplementation(() => {
      throw future;
    });

    try {
      await Promise.resolve(expect(f.joinHome("future", code)).rejects.toBe(future));
    } finally {
      open.mockRestore();
    }
  } finally {
    await f.close();
  }
});

test("a mistyped code is refused before anything is sent", async () => {
  const f = await fixture();

  try {
    const typo = f.result.code.slice(0, -1) + (f.result.code.endsWith("0") ? "1" : "0");

    await Promise.resolve(
      expect(f.joinHome("typo", typo)).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );
  } finally {
    await f.close();
  }
});

test("recovery join resumes after its swap commits but key storage fails", async () => {
  const f = await fixture();

  try {
    const home = f.home("crashed-join");
    const set = home.keychain.set.bind(home.keychain);
    let interrupted = false;

    home.keychain.set = async (slot, value) => {
      if (!interrupted && slot.endsWith("/epoch/1")) {
        interrupted = true;
        throw new Error("injected storage failure");
      }

      await set(slot, value);
    };

    const options = {
      address: f.result.address,
      code: f.result.code,
      name: "crashed-join",
      now: f.now,
      fetcher: f.fetcher,
    };

    await Promise.resolve(expect(recoveryJoin(home, options)).rejects.toThrow());
    expect(interrupted).toBe(true);
    expect((await recoveryJoin(home, options)).vaultId).toBe(f.result.vaultId);
  } finally {
    await f.close();
  }
});

for (const lost of ["response", "request"])
  test(`code replacement shows the code before a lost ${lost} and settles on rerun`, async () => {
    const f = await fixture();

    try {
      const shown: string[] = [];
      let interrupted = false;

      const fetcher: typeof f.fetcher = async (input, init) => {
        const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;

        if (interrupted || path !== "/v1/swap") return f.fetcher(input, init);
        interrupted = true;
        if (lost === "request") throw new Error("injected network failure");
        await f.fetcher(input, init);

        throw new Error("injected lost response");
      };

      const replace = (via: typeof f.fetcher) =>
        replaceCode(
          f.first,
          f.now,
          async (code) => {
            shown.push(code);
          },
          via,
        );

      await Promise.resolve(expect(replace(fetcher)).rejects.toThrow());
      expect(shown).toHaveLength(1);

      const rerun = await replace(f.fetcher);
      expect(rerun.kind).toBe(lost === "response" ? "finished" : "replaced");
      expect(shown).toHaveLength(lost === "response" ? 1 : 2);

      const joined = await f.joinHome("after", shown.at(-1)!);
      expect(joined.vaultId).toBe(f.result.vaultId);
    } finally {
      await f.close();
    }
  });
