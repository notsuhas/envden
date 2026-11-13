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
  expect(() => p.b16.write(new Uint8Array(15))).toThrow();
});

test("trailing, truncated and excessive lengths", () => {
  expect(() => p.decode(p.u8, Uint8Array.of(1, 2))).toThrow();
  expect(() => p.decode(p.u32, new Uint8Array(3))).toThrow();
  expect(() => p.decode(p.bytes, p.u32.write(65537))).toThrow();
  expect(() => p.decode(p.bytes, p.concat(p.u32.write(2), Uint8Array.of(1)))).toThrow();
  expect(() => p.bytes.write(new Uint8Array(65537))).toThrow();
  expect(() => p.blob.write(new Uint8Array(2097153))).toThrow();
});

test("option flags and list limits", () => {
  expect(() => p.decode(p.opt(p.u8), Uint8Array.of(2))).toThrow();
  expect(() => p.decode(p.list(p.u8), p.u32.write(100001))).toThrow();
  expect(() => p.list(p.u8).write(Array.from({ length: 100001 }, () => 0))).toThrow();

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

test("UTF-8, NFC, controls and passwords", () => {
  for (const s of ["e\u0301", "a\n", "\u0000", "\u0085", "\ud800"])
    expect(() => p.str.write(s)).toThrow();

  expect(() => p.decode(p.str, p.bytes.write(Uint8Array.of(0xff)))).toThrow();
  expect(() => p.decode(p.str, p.bytes.write(enc.encode("e\u0301")))).toThrow();
  expect(p.decode(p.str, p.str.write("é"))).toBe("é");
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
  bad[255] = 1;
  expect(() => p.decodePadded(c, bad)).toThrow();
  expect(() => p.decodePadded(c, p.concat(data, new Uint8Array(256)))).toThrow();
  expect(p.pad(new Uint8Array(256)).length).toBe(256);
});

test("path normalization rejects aliases", () => {
  for (const path of ["", "/a", "a/", "a//b", "../../__tests__/a", "a/../b", "a\\b", "e\u0301"])
    expect(() => p.fileId(new Uint8Array(32), "repo", path)).toThrow();

  expect(p.fileId(new Uint8Array(32), "repo", "A")).not.toEqual(
    p.fileId(new Uint8Array(32), "repo", "a"),
  );
});

test("semver uses arbitrary precision and digits only", () => {
  expect(p.compareSemver("1.10.0", "1.2.0")).toBe(1);
  expect(p.compareSemver("01.0.0", "1.0.0")).toBe(0);
  for (const v of ["1.2", "v1.2.3", "1.2.3-a", "-1.2.3"]) expect(() => p.parseSemver(v)).toThrow();
});

test("decoders reject oversized blobs, invalid string encodings and controls", () => {
  expect(() => p.decode(p.blob, p.u32.write(2097153))).toThrow();

  for (const text of ["\n", "\u0000", "\u0085", "e\u0301"])
    expect(() => p.decode(p.str, p.bytes.write(enc.encode(text)))).toThrow();

  for (const bytes of [
    Uint8Array.of(0xc0, 0x80),
    Uint8Array.of(0xed, 0xa0, 0x80),
    Uint8Array.of(0xe2),
  ])
    expect(() => p.decode(p.str, p.bytes.write(bytes))).toThrow();

  expect(() => p.u64.write(2n ** 64n)).toThrow();
});

test("UTF-8 BOM is a preserved string character", () => {
  expect(p.decode(p.str, p.str.write("\uFEFFhello"))).toBe("\uFEFFhello");
});
