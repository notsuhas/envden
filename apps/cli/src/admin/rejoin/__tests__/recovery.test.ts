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
    expect((await loadState(adapters.home))?.deviceName).toBe("pasted");
    expect(promptSecret.mock.calls.some(([label]) => label === "Recovery secret key")).toBe(true);
  } finally {
    promptInput.mockRestore();
    promptSecret.mockRestore();
    await f.close();
  }
});
