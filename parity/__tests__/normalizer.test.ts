import { describe, expect, test } from "bun:test";
import { Normalizer } from "../normalize/normalizer.ts";
import { terminalText } from "../normalize/terminal.ts";

describe("normalization", () => {
  test("shorter redraws do not retain spinner suffixes", () => {
    expect(terminalText("Found 1 repo...\rFound 1 repo\r\nnext\r\n")).toBe("Found 1 repo\nnext");
  });

  test("one registry across encodings and binary values", () => {
    const n = new Normalizer();
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const first = n.bytes(bytes);
    expect(n.text(Buffer.from(bytes).toString("hex"))).toBe(first);
    expect(n.text(Buffer.from(bytes).toString("base64url"))).toBe(first);
    expect(n.bytes(new Uint8Array(32))).not.toBe(first);
    expect(n.hashStructure(bytes)).toContain(first);
  });

  test("roots, ports, clock, UUIDs and durations vary; ordinary values remain literal", () => {
    const a = new Normalizer();
    const b = new Normalizer();
    a.path("/tmp/a", "home-a");
    b.path("/tmp/b", "home-a");

    expect(a.text("/tmp/a http://127.0.0.1:1234 1794769466981 3ms")).toBe(
      b.text("/tmp/b http://127.0.0.1:5678 1794769467982 40ms"),
    );

    expect(a.text("port=443 count=42 version=1.2.3")).toBe("port=443 count=42 version=1.2.3");
    expect(a.text("00000000000000000001")).toBe("00000000000000000001");
  });

  test("scenario fixtures survive token-looking values", () => {
    const n = new Normalizer();
    const literal = "TOKEN=abcdefghijklmnopqrstuvwxyz0123456789\n";
    n.literal(literal);
    expect(n.text(literal)).toBe(literal);
    expect(n.text("ordinary changed line")).toBe("ordinary changed line");
  });

  test("redraw replaces a spinner frame and keeps finalized text", () => {
    expect(terminalText("\x1b[32m⠋ working\x1b[0m\r\x1b[2KDone\r\n")).toBe("Done");
    expect(terminalText("old\r\n\x1b[1A\r\x1b[2Knew\r\nerror\r\n")).toBe("new\nerror");
  });
});

test("Crockford IDs, short base64 IDs, and path labels retain shared identity", () => {
  const n = new Normalizer();
  const full = new Uint8Array(32).fill(255);
  expect(n.text(`${"Z".repeat(51)}G`)).toBe(n.bytes(full));
  const short = Uint8Array.from({ length: 16 }, (_, i) => i + 100);
  expect(n.text(Buffer.from(short).toString("base64url"))).toBe(n.bytes(short));
  const hash = "a".repeat(64);
  n.path("random-backup-name", `backup:${hash}`);
  expect(n.text("random-backup-name")).toBe(`<PATH:backup:${hash}>`);
});

test("history clock padding varies while other whitespace stays literal", () => {
  const n = new Normalizer();

  expect(n.text("1 second ago (2026-11-16 10:00:00 GMT+0)       device-a")).toBe(
    n.text("12 seconds ago (2026-11-16 10:00:12 GMT+0)      device-a"),
  );

  expect(n.text("ordinary   spacing")).toBe("ordinary   spacing");
});
