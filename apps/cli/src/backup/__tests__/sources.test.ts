import { expect, test } from "bun:test";
import { aliasMap, emptyState } from "../../state/model.ts";
import { backupSources } from "../sources.ts";

const link = (root: string, path: string, store: string) => ({
  root,
  path,
  store,
  mode: "link" as const,
});

const state = {
  ...emptyState("laptop"),
  aliases: Object.assign(aliasMap(), { "github.com/me/fork": "github.com/acme/api" }),
  approved: [
    { root: "/code/api", gitDir: "/code/api/.git", repoId: "github.com/acme/api" },
    { root: "/code/api-wt", gitDir: "/code/api/.git", repoId: "github.com/acme/api" },
    { root: "/code/fork", gitDir: "/code/fork/.git", repoId: "github.com/me/fork" },
  ],
  links: [
    link("/code/api", ".env", "/s/a/.env"),
    link("/code/api-wt", ".env", "/s/a/.env"),
    link("/code/fork", "apps/web/.env", "/s/a/apps/web/.env"),
    link("/code/api", ".env.old", "/old-home/store/a/.env.old"),
    link("/code/gone", ".env", "/s/g/.env"),
  ],
};

test("every store file once, named by its repo or, with no checkout, by its store folder", () => {
  expect(backupSources(state, "/s", ["/s/a/.env", "/s/g/.env", "/s/h/.env.local"])).toEqual({
    sources: [
      { name: "github.com/acme/api/.env", path: "/s/a/.env" },
      { name: "unplaced/g/.env", path: "/s/g/.env" },
      { name: "unplaced/h/.env.local", path: "/s/h/.env.local" },
    ],
    missing: 2,
  });

  expect(backupSources(undefined, "/s", [])).toEqual({ sources: [], missing: 0 });
});

test("an unsafe or shared name, or a damaged link, falls back to the store folder", () => {
  const damaged = {
    ...state,
    links: [
      null as never,
      link("/code/api", "../.env", "/s/a/.env"),
      link("/code/api", ".env", "/s/b/.env"),
      link("/code/fork", ".env", "/s/c/.env"),
    ],
  };

  expect(backupSources(damaged, "/s", ["/s/a/.env", "/s/b/.env", "/s/c/.env"]).sources).toEqual([
    { name: "unplaced/a/.env", path: "/s/a/.env" },
    { name: "unplaced/b/.env", path: "/s/b/.env" },
    { name: "unplaced/c/.env", path: "/s/c/.env" },
  ]);
});
