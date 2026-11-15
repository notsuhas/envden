import { test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import * as questions from "../../output/questions.ts";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { runJoin } from "../join.ts";

const fixtureClock = () => 1800000000000;

test("a fresh pairing ignores the abandoned server pin", async () => {
  const f = await fixture();
  const stop = new Error("stop at code entry");
  const prompt = spyOn(questions, "secret").mockRejectedValue(stop);

  try {
    const home = f.home("abandoned");

    await atomicWrite(
      join(home.home, "state", "pair-pin"),
      Buffer.from(p.randomBytes(32)).toString("base64url"),
      fixtureClock,
    );

    await Promise.resolve(
      expect(runJoin(home, f.result.kit.server, { name: "new name" }, f.now)).rejects.toBe(stop),
    );

    expect(await readFile(join(home.home, "state", "pair-pin"), "utf8")).toBe(
      f.result.state.server!.pin,
    );
  } finally {
    prompt.mockRestore();
    await f.close();
  }
});
