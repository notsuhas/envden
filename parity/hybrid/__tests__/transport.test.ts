import { expect, test } from "bun:test";
import { comparable } from "../transport.ts";

test("transport comparison keeps header order, casing, status and body bytes", () => {
  const first =
    "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nDate: first\r\nContent-Length: 2\r\n\r\n{}";

  const compare = (raw: string) => comparable(Buffer.from(raw));

  expect(compare(first)).toEqual(compare(first.replace("Date: first", "Date: second")));
  expect(compare(first)).not.toEqual(compare(first.replace("Content-Type", "content-type")));
  expect(compare(first)).not.toEqual(compare(first.replace("400", "401")));
  expect(compare(first)).not.toEqual(compare(first.replace("{}", "[]")));

  expect(compare(first)).not.toEqual(
    compare(
      first.replace(
        "Content-Type: application/json\r\nDate: first\r\nContent-Length: 2",
        "Content-Length: 2\r\nContent-Type: application/json",
      ),
    ),
  );
});
