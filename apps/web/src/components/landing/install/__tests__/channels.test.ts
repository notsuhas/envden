import { describe, expect, test } from "bun:test";
import { INSTALL_CHANNELS, defaultChannel } from "../channels.ts";

describe("defaultChannel", () => {
  test("picks the PowerShell installer on Windows", () => {
    const index = defaultChannel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    expect(INSTALL_CHANNELS[index]?.id).toBe("irm");
  });

  test("picks the shell installer everywhere else", () => {
    expect(INSTALL_CHANNELS[defaultChannel("Mozilla/5.0 (Macintosh)")]?.id).toBe("curl");
    expect(INSTALL_CHANNELS[defaultChannel("Mozilla/5.0 (X11; Linux x86_64)")]?.id).toBe("curl");
  });
});
