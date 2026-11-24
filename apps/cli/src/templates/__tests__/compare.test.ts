import { expect, test } from "bun:test";
import { templateDrift } from "../compare.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

for (const [name, env, template, missing, extra] of [
  ["none", "A=1\nB=2\n", "A=\nB=\n", [], []],
  ["missing", "A=1\n", "A=\nSTRIPE_KEY=\nDB_URL=\n", ["STRIPE_KEY", "DB_URL"], []],
  ["extra", "A=1\nDEBUG=1\n", "A=\n", [], ["DEBUG"]],
  ["both", "A=1\nDEBUG=1\n", "A=\nB=\n", ["B"], ["DEBUG"]],
  ["no template", "A=1\n", undefined, [], []],
  ["duplicate keys", "A=1\nA=2\n# B=old\nB=new\n", "A=\nA=\nB=\nC=\n", ["C"], []],
  ["commented template key", "A=1\nOPTIONAL=1\n", "A=\n# OPTIONAL=\n# LATER=\n", [], []],
  ["commented env key", "# A=1\n", "A=\n", ["A"], []],
  ["unparsable template", "A=1\n", "A\n", [], []],
] as const)
  test(`template drift: ${name}`, () => {
    expect(templateDrift(bytes(env), template === undefined ? undefined : bytes(template))).toEqual(
      { missing: [...missing], extra: [...extra] },
    );
  });
