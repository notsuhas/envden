import { test, expect } from "bun:test";
import * as p from "../../index.ts";

const enc = new TextEncoder();

test("integer widths, endian and limits", () => {
  expect([...p.u32.write(0x01020304)]).toEqual([1, 2, 3, 4]);
  const buffer = Buffer.from([99, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 42]);

  expect(p.decode(p.u32, buffer.subarray(1, 5))).toBe(0x01020304);
  expect(p.decode(p.u64, buffer.subarray(5))).toBe(42n);
  expect(p.decode(p.u64, p.u64.write(0xffffffffffffffffn))).toBe(0xffffffffffffffffn);
  for (const v of [-1, 256, 1.1]) expect(() => p.u8.write(v)).toThrow();
  expect(() => p.u32.write(2 ** 32)).toThrow();
  expect(() => p.u64.write(-1n)).toThrow();
  expect(() => p.u64.write(2n ** 64n)).toThrow();
  expect(() => p.b16.write(new Uint8Array(15))).toThrow();
});

test("trailing, truncated and excessive lengths", () => {
  expect(() => p.decode(p.u8, Uint8Array.of(1, 2))).toThrow();
  expect(() => p.decode(p.u32, new Uint8Array(3))).toThrow();
  expect(() => p.decode(p.bytes, p.concat(p.u32.write(65537), new Uint8Array(65537)))).toThrow();
  expect(() => p.decode(p.bytes, p.concat(p.u32.write(2), Uint8Array.of(1)))).toThrow();
  expect(() => p.bytes.write(new Uint8Array(65537))).toThrow();
  expect(() => p.blob.write(new Uint8Array(2097153))).toThrow();
  expect(() => p.decode(p.blob, p.concat(p.u32.write(2097153), new Uint8Array(2097153)))).toThrow();
});

test("option flags and list limits", () => {
  expect(() => p.decode(p.opt(p.u8), Uint8Array.of(2))).toThrow();

  let decoded = 0;

  const counted = {
    ...p.u8,
    read: (reader: Parameters<typeof p.u8.read>[0]) => {
      decoded++;

      return p.u8.read(reader);
    },
  };

  expect(() =>
    p.decode(p.list(counted), p.concat(p.u32.write(100001), new Uint8Array(100001))),
  ).toThrow(expect.objectContaining({ code: "INVALID_DATA" }));

  expect(decoded).toBe(0);

  expect(() => p.list(p.u8).write(Array.from({ length: 100001 }, () => 0))).toThrow(
    expect.objectContaining({ code: "INVALID_DATA" }),
  );

  for (const values of [
    [2, 1],
    [1, 1],
  ])
    expect(() => p.list(p.u8, (a, b) => a - b).write(values)).toThrow();

  expect(() =>
    p.decode(
      p.list(p.u8, (a, b) => a - b),
      Uint8Array.of(0, 0, 0, 2, 2, 1),
    ),
  ).toThrow();
});

test("string encoding validates UTF-8, normalization and controls", () => {
  for (const value of ["e\u0301", "a\n", "\u0000", "\u0085", "\ud800"])
    expect(() => p.str.write(value)).toThrow();

  for (const bytes of [
    ...["\n", "\u0000", "\u0085", "e\u0301"].map((text) => enc.encode(text)),
    Uint8Array.of(0xff),
    Uint8Array.of(0xc0, 0x80),
    Uint8Array.of(0xed, 0xa0, 0x80),
    Uint8Array.of(0xe2),
  ])
    expect(() => p.decode(p.str, p.bytes.write(bytes))).toThrow(
      expect.objectContaining({ code: "INVALID_DATA" }),
    );

  for (const value of ["é", "\uFEFFhello"]) expect(p.decode(p.str, p.str.write(value))).toBe(value);

  expect(p.normPw(" Ａ ")).toBe(" A ");
  expect(() => p.normPw("")).toThrow();
});

test("Crockford base32 canonical lengths and trailing bits", () => {
  for (let n = 0; n < 40; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => i);
    expect(p.unbase32(p.base32(bytes).toLowerCase())).toEqual(bytes);
  }

  for (const text of ["0", "000", "000000", "01", "0!", "OO"])
    expect(() => p.unbase32(text)).toThrow();
});

test("padding is minimal, aligned and zero", () => {
  const c = p.bytes,
    data = p.pad(p.encode(c, Uint8Array.of(1)));

  expect(data.length).toBe(256);
  expect(p.decodePadded(c, data)).toEqual(Uint8Array.of(1));
  expect(() => p.decodePadded(c, data.slice(0, 255))).toThrow();
  const bad = data.slice();
  const finalPaddingByte = bad.length - 1;
  bad[finalPaddingByte] = 1;
  expect(() => p.decodePadded(c, bad)).toThrow();
  expect(() => p.decodePadded(c, p.concat(data, new Uint8Array(256)))).toThrow();
  expect(p.pad(new Uint8Array(256)).length).toBe(256);
});

test("semver uses arbitrary precision and digits only", () => {
  expect(p.compareSemver("1.10.0", "1.2.0")).toBe(1);
  expect(p.parseSemver("0.0.0")).toEqual([0n, 0n, 0n]);

  for (const v of ["1.2", "v1.2.3", "1.2.3-a", "-1.2.3", "01.2.3", "1.02.3", "1.2.03"]) {
    expect(p.isSemver(v)).toBe(false);
    expect(() => p.parseSemver(v)).toThrow();
  }
});

test("base32 and pairing reject Unicode case folding", () => {
  expect(() => p.unbase32("ſ0")).toThrow();
  expect(() => p.normalizePairingCode("1-ſ000-0000")).toThrow();
});
