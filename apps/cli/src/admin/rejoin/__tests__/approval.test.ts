import { expect, spyOn, test } from "bun:test";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import * as questions from "../../../output/prompts/questions.ts";
import { atomicWrite, optionalRead } from "../../../state/store/files.ts";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { runRejoin } from "../run.ts";

const fixtureClock = () => 1800000000000;

test("rejoin clears the abandoned join request and asks for the words without the state lock", async () => {
  const f = await fixture();
  const stop = new Error("stop at the words");
  const state = join(f.first.home, "state");
  let locked: unknown;

  const prompt = spyOn(questions, "consent").mockImplementation(async () => {
    locked = await lstat(join(state, "write.lock")).catch(() => undefined);

    throw stop;
  });

  const log = spyOn(console, "log").mockImplementation(() => {});

  try {
    await atomicWrite(join(state, "join-request"), "{}", fixtureClock);
    const rejoining = runRejoin(f.first, f.result.address, { name: "again" }, f.now);
    const { runDeviceApprove } = await import("../../../onboarding/approve.ts");

    const { adminContext } = await import("../../shared/context.ts");
    const { joinRequests } = await import("../../../approval/approver.ts");
    const member = (await adminContext(f.first, f.now)).client;

    while (!(await joinRequests(member)).length)
      await new Promise((resolve) => setTimeout(resolve, 1));

    expect(await optionalRead(join(state, "join-request"))).toBeUndefined();

    await runDeviceApprove(f.first, f.now, undefined, {
      confirm: async () => false,
      report: () => {},
      choose: async () => 1,
      pause: () => new Promise((resolve) => setTimeout(resolve, 1)),
    }).catch(() => {});

    await Promise.resolve(expect(rejoining).rejects.toBe(stop));
    expect(locked).toBeUndefined();
  } finally {
    prompt.mockRestore();
    log.mockRestore();
    await f.close();
  }
});

test("rejoin --resume without a saved join fails without asking for a name", async () => {
  const f = await fixture();
  const name = spyOn(questions, "input").mockRejectedValue(new Error("asked for a name"));

  try {
    await Promise.resolve(
      expect(runRejoin(f.first, f.result.address, { resume: true }, f.now)).rejects.toMatchObject({
        code: "NOT_FOUND",
      }),
    );
  } finally {
    name.mockRestore();
    await f.close();
  }
});
