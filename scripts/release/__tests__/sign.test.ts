import { test, expect } from "bun:test";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { decodeReleaseFeed } from "@envden/core/protocol";
import { targets, assetName } from "../../../apps/cli/scripts/targets.ts";

test("signing requires trust, preserves seq and refuses changed refresh assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "envden-feed-"));
  const root = resolve(import.meta.dir, "../../..");

  const environment = {
    ...process.env,
    ENVDEN_RELEASE_PRIMARY_SEED_HEX:
      "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    ENVDEN_RELEASE_PRIMARY_PUBLIC_HEX:
      "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    ENVDEN_RELEASE_GENERATION: "1",
    ENVDEN_RELEASE_VERSION: "0.1.0",
    ENVDEN_FIRST_RELEASE: "",
    ENVDEN_PREVIOUS_FEED: "",
  };

  async function run(extra: Record<string, string>) {
    const child = Bun.spawn(
      [
        process.execPath,
        "--tsconfig-override",
        join(root, "scripts/tsconfig.json"),
        join(root, "scripts/release/sign.ts"),
        directory,
      ],
      {
        cwd: root,
        env: { ...environment, ...extra },
        stdout: "ignore",
        stderr: "ignore",
      },
    );

    return child.exited;
  }

  try {
    for (const target of targets) await Bun.write(join(directory, assetName(target)), target);
    expect(await run({})).not.toBe(0);
    expect(await run({ ENVDEN_FIRST_RELEASE: "1" })).toBe(0);
    const previous = join(directory, "previous.bin");
    await copyFile(join(directory, "release-g1.bin"), previous);
    expect(await run({ ENVDEN_PREVIOUS_FEED: previous })).toBe(0);

    const feed = decodeReleaseFeed(
      new Uint8Array(await Bun.file(join(directory, "release-g1.bin")).arrayBuffer()),
    );

    expect(feed.body.seq).toBe(2n);
    expect(feed.body.builds).toHaveLength(8);
    expect(feed.body.expires - feed.body.issuedAt).toBe(2592000000n);
    await Bun.write(join(directory, assetName(targets[0]!)), "tampered");
    expect(await run({ ENVDEN_PREVIOUS_FEED: previous })).not.toBe(0);

    expect(
      await run({ ENVDEN_FIRST_RELEASE: "1", ENVDEN_RELEASE_PRIMARY_PUBLIC_HEX: "00".repeat(32) }),
    ).not.toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
