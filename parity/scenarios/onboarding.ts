import { gatePairing } from "../runtime/pairing-proxy.ts";
import { join } from "node:path";
import type { Context } from "../runtime/context.ts";
import type { IStep } from "./types.ts";

export const password = "correct horse battery staple";
export const preferences = [
  "--telemetry",
  "off",
  "--update-check",
  "off",
  "--shell",
  "none",
  "--agent",
  "off",
];
export const original = "# parity fixture\nAPI_URL=https://api.example.com\nTOKEN=one\n";
export const answerPassword = [{ expect: "Master password", send: `${password}\r` }];

export function setup(interactive = false, pairing = false): IStep[] {
  return [
    {
      name: "create devices and server",
      run: async (c) => {
        await c.device("a", original);
        await c.device("b");
        const s = await c.serve();
        if (pairing) gatePairing(s);
      },
    },
    {
      name: "setup vault",
      run: async (c) => {
        const s = c.servers.get("main")!;
        const kit = join(c.get("a").home, "kit.json");
        const args = interactive
          ? ["setup", "--kit-out", kit, "--name", "device-a"]
          : [
              "setup",
              "--yes",
              "--server",
              s.url,
              "--setup-token",
              s.token,
              "--name",
              "device-a",
              "--kit-out",
              kit,
              ...preferences,
            ];
        await c.pty("a", args, [
          ...(interactive
            ? [
                { expect: "Host the server on this machine", send: "\r" },
                { expect: "Server address", send: `${s.url}\r` },
                { expect: "Server setup token", send: `${s.token}\r` },
              ]
            : []),
          ...answerPassword,
          { expect: "Confirm master password", send: `${password}\r` },
          ...(interactive
            ? [
                { expect: "anonymous telemetry", send: "n" },
                { expect: "Check for updates daily", send: "n" },
                { expect: "Install the shell notice", send: "\r" },
                { expect: "Install the agent skill", send: "n" },
              ]
            : []),
          { expect: "Sync env files for these checkouts", send: "\r" },
        ]);
      },
    },
  ];
}

export const joinKit: IStep = {
  name: "join with JSON recovery kit",
  run: async (c) => {
    const s = c.servers.get("main")!;
    await c.pty(
      "b",
      [
        "join",
        s.url,
        "--recovery-kit",
        join(c.get("a").home, "kit.json"),
        "--name",
        "device-b",
        "--yes",
        ...preferences,
      ],
      [...answerPassword, { expect: "Sync env files for these checkouts", send: "\r" }],
    );
  },
};

export const joinPair: IStep = {
  name: "pair a second device",
  run: async (c: Context) => {
    const addArgs = ["device", "add"];
    const add = c.terminal("a", addArgs);
    await add.answers(answerPassword);
    const code = await add.expect(/\b(\d{1,3}-[A-Z0-9]{4}-[A-Z0-9]{4})\b/);
    const args = [
      "join",
      c.servers.get("main")!.url,
      "--name",
      "device-b",
      "--yes",
      ...preferences,
    ];
    const joining = c.terminal("b", args);
    await joining.answers([{ expect: "Pairing code", send: `${code}\r` }]);
    await add.answers([{ expect: "Add device-b", send: "y" }]);
    await c.finish("a", addArgs, add);
    await joining.answers([{ expect: "Sync env files for these checkouts", send: "\r" }]);
    await c.finish("b", args, joining);
  },
};
