import { expect, test } from "bun:test";
import { REFERENCE_PAGE, referencePage } from "../page.ts";

const fixtureClock = () => 1800000000000;

test("the committed CLI reference matches the program; run bun run docs:cli", async () => {
  expect(await Bun.file(REFERENCE_PAGE).text()).toBe(referencePage(fixtureClock));
});
