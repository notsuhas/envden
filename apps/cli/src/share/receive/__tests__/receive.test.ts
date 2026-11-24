import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newShare, shareText } from "@envden/core/protocol";
import { parseShareLink } from "../link.ts";
import { receiveFile } from "../run.ts";

const share = newShare();

const id = shareText(share.id);

const key = shareText(share.key);

test("only a complete https link, or http to this machine, is accepted", () => {
  expect(parseShareLink(`https://node.tail.ts.net:10000/s/${id}#${key}`)).toEqual({
    claim: `https://node.tail.ts.net:10000/s/${id}/claim`,
    share,
  });

  expect(parseShareLink(`http://127.0.0.1:4000/s/${id}#${key}`).claim).toStartWith(
    "http://127.0.0.1",
  );

  for (const link of [
    `http://node.tail.ts.net:10000/s/${id}#${key}`,
    `https://node.tail.ts.net:10000/s/${id}`,
    `https://node.tail.ts.net:10000/s/${id}#${key.slice(1)}`,
    `https://node.tail.ts.net:10000/x/${id}#${key}`,
    `https://node.tail.ts.net:10000/s/${id}?a=1#${key}`,
    `https://user@node.tail.ts.net:10000/s/${id}#${key}`,
    "not a link",
  ])
    expect(() => parseShareLink(link)).toThrow("That isn't a complete envden share link");
});

test("an existing file is replaced only after a yes, asked before the link is used", async () => {
  const dir = await mkdtemp(join(tmpdir(), "envden-receive-"));
  const claims: string[] = [];

  const fetcher = async (url: string | URL | Request) => {
    claims.push(url instanceof Request ? url.url : url.toString());

    return new Response(null, { status: 410 });
  };

  const receive = (interactive: boolean, answer: boolean) =>
    receiveFile(
      { fetcher, now: () => 0 },
      {
        link: `https://node.tail.ts.net:10000/s/${id}#${key}`,
        out: ".env",
        cwd: dir,
        interactive,
        confirm: async () => answer,
      },
    );

  try {
    await writeFile(join(dir, ".env"), "KEEP=1\n");

    await Promise.resolve(
      expect(receive(false, true)).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

    expect((await receive(true, false)).kind).toBe("kept");
    expect(claims).toEqual([]);

    await Promise.resolve(expect(receive(true, true)).rejects.toThrow("already opened"));
    expect(claims).toHaveLength(1);
    expect(await readFile(join(dir, ".env"), "utf8")).toBe("KEEP=1\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a closed link and an unreachable sender say so", async () => {
  for (const [fetcher, code] of [
    [async () => new Response(null, { status: 404 }), "NOT_FOUND"],
    [async () => new Response(null, { status: 502 }), "NOT_FOUND"],
    [async () => Promise.reject(new TypeError("fetch failed")), "SERVER_UNREACHABLE"],
  ] as const)
    await Promise.resolve(
      expect(
        receiveFile(
          { fetcher, now: () => 0 },
          {
            link: `https://node.tail.ts.net:10000/s/${id}#${key}`,
            out: join(tmpdir(), `envden-absent-${crypto.randomUUID()}`),
            cwd: tmpdir(),
            interactive: false,
            confirm: async () => false,
          },
        ),
      ).rejects.toMatchObject({ code }),
    );
});
