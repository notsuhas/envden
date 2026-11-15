import { EnvdenError } from "@envden/core/errors";
import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture } from "../../client/__tests__/fixture.ts";
import { createClient } from "../../client/request.ts";
import { recordUpdateRequired, withUpdateStatus, updateStatus } from "../status.ts";

const fixtureClock = () => 1800000000000;

test("a successful authenticated request clears a previous update refusal", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-required-"));
  const f = await fixture();

  try {
    await recordUpdateRequired(
      home,
      new EnvdenError("CLIENT_TOO_OLD", "The server requires a version that doesn't exist"),
      fixtureClock,
    );

    expect((await updateStatus(home)).required).toBe(false);
    await recordUpdateRequired(home, undefined, fixtureClock);

    const client = createClient({
      ...f.options,
      fetcher: async (input) => f.greeting(input) ?? new Response(),
    });

    await withUpdateStatus(home, () => client.request("/v1/test"));
    expect((await updateStatus(home)).required).toBe(false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
