import { expect, test } from "bun:test";
import { comparable, comparableMany, responseLength } from "../transport/wire.ts";

const response =
  "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nDate: first\r\nContent-Length: 2\r\n\r\n{}";

const compare = (raw: string) => comparable(Buffer.from(raw));

test("transport comparison keeps header order, casing, status and body bytes", () => {
  expect(compare(response)).toEqual(compare(response.replace("Date: first", "Date: second")));
  expect(compare(response)).not.toEqual(compare(response.replace("Content-Type", "content-type")));
  expect(compare(response)).not.toEqual(compare(response.replace("400", "401")));
  expect(compare(response)).not.toEqual(compare(response.replace("{}", "[]")));

  expect(compare(response)).not.toEqual(
    compare(
      response.replace(
        "Content-Type: application/json\r\nDate: first\r\nContent-Length: 2",
        "Content-Length: 2\r\nContent-Type: application/json",
      ),
    ),
  );
});

test("pipelined responses split by method and length; HEAD has no body", () => {
  const head = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\n";
  const both = Buffer.from(head + response);

  expect(responseLength(both, "HEAD")).toBe(head.length);
  expect(responseLength(Buffer.from(response.slice(0, -1)), "GET")).toBeUndefined();

  expect(comparableMany(both, ["HEAD", "GET"]).map((r) => r.status)).toEqual([
    "HTTP/1.1 404 Not Found",
    "HTTP/1.1 400 Bad Request",
  ]);
});

test("only the status uptime counter is masked", () => {
  const status = (uptime: number, version: string) =>
    compare(
      `HTTP/1.1 200 OK\r\nContent-Length: 30\r\n\r\n{"version":"${version}","uptimeSeconds":${uptime}}`,
    );

  expect(status(1, "0.3.8")).toEqual(status(2, "0.3.8"));
  expect(status(1, "0.3.8")).not.toEqual(status(1, "0.3.9"));
});
