import { describe, expect, test } from "bun:test";
import { Normalizer } from "../normalize/normalizer.ts";
import { terminalText } from "../normalize/terminal.ts";

describe("normalization", () => {
  test("carriage return overwrites without erasing the rest of the line", () => {
    expect(terminalText("Found 1 repo...\rFound 1 repo\r\nnext\r\n")).toBe("Found 1 repo...\nnext");
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

test("relative times normalize across minute and hour boundaries", () => {
  const n = new Normalizer();
  expect(n.text("2 minutes ago")).toBe(n.text("59 seconds ago"));
  expect(n.text("1 hour ago")).toBe(n.text("3 minutes ago"));
});

for (const duration of ["10m0s", "5s", "1h", "2m", "1h2m3s", "1h0m0.5s", "2m0.25s"])
  test(`native duration ${duration} matches relative time in either direction`, () => {
    const n = new Normalizer();

    for (const relative of ["3 minutes ago", "less than a minute ago", "about 1 hour ago"])
      expect(n.text(`${duration} ago`)).toBe(n.text(relative));

    expect(n.text(`wait ${duration}`)).toBe("wait <DURATION>");
    expect(n.text(`${duration} ago file-a`)).not.toBe(n.text("3 minutes ago file-b"));
  });

test("duration normalization preserves identifiers containing units", () => {
  expect(new Normalizer().text("item5s v1h file-2m.txt")).toBe("item5s v1h file-2m.txt");
});

test("clack erases option and hint rows before writing the join outcome", () => {
  const raw =
    "\u001b[?25l\u001b[90m│\u001b[39m\r\n\u001b[36m◆\u001b[39m  Sync env files for these checkouts?\r\n\u001b[36m│\u001b[39m  \u001b[32m◼\u001b[39m ~/app (files from the vault)\r\n\u001b[36m│\u001b[39m  \u001b[2m↑/↓\u001b[22m to navigate • \u001b[2mSpace:\u001b[22m select • \u001b[2mEnter:\u001b[22m confirm\r\n\u001b[36m└\u001b[39m\r\n\u001b[999D\u001b[5A\u001b[1B\u001b[J\u001b[32m◇\u001b[39m  Sync env files for these checkouts?\r\n\u001b[90m│\u001b[39m  \u001b[2m~/app (files from the vault)\u001b[22m\r\n\u001b[?25hJoined as device-b. Synced 1 env file in ~/app.\r\n";

  expect(terminalText(raw)).toBe(
    "│\n◇  Sync env files for these checkouts?\n│  ~/app (files from the vault)\nJoined as device-b. Synced 1 env file in ~/app.",
  );
});

for (const [raw, expected] of [
  ["abcdef\rxy", "xycdef"],
  ["abcdef\x1b[1Gxy", "xycdef"],
  ["abcdef\rxy\x1b[K", "xy"],
  ["above\r\nbelow\x1b[1A\r\x1b[Jnew", "new"],
  ["abcdef\x1b[3G\x1b[1Kx", "  xdef"],
  ["above\r\nbelow\x1b[3G\x1b[1Jx", "\n  xow"],
  ["above\r\nbelow\x1b[2Jx", "\n     x"],
] satisfies [string, string][])
  test(`terminal cursor and erase semantics: ${JSON.stringify(raw)}`, () => {
    expect(terminalText(raw)).toBe(expected);
  });

test("a hash whose hex holds a clock-like digit run stays one value", () => {
  const n = new Normalizer();
  const hash = "88d5c3f7c08f1ef5ab54b5002046b1794769466981f44643a63d8ccd635b3b90";

  expect(n.text(`["${hash}"]`)).toBe(`["${n.bytes(Buffer.from(hash, "hex"))}"]`);
  expect(n.text('{"unlockedUntil":1794769466981}')).toBe('{"unlockedUntil":<TIME>}');
});

test("recovery kit PDF suffixes keep identity but not their random letters", () => {
  const a = new Normalizer();
  const b = new Normalizer();

  const kit = (suffix: string, other: string) =>
    `envden Recovery Kit ${suffix}.pdf envden Recovery Kit ${other}.pdf envden Recovery Kit ${suffix}.pdf`;

  expect(a.text(kit("6T5692", "AB12CD"))).toBe(b.text(kit("19SPGR", "ZZ99ZZ")));

  expect(new Normalizer().text(kit("6T5692", "AB12CD"))).not.toBe(
    new Normalizer().text(kit("6T5692", "6T5692")),
  );
});
