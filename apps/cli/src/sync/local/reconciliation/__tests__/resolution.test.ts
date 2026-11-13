import { test, expect } from "bun:test";
import { resolveContent } from "../resolution.ts";

const bytes = (text: string) => new TextEncoder().encode(text);
const previous = bytes("A=1\nB=1\n");
const mine = bytes("A=2\nB=1\n");
const server = bytes("A=1\nB=2\n");

for (const [choice, expected] of [
  ["keep-mine", mine],
  ["take-server", server],
] as const)
  test(`explicit ${choice} preserves selected bytes`, async () => {
    expect(
      await resolveContent(
        { options: {} },
        ".env",
        mine,
        server,
        previous,
        async () => choice,
        server,
      ),
    ).toEqual({ kind: "write", next: expected });
  });

test("take-server keeps the existing default when the server is unchanged", async () => {
  expect(
    await resolveContent(
      { options: {} },
      ".env",
      mine,
      previous,
      previous,
      async () => "take-server",
      mine,
    ),
  ).toEqual({ kind: "write", next: mine });
});

for (const accepted of [false, true])
  test(`merge confirmation ${accepted}`, async () => {
    const reports: string[] = [];

    const result = await resolveContent(
      { options: { confirm: async () => accepted, report: (message) => reports.push(message) } },
      ".env",
      mine,
      server,
      previous,
    );

    expect(result.kind).toBe(accepted ? "write" : "conflict");
    expect(reports.length).toBe(accepted ? 2 : 1);
  });

test("missing baseline remains a conflict without confirmation", async () => {
  expect(await resolveContent({ options: { yes: true } }, ".env", mine, server, undefined)).toEqual(
    { kind: "conflict" },
  );
});

test("noninteractive merge never calls confirmation or a chooser", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Prompted");
  };

  expect(
    await resolveContent(
      { options: { interactive: false, confirm: unexpected } },
      ".env",
      mine,
      server,
      previous,
      unexpected,
    ),
  ).toEqual({ kind: "conflict" });
});
