import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { latestRelease, RELEASE_REPOSITORY } from "../github.ts";
import { checkRelease, type IUpdateCache } from "../check.ts";
import { runUpdateCheck } from "../run.ts";
import { readUpdateCache } from "../cache.ts";
import { atomicWrite } from "../../state/store/files.ts";
import type { TFetch } from "../../client/fetch.ts";

const fixtureClock = () => 1800000000000;

const redirect = (tag = "v1.2.3") =>
  new Response(null, {
    status: 302,
    headers: { location: `https://github.com/${RELEASE_REPOSITORY}/releases/tag/${tag}` },
  });

test("public redirect resolves the tag without the API", async () => {
  let calls = 0;

  expect(
    await latestRelease(async (_, options) => {
      calls++;
      expect(options?.redirect).toBe("manual");

      return redirect();
    }),
  ).toBe("1.2.3");

  expect(calls).toBe(1);
});

test("lookup falls back to API when the redirect fails", async () => {
  const urls: string[] = [];

  expect(
    await latestRelease(async (input) => {
      urls.push(input instanceof Request ? input.url : input.toString());

      return urls.length === 1
        ? new Response(null, { status: 503 })
        : Response.json({ tag_name: "v2.0.0" });
    }),
  ).toBe("2.0.0");

  expect(urls[1]).toBe(`https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`);
});

for (const tag of ["v1.2.3-beta", "1.2.3", "v01.2.3", "v1.2", "v1.2.3+build"])
  test(`malformed stable tag is refused: ${tag}`, async () => {
    let calls = 0;

    await Promise.resolve(
      expect(
        latestRelease(async () =>
          ++calls === 1 ? redirect(tag) : Response.json({ tag_name: tag }),
        ),
      ).rejects.toThrow("Invalid release tag"),
    );
  });

test("daily cache limits both successful and failed lookups", async () => {
  const cache: IUpdateCache = {};
  let calls = 0;

  const fetcher: TFetch = async () => {
    calls++;

    return redirect();
  };

  expect((await checkRelease(cache, 100, fetcher)).kind).toBe("checked");
  expect((await checkRelease(cache, 101, fetcher)).kind).toBe("skipped");
  expect(calls).toBe(1);

  const failing: TFetch = async () => {
    throw new Error("offline");
  };

  expect((await checkRelease(cache, 86400100, failing)).kind).toBe("unavailable");
  expect((await checkRelease(cache, 86400101, fetcher)).kind).toBe("skipped");
  expect(cache.message).toContain("Cannot confirm");
});

for (const optOut of ["config", "env", "none"])
  test(`daily check persists independently of vault and honours opt-out: ${optOut}`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-check-"));
    const before = process.env.ENVDEN_NO_UPDATE_CHECK;
    let calls = 0;

    try {
      if (optOut === "env") process.env.ENVDEN_NO_UPDATE_CHECK = "1";
      else delete process.env.ENVDEN_NO_UPDATE_CHECK;

      await atomicWrite(
        join(home, "config.json"),
        JSON.stringify({ "update-check": optOut !== "config" }),
        fixtureClock,
      );

      const adapters = createAdapters(
        {
          home,
          userHome: home,
          keychain: createMemoryKeychainAdapter([]),
        },
        fixtureClock,
      );

      const fetcher: TFetch = async () => {
        calls++;

        return redirect();
      };

      await runUpdateCheck(adapters, 10, false, fetcher);
      await runUpdateCheck(adapters, 11, false, fetcher);
      expect(calls).toBe(optOut === "none" ? 1 : 0);
      expect((await readUpdateCache(home)).latest).toBe(optOut === "none" ? "1.2.3" : undefined);
    } finally {
      if (before === undefined) delete process.env.ENVDEN_NO_UPDATE_CHECK;
      else process.env.ENVDEN_NO_UPDATE_CHECK = before;

      await rm(home, { recursive: true, force: true });
    }
  });

test("an already cancelled check does not cache a day without sending a request", async () => {
  const cache: IUpdateCache = {};
  let calls = 0;

  await checkRelease(
    cache,
    100,
    async () => {
      calls++;

      return redirect();
    },
    false,
    AbortSignal.abort(),
  );

  expect(calls).toBe(0);
  expect(cache.checkedAt).toBeUndefined();
});

test("explicit checks bypass disabled automatic checks and fetch outside the lock", async () => {
  const { setConfig } = await import("../../settings/config.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-explicit-"));

  try {
    await setConfig("update-check", "off", home);

    const adapters = createAdapters(
      {
        home,
        userHome: home,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    const result = await runUpdateCheck(adapters, 100, true, async () => {
      expect(await Bun.file(join(home, "state", "write.lock", "owner.json")).exists()).toBe(false);

      return redirect();
    });

    expect(result.kind).toBe("checked");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
