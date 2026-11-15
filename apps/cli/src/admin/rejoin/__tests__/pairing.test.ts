import { expect, spyOn, test } from "bun:test";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import * as questions from "../../../output/questions.ts";
import { atomicWrite, optionalRead } from "../../../state/store/files.ts";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { runRejoin } from "../run.ts";

const fixtureClock = () => 1800000000000;

test("rejoin clears the abandoned exchange and prompts without the state lock", async () => {
  const f = await fixture();
  const stop = new Error("stop at code entry");
  const state = join(f.first.home, "state");
  let locked: unknown;

  const prompt = spyOn(questions, "secret").mockImplementation(async () => {
    locked = await lstat(join(state, "write.lock")).catch(() => undefined);

    throw stop;
  });

  try {
    await f.first.keychain.set(`envden/${f.first.home}/pair-receive`, p.randomBytes(32));
    await atomicWrite(join(state, "pair-joiner"), "{}", fixtureClock);
    await atomicWrite(join(state, "pair-expiry"), "0", fixtureClock);
    await atomicWrite(join(state, "pair-pin"), "abandoned", fixtureClock);

    await Promise.resolve(
      expect(runRejoin(f.first, f.result.kit.server, { name: "again" }, f.now)).rejects.toBe(stop),
    );

    expect(locked).toBeUndefined();
    expect(await f.first.keychain.get(`envden/${f.first.home}/pair-receive`)).toBeUndefined();
    expect(await optionalRead(join(state, "pair-joiner"))).toBeUndefined();
    expect(await optionalRead(join(state, "pair-expiry"))).toBeUndefined();
    expect(await optionalRead(join(state, "pair-pin"))).toBe(f.result.state.server!.pin);
  } finally {
    prompt.mockRestore();
    await f.close();
  }
});

test("rejoin --resume checks the stored server pin without asking for a name", async () => {
  const f = await fixture();
  const name = spyOn(questions, "input").mockRejectedValue(new Error("asked for a name"));

  try {
    await f.first.keychain.set(`envden/${f.first.home}/pair-receive`, p.randomBytes(32));

    await atomicWrite(
      join(f.first.home, "state", "pair-pin"),
      Buffer.from(p.randomBytes(32)).toString("base64url"),
      fixtureClock,
    );

    await Promise.resolve(
      expect(
        runRejoin(f.first, f.result.kit.server, { resume: true }, f.now),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    );
  } finally {
    name.mockRestore();
    await f.close();
  }
});
