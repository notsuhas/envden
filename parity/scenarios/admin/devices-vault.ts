import { join } from "node:path";
import type { Terminal } from "../../runtime/process/terminal.ts";
import { known } from "../known.ts";
import { cli } from "../steps/cli.ts";
import { readKit } from "../steps/kit.ts";
import { answerPassword, joinKit, password, setup } from "../steps/onboarding.ts";
import type { IScenario, IStep } from "../types.ts";

const changed = "a different correct master password";

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

const endOfInput: IStep = {
  name: "Ctrl-D at a password prompt",
  run: async (c) => {
    const session: Terminal = c.terminal("a", ["unlock"]);

    await session.expect("Master password");
    if (!(await session.exitsAfter("\x04", 5000))) session.send("\x03");
    await c.finish("a", ["unlock"], session, known.eofCancels ? 2 : 130);
  },
};

const passwords: IStep = {
  name: "change and reset password",
  run: async (c) => {
    const { secretKey } = await readKit(join(c.get("a").home, "replacement.json"));

    await c.pty(
      "a",
      ["vault", "password", "change"],
      [
        { expect: "Old master password", send: `${password}\r` },
        { expect: "Master password", send: `${changed}\r` },
        { expect: "Confirm master password", send: `${changed}\r` },
        { expect: "Recovery secret key", send: `${secretKey}\r` },
      ],
    );

    await c.pty(
      "a",
      ["vault", "password", "reset"],
      [
        { expect: "Master password", send: `${password}\r` },
        { expect: "Confirm master password", send: `${password}\r` },
        { expect: "Recovery secret key", send: `${secretKey}\r` },
      ],
    );
  },
};

export const devicesVault: IScenario = {
  name: "devices-vault",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup(),
    joinKit(),
    cli("a", ["device", "ls"]),
    cli("a", ["device", "ls", "--json"]),
    cli("a", ["device", "ls", "--verbose"]),
    cli("b", ["device", "rename", "evil\x1b[31mname\tb"], known.controlCharacterName),
    cli("b", ["device", "rename", "renamed-b"]),
    unlock,
    endOfInput,
    {
      name: "replace recovery kit",
      run: async (c) => {
        const out = join(c.get("a").home, "replacement.json");

        await c.pty("a", ["vault", "kit", "replace", "--kit-out", out], answerPassword);
      },
    },
    passwords,
    {
      name: "rotate vault",
      run: async (c) => {
        await c.pty("a", ["vault", "rotate"], answerPassword);
      },
    },
    {
      name: "remove device",
      run: async (c) => {
        const out = join(c.get("a").home, "removal.json");

        await c.pty(
          "a",
          ["device", "rm", "renamed-b", "--new-kit", "--kit-out", out],
          [...answerPassword, { expect: "Remove this device?", send: "y" }],
        );
      },
    },
    cli("a", ["device", "ls", "--json"]),
    cli("b", ["push", "--yes"], 1),
  ],
};
