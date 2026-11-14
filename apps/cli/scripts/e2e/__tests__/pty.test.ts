import { test, expect, spyOn } from "bun:test";
import { PtySession } from "../pty.ts";

// The e2e terminal harness requires POSIX terminal behavior.
test.skipIf(process.platform === "win32")(
  "pty expectations wake on output and accept a supplied deadline",
  async () => {
    const session = new PtySession({
      label: "stream",
      binary: process.execPath,
      args: [
        "-e",
        "process.stdout.write('ready'); process.stdin.once('data', () => { console.log('done'); process.exit(0); });",
      ],
      env: {},
    });

    const deadline = new AbortController();

    const clock = spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Unexpected wall clock read");
    });

    try {
      expect(await session.expect("ready", deadline.signal)).toBe("ready");
      session.send("go\n");
      expect(await session.expect("done", deadline.signal)).toBe("done");
      await session.succeeds();
    } finally {
      clock.mockRestore();
    }
  },
);
