import { expect, test } from "bun:test";
import { pickRequest } from "../pick.ts";

const request = (number: number) => ({
  number,
  name: `device-${number}`,
  commit: "",
  expiresAt: 1,
});

test("approve picks the only waiting request, asks among several, and checks a named one", () => {
  expect(pickRequest([])).toEqual({ kind: "none" });
  expect(pickRequest([request(1)])).toEqual({ kind: "picked", request: request(1) });

  expect(pickRequest([request(1), request(2)])).toEqual({
    kind: "choose",
    requests: [request(1), request(2)],
  });

  expect(pickRequest([request(1), request(2)], 2)).toEqual({ kind: "picked", request: request(2) });
  expect(pickRequest([request(1)], 3)).toEqual({ kind: "missing" });
});
