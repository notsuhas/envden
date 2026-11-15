import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IScenario, IStep } from "./types.ts";
import { setup, joinKit, answerPassword, password } from "./onboarding.ts";
import { cli } from "./sync.ts";

const unlock: IStep = {
  name: "unlock after wrong password",
  run: async (c) => {
    await c.pty(
      "a",
      ["unlock"],
      [
        { expect: "Master password", send: "wrong password\r" },
        { expect: "Wrong master password. Try again", send: `${password}\r` },
      ],
    );
  },
};

export const adminScenarios: IScenario[] = [
  {
    name: "devices-vault",
    steps: [
      ...setup(),
      joinKit,
      cli("a", ["device", "ls"]),
      cli("a", ["device", "ls", "--json"]),
      cli("a", ["device", "ls", "--verbose"]),
      cli("b", ["device", "rename", "renamed-b"]),
      unlock,
      {
        name: "replace recovery kit",
        run: async (c) => {
          await c.pty(
            "a",
            ["vault", "kit", "replace", "--kit-out", join(c.get("a").home, "replacement.json")],
            answerPassword,
          );
        },
      },
      {
        name: "change and reset password",
        run: async (c) => {
          const kit: unknown = JSON.parse(
            await readFile(join(c.get("a").home, "replacement.json"), "utf8"),
          );
          if (
            typeof kit !== "object" ||
            kit === null ||
            !("secretKey" in kit) ||
            typeof kit.secretKey !== "string"
          )
            throw new Error("Invalid recovery kit");
          await c.pty(
            "a",
            ["vault", "password", "change"],
            [
              { expect: "Old master password", send: `${password}\r` },
              { expect: "Master password", send: "changed password\r" },
              { expect: "Confirm master password", send: "changed password\r" },
              { expect: "Recovery secret key", send: `${kit.secretKey}\r` },
            ],
          );
          await c.pty(
            "a",
            ["vault", "password", "reset"],
            [
              { expect: "Master password", send: `${password}\r` },
              { expect: "Confirm master password", send: `${password}\r` },
              { expect: "Recovery secret key", send: `${kit.secretKey}\r` },
            ],
          );
        },
      },
      {
        name: "rotate vault",
        run: async (c) => {
          await c.pty("a", ["vault", "rotate"], answerPassword);
        },
      },
      {
        name: "remove device",
        run: async (c) => {
          await c.pty(
            "a",
            [
              "device",
              "rm",
              "renamed-b",
              "--new-kit",
              "--kit-out",
              join(c.get("a").home, "removal.json"),
            ],
            [...answerPassword, { expect: "Remove this device?", send: "y" }],
          );
        },
      },
      cli("a", ["device", "ls", "--json"]),
    ],
  },
  {
    name: "server-move",
    steps: [
      ...setup(),
      joinKit,
      {
        name: "start destination and move",
        run: async (c) => {
          const s = await c.serve("destination");
          await c.pty("a", ["server", "move", s.url, "--setup-token", s.token], answerPassword);
        },
      },
      {
        name: "switch second device",
        run: async (c) => {
          await c.stop("main");
          await c.cli("b", ["server", "switch", c.servers.get("destination")!.url], 1);
        },
      },
      cli("a", ["status", "--json"]),
    ],
  },
];
