import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reportKit } from "../report.ts";
import { kit } from "./kit.ts";
import { pdfText } from "./text.ts";

async function reported(userHome: string) {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});

  try {
    await reportKit(kit, { userHome, deviceName: "laptop", now: 0 });

    return { out: log.mock.calls.flat().join("\n"), err: error.mock.calls.flat().join("\n") };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

test("kit is saved to Downloads and the terminal shows only where", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-kit-report-"));

  try {
    await mkdir(join(home, "Downloads"));
    const { out, err } = await reported(home);
    const name = `envden Recovery Kit ${kit.vaultId.slice(0, 6)}.pdf`;

    expect(out).toBe(
      `Recovery kit saved to ${join("~", "Downloads", name)}\nPrint it or store it offline, then delete the file from this computer.`,
    );

    expect(err).toBe("");
    expect(await readdir(join(home, "Downloads"))).toEqual([name]);

    expect(await pdfText(await Bun.file(join(home, "Downloads", name)).bytes())).toContain(
      kit.secretKey,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("kit is printed when its file can't be written", async () => {
  const { out, err } = await reported(join(tmpdir(), "envden-kit-missing", "home"));

  expect(err).toBe("envden: Couldn't write the recovery kit file; save the kit printed below");
  expect(out).toContain(kit.vaultId);
  expect(out).toContain(kit.secretKey);
});
