import { test, expect } from "bun:test";
import { managerUpdate } from "../self/execute.ts";

for (const manager of ["brew", "npm", "scoop", "winget"])
  test(`${manager} runs upgrade before the new binary refresh`, async () => {
    const calls: string[][] = [];
    const command = [manager, "upgrade", "envden"];

    expect(
      await managerUpdate(
        command,
        "/new/envden",
        async (line) => line === command.join(" "),
        async (args) => {
          calls.push(args);
        },
      ),
    ).toEqual({ kind: "updated" });

    expect(calls).toEqual([command, ["/new/envden", "update", "--post-install"]]);
    calls.length = 0;

    await managerUpdate(
      command,
      "/new/envden",
      async () => false,
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toEqual([]);

    await Promise.resolve(
      expect(
        managerUpdate(
          command,
          "/new/envden",
          async () => true,
          async () => {
            throw new Error("failed upgrade");
          },
        ),
      ).rejects.toThrow("failed upgrade"),
    );
  });

test("manager refresh resolves the replaced binary path after upgrading", async () => {
  const calls: string[][] = [];

  await managerUpdate(
    ["brew", "upgrade", "envden"],
    "/Cellar/old/envden",
    async () => true,
    async (args) => {
      calls.push(args);
    },
    () => "/Cellar/new/envden",
  );

  expect(calls.at(-1)).toEqual(["/Cellar/new/envden", "update", "--post-install"]);
});
