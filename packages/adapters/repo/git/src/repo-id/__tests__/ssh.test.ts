import { expect, test } from "bun:test";
import { resolveSshHost } from "../ssh.ts";

test("SSH aliases resolve only through option-terminated safe hosts", async () => {
  for (const host of ["-oProxyCommand=evil", "foo bar", "foo\nbar", "$(id)", ""])
    await Promise.resolve(
      expect(
        resolveSshHost(host, async () => {
          throw new Error("executed unsafe host");
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

  expect(
    await resolveSshHost("work-git", async (command, args) => {
      expect([command, args]).toEqual(["ssh", ["-G", "--", "work-git"]]);

      return { stdout: "user git\nhostname github.com  \nport 22\n", stderr: "" };
    }),
  ).toBe("github.com");

  await Promise.resolve(
    expect(
      resolveSshHost("work", async () => ({ stdout: "user git\n", stderr: "" })),
    ).rejects.toMatchObject({ code: "INTERNAL" }),
  );

  const failure = new Error("ssh failed");

  await Promise.resolve(
    expect(
      resolveSshHost("work", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure),
  );
});
