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

  expect(text).toContain("like a passport");
  expect(text).toContain("  Vault ID:    VAULT");
  expect(text).toContain("  Secret key:  SECRET");
  expect(text).toContain("  Server:      https://envden.example");
});

test.each([
  [
    "pdf",
    "Recovery kit saved to ~/kit\nPrint it or store it offline, then delete the file from this computer.",
  ],
  ["json", "Recovery kit saved to ~/kit"],
] as const)("saved %s kit shows only where it is", (format, text) => {
  expect(printed(() => printKitSaved("~/kit", format))).toBe(text);
});
