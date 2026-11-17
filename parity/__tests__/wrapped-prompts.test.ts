import { expect, test } from "bun:test";
import { Normalizer } from "../normalize/normalizer.ts";
import { observeOutput } from "../runtime/context/observations.ts";

const home =
  "/var/folders/abcdefghijklmnopqrstuvwxyz/abcdefghijklmnopqrstuvwxyz/T/envden-parity-dZ9KYz/a/home";

const title = `Restore ${home}/app/.env to version 1? added API_URL; changed TOKEN`;

const screen =
  "┃ Restore\n┃ /var/folders/abcdefghijklmnopqrstuvwxyz/abcdefghijklmnopqrstuvwxyz/T/envden-\n┃ parity-dZ9KYz/a/home/app/.env to version 1? added API_URL; changed TOKEN\n┃\n┃                                 Yes     No";

function observation(prompt: string) {
  const normalizer = new Normalizer();
  normalizer.path(home, "home-a");

  return observeOutput(
    "restore",
    {
      stdout: `${title}\n  Yes\nRestored 1 file`,
      stderr: "",
      code: 0,
      conversation: [{ screen: prompt, prompts: [], answer: "y" }],
    },
    "pty",
    normalizer,
    [],
  );
}

test("a long Go restore title keeps its complete question across a wrapped temporary path", () => {
  const one = observation(`${title}\n● Yes / ○ No`);

  expect(observation(screen)).toEqual(one);

  expect(JSON.parse(one["restore/conversation"]!)[0].prompts).toEqual([
    "restore path home a app env to version 1 added api url changed token",
  ]);

  expect(JSON.parse(one["restore/stdout"]!).prompts).toEqual([]);

  for (const [before, after] of [
    [".env", ".env.other"],
    ["version 1", "version 2"],
    ["TOKEN", "OTHER"],
    ["parity-dZ9KYz", "parity-OTHER"],
    ["Restore", "Ready"],
  ] satisfies [string, string][])
    expect(observation(screen.replace(before, after))).not.toEqual(one);

  expect(observation(`${screen}\nReady?`)).not.toEqual(one);
});

test("wrapped path normalization is confined to registered terminal paths", () => {
  const normalizer = new Normalizer();
  normalizer.path("/tmp/known/home", "home-a");
  const wrapped = "┃ /tmp/known/\n┃ home/app/.env";

  expect(normalizer.terminal(wrapped)).toBe("┃ <PATH:home-a>/app/.env");
  expect(normalizer.text(wrapped)).toBe(wrapped);

  expect(normalizer.terminal(wrapped.replace("known", "other"))).toBe(
    "┃ /tmp/other/\n┃ home/app/.env",
  );
});
