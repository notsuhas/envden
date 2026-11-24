import { describe, expect, test } from "bun:test";
import { INSTALL_CHANNELS, defaultChannel } from "../channels.ts";

function picked(userAgent: string) {
  return INSTALL_CHANNELS[defaultChannel(userAgent)]?.id;
}

describe("defaultChannel", () => {
  test("picks the visitor's platform", () => {
    expect(picked("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(picked("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macos");
  });

  test("falls back to macOS on phones and Windows", () => {
    expect(picked("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("macos");
    expect(picked("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("macos");
    expect(picked("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)")).toBe("macos");
  });
});
