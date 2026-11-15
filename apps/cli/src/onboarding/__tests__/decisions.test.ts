import { test, expect } from "bun:test";
import {
  deriveConsent,
  deriveShell,
  deriveAgent,
  addressProblem,
  requireServerAddress,
} from "../decisions.ts";

for (const [value, yes, fallback, expected] of [
  ["on", false, false, { kind: "selected", value: true }],
  ["off", true, true, { kind: "selected", value: false }],
  [undefined, true, true, { kind: "selected", value: true }],
  [undefined, true, false, { kind: "selected", value: false }],
  [undefined, false, true, { kind: "ask" }],
] as const)
  test(`consent ${value} ${yes} ${fallback}`, () => {
    expect(deriveConsent(value, yes, fallback)).toEqual(expected);
  });

for (const shell of ["zsh", "bash", "fish", "powershell", "none", "unknown"])
  test(`shell ${shell}`, () => {
    expect(deriveShell(shell).kind).toBe(["none", "unknown"].includes(shell) ? "skip" : "install");
  });

for (const [agent, yes, kind] of [
  ["on", true, "install"],
  ["off", false, "skip"],
  [undefined, true, "skip"],
  [undefined, false, "ask"],
] as const)
  test(`agent ${agent} ${yes}`, () => {
    expect(deriveAgent(agent, yes).kind).toBe(kind);
  });

test("server addresses accept a bare host and reject anything else", () => {
  for (const [text, address] of [
    ["envden.x.ts.net", "https://envden.x.ts.net"],
    [" envden.x.ts.net/ ", "https://envden.x.ts.net"],
    ["https://envden.x.ts.net/v1", "https://envden.x.ts.net"],
    ["http://127.0.0.1:4783", "http://127.0.0.1:4783"],
  ] as const)
    expect(requireServerAddress(text)).toBe(address);

  for (const text of ["", "https://", "ftp://envden.x.ts.net", "envden x"]) {
    expect(addressProblem(text)).toContain("Not a server address");

    expect(() => requireServerAddress(text)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  }
});
