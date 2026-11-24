import { expect, test } from "bun:test";
import { emptyState } from "../../../state/model.ts";
import { chooseSendFile, sendCandidates } from "../candidates.ts";
import { shareMinutes } from "../ttl.ts";

const link = (root: string, path: string, localOnly = false) => ({
  root,
  path,
  store: `/store/${path}`,
  mode: "link" as const,
  ...(localOnly ? { localOnly: true as const } : {}),
});

const state = {
  ...emptyState("laptop"),
  approved: [
    { root: "/code/app", gitDir: "/code/app/.git", repoId: "a" },
    { root: "/code/app/vendor/lib", gitDir: "/code/app/vendor/lib/.git", repoId: "b" },
    { root: "/code/one", gitDir: "/code/one/.git", repoId: "c" },
  ],
  links: [
    link("/code/app", ".env.local"),
    link("/code/app", ".env"),
    link("/code/app", ".env.port", true),
    link("/code/app/vendor/lib", ".env"),
    link("/code/one", ".env"),
  ],
};

test("candidates are the synced env files of the deepest checkout around the folder", () => {
  expect(sendCandidates(state, "/code/app/src")).toEqual([
    "/code/app/.env",
    "/code/app/.env.local",
  ]);

  expect(sendCandidates(state, "/code/app/vendor/lib")).toEqual(["/code/app/vendor/lib/.env"]);
  expect(sendCandidates(state, "/elsewhere")).toEqual([]);
  expect(sendCandidates(undefined, "/code/app")).toEqual([]);
});

test("a named file wins, one candidate is used, several are asked, and no terminal needs a name", async () => {
  const asked: string[][] = [];

  const choose = async (_message: string, options: { value: string; label: string }[]) => {
    asked.push(options.map((option) => option.label));

    return options[1]!.value;
  };

  const pick = (cwd: string, interactive: boolean, file?: string) =>
    chooseSendFile(state, { cwd, interactive, ...(file ? { file } : {}) }, choose);

  expect(await pick("/code/app", false, "secrets/.env")).toBe("/code/app/secrets/.env");
  expect(await pick("/code/one", true)).toBe("/code/one/.env");
  expect(await pick("/code/app", true)).toBe("/code/app/.env.local");
  expect(asked).toEqual([[".env", ".env.local"]]);

  for (const [cwd, interactive] of [
    ["/code/one", false],
    ["/elsewhere", true],
  ] as const)
    await Promise.resolve(
      expect(pick(cwd, interactive)).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );
});

test("the link stays open for 1 to 60 whole minutes", () => {
  expect(shareMinutes("10")).toBe(10);

  for (const value of ["0", "61", "1.5", "-1", "ten", ""])
    expect(() => shareMinutes(value)).toThrow("--ttl takes whole minutes from 1 to 60");
});
