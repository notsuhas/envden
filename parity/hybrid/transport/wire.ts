import { strict as assert } from "node:assert";

export function comparable(bytes: Buffer) {
  const boundary = bytes.indexOf("\r\n\r\n");
  assert.ok(boundary >= 0, "complete HTTP response");
  const lines = bytes.subarray(0, boundary).toString().split("\r\n");
  const headers = lines.slice(1).filter((line) => !/^(date|connection|keep-alive):/i.test(line));

  return { status: lines[0], headers, body: bytes.subarray(boundary + 4).toString("base64") };
}

export function comparableMany(bytes: Buffer) {
  const results = [];
  let offset = 0;

  while (offset < bytes.length) {
    const end = bytes.indexOf("\r\n\r\n", offset);
    assert.ok(end >= offset, "complete response header");
    const head = bytes.subarray(offset, end).toString();
    const length = Number(/^content-length: (\d+)$/im.exec(head)?.[1] ?? 0);
    const next = end + 4 + length;
    assert.ok(next <= bytes.length, "complete response body");
    results.push(comparable(bytes.subarray(offset, next)));
    offset = next;
  }

  return results;
}
