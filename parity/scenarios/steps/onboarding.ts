import { join } from "node:path";
import type { TContext } from "../../runtime/context.ts";
import type { TServer } from "../../runtime/server/start.ts";
import type { IStep } from "../types.ts";

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
export const syncCheckouts = { expect: "Sync env files for these checkouts", send: "\r" };
export const pairingCode = /\b(\d{1,3}-[A-Z0-9]{4}-[A-Z0-9]{4})\b/;

export function kitPath(c: TContext): string {
  return join(c.get("a").home, "kit.json");
}

interface ISetup {
  // Wraps the main server before any device learns its address.
  front?: (c: TContext, server: TServer) => void;
  contents?: string;
}

export function setup(options: ISetup = {}): IStep[] {
  return [
    {
      name: "create device and server",
      run: async (c) => {
        await c.device("a", options.contents ?? original);

        const s = await c.serve();

        options.front?.(c, s);
      },
    },
    {
      name: "setup vault",
      run: async (c) => {
        const s = c.servers.get("main")!;

        await c.pty(
          "a",
          [
            "setup",
            "--yes",
            "--server",
            s.url,
            "--setup-token",
            s.token,
            "--name",
            "device-a",
            "--kit-out",
            kitPath(c),
            ...preferences,
          ],
          [
            ...answerPassword,
            { expect: "Confirm master password", send: `${password}\r` },
            syncCheckouts,
          ],
        );
      },
    },
  ];
}

async function ensure(c: TContext, device: string): Promise<void> {
  if (!c.has(device)) await c.device(device);
}

export function joinKit(device = "b"): IStep {
  return {
    name: `${device} joins with the JSON recovery kit`,
    run: async (c) => {
      await ensure(c, device);
      const s = c.servers.get("main")!;
      const args = ["join", s.url, "--recovery-kit", kitPath(c), "--name", `device-${device}`];

      await c.pty(device, [...args, "--yes", ...preferences], [...answerPassword, syncCheckouts]);
    },
  };
}

export async function pair(c: TContext, device: string, joinArgs: string[] = []) {
  await ensure(c, device);

  const addArgs = ["device", "add"];
  const add = c.terminal("a", addArgs);

  await add.answers(answerPassword);

  const code = await add.expect(pairingCode);
  const args = ["join", c.servers.get("main")!.url, "--name", `device-${device}`, ...joinArgs];
  const joining = c.terminal(device, args);

  await joining.answers([{ expect: "Pairing code", send: `${code}\r` }]);
  await add.answers([{ expect: `Add device-${device}?`, send: "y" }]);
  await c.finish("a", addArgs, add);

  return { joining, args };
}

export function joinPair(device = "b"): IStep {
  return {
    name: `pair device ${device}`,
    run: async (c) => {
      const { joining, args } = await pair(c, device, ["--yes", ...preferences]);

      await joining.answers([syncCheckouts]);
      await c.finish(device, args, joining);
    },
  };
}
