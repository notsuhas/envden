import { expect, test } from "bun:test";
import { acceptsEnvPath } from "../files.ts";
import { supportedEnvPattern } from "../patterns.ts";

const sixteen = `.env.{${Array.from({ length: 16 }, (_, i) => `a${i}`).join(",")}}`;
const seventeen = `.env.{${Array.from({ length: 17 }, (_, i) => `a${i}`).join(",")}}`;

test.each([
  [".env", true],
  [".env.*", true],
  [".env*", true],
  [".envrc", true],
  ["*", true],
  ["*.example", true],
  ["*.sample", true],
  ["*.template", true],
  ["*.defaults", true],
  ["*.local", true],
  ["secrets.*", true],
  ["**/.env", true],
  ["apps/*/.env", true],
  ["{apps,packages}/**/.env", true],
  ["!.env.example", true],
  ["!**/.env.example", true],
  ["config/.env.?", true],
  [".env.{local,development,production}", true],
  [".env.{local,*}", true],
  [sixteen, true],
  ["a".repeat(1024), true],
  ["", false],
  ["!", false],
  ["!!.env", false],
  [".env.[a-z]*", false],
  [".env\\*", false],
  [".env**", false],
  ["a/**b", false],
  ["{a,{b,c}}", false],
  ["{a,}", false],
  ["*{a,*}", false],
  ["{a,*}*", false],
  [".env.{a..c}", false],
  ["+(.env)", false],
  ["a,b", false],
  ["a}b", false],
  ["a{b", false],
  ["a//b", false],
  ["/.env", false],
  ["apps/", false],
  [".env.é", false],
  [".env.\t", false],
  [".env.{a,b}{a,b}{a,b}{a,b}{a,b}", false],
  [seventeen, false],
  ["a".repeat(1025), false],
])("env file pattern %j supported: %p", (pattern, supported) => {
  expect(supportedEnvPattern(pattern)).toBe(supported);
});

test("matching refuses a pattern outside the grammar", () => {
  expect(acceptsEnvPath(".env.local", { include: [".env.?????"] })).toBe(true);
  expect(acceptsEnvPath(".env.é", { include: [".env.?"] })).toBe(true);

  expect(() => acceptsEnvPath(".env", { include: [".env.[a-z]"] })).toThrow(
    expect.objectContaining({ code: "INVALID_INPUT", message: "Unsupported env file pattern" }),
  );
});
