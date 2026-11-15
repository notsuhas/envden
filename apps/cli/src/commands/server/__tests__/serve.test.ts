import { expect, test } from "bun:test";
import { InvalidArgumentError } from "@commander-js/extra-typings";
import { serveCommand, setupTokenFrom } from "../serve.ts";
import { parsePort } from "../port.ts";

test("the setup token comes from the environment, never argv", () => {
  const env: Record<string, string | undefined> = { ENVDEN_SETUP_TOKEN: "token" };

  expect(setupTokenFrom(env)).toEqual({ setupToken: "token" });
  expect(env.ENVDEN_SETUP_TOKEN).toBeUndefined();
  expect(setupTokenFrom({})).toEqual({});
  expect(serveCommand.options.map((option) => option.long)).not.toContain("--setup-token");
});

test("--port takes a decimal port from 1 to 65535", () => {
  const parse = (value: string) => parsePort(value);

  expect(["1", "8080", "65535"].map(parse)).toEqual([1, 8080, 65535]);

  for (const value of ["0", "65536", "0x10", "abc", "1e3", "80.5", "-1", " 80", ""])
    expect(() => parse(value)).toThrow(InvalidArgumentError);
});
