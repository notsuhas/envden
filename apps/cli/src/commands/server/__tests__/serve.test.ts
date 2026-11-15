import { expect, test } from "bun:test";
import { serveCommand, setupTokenFrom } from "../serve.ts";

test("the setup token comes from the environment, never argv", () => {
  const env: Record<string, string | undefined> = { ENVDEN_SETUP_TOKEN: "token" };

  expect(setupTokenFrom(env)).toEqual({ setupToken: "token" });
  expect(env.ENVDEN_SETUP_TOKEN).toBeUndefined();
  expect(setupTokenFrom({})).toEqual({});
  expect(serveCommand.options.map((option) => option.long)).not.toContain("--setup-token");
});
