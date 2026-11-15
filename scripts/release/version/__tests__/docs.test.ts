import { expect, test } from "bun:test";
import { withDocsVersion } from "../docs.ts";

test("rewrites only the version output example", () => {
  const docs = "Pin 1.0.0 here.\n\nFor v0.2.0, this prints:\n\n```text\n0.2.0\n```\n";

  expect(withDocsVersion(docs, "0.3.1")).toBe(
    "Pin 1.0.0 here.\n\nFor v0.3.1, this prints:\n\n```text\n0.3.1\n```\n",
  );
});
