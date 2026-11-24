import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const code = from(vector.code);

test("recovery code text has a version prefix, five-character groups and a checksum", () => {
  expect(p.encodeRecoveryCode(code)).toBe(vector.recoveryText);
  expect(vector.recoveryText).toMatch(/^ER1(-[0-9A-HJKMNP-TV-Z]{5}){5}-[0-9A-HJKMNP-TV-Z]{4}$/);
  expect(p.decodeRecoveryCode(vector.recoveryText)).toEqual(code);
  expect(p.generateRecoveryCode().length).toBe(16);
});

test("recovery code input ignores case, spacing and lookalike letters", () => {
  const typed = vector.recoveryText.toLowerCase().replaceAll("-", " ").replaceAll("0", "o");

  expect(p.decodeRecoveryCode(` ${typed} `)).toEqual(code);
  expect(p.decodeRecoveryCode(vector.recoveryText.replaceAll("1", "l"))).toEqual(code);
});

test("recovery code checksum catches typos before anything is sent", () => {
  const body = vector.recoveryText.slice(4);
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

  let caught = 0,
    typos = 0;

  for (let i = 0; i < body.length; i++) {
    if (body[i] === "-") continue;

    for (const replacement of alphabet) {
      if (replacement === body[i]) continue;
      typos++;
      const typo = `ER1-${body.slice(0, i)}${replacement}${body.slice(i + 1)}`;

      try {
        p.decodeRecoveryCode(typo);
      } catch (error) {
        expect(error).toMatchObject({ name: "EnvdenError", code: "INVALID_INPUT" });
        caught++;
      }
    }
  }

  expect(caught).toBe(typos);

  for (const bad of [
    vector.recoveryText.slice(4),
    `EK1-${vector.recoveryText.slice(4)}`,
    vector.recoveryText.slice(0, -1),
    `${vector.recoveryText}0`,
    `${vector.recoveryText.slice(0, -1)}U`,
  ])
    expect(() => p.decodeRecoveryCode(bad)).toThrow(
      expect.objectContaining({ name: "EnvdenError", code: "INVALID_INPUT" }),
    );
});

test("proof key derives from the code alone", () => {
  expect(Buffer.from(p.proofPub(code)).toString("hex")).toBe(vector.proofPub);
  expect(p.proofPub(new Uint8Array(16))).not.toEqual(p.proofPub(code));
});
