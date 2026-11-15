import { expect, spyOn, test } from "bun:test";
import { printKit, printKitSaved } from "../kit.ts";

const kit = { vaultId: "VAULT", secretKey: "SECRET", server: "https://envden.example" };

function printed(print: () => void) {
  const log = spyOn(console, "log").mockImplementation(() => {});

  try {
    print();

    return log.mock.calls.flat().join("\n");
  } finally {
    log.mockRestore();
  }
}

test("kit block labels each field", () => {
  const text = printed(() => printKit(kit));

  expect(text).toContain("  Vault ID:    VAULT");
  expect(text).toContain("  Secret key:  SECRET");
  expect(text).toContain("  Server:      https://envden.example");
});

test("a saved kit shows only where it is, and a PDF asks to be printed and deleted", () => {
  const pdf = printed(() => printKitSaved("~/kit", "pdf"));
  const json = printed(() => printKitSaved("~/kit", "json"));

  expect(json).toContain("~/kit");
  expect(json.split("\n")).toHaveLength(1);
  expect(pdf).toStartWith(json);
  expect(pdf).toContain("delete");
});
