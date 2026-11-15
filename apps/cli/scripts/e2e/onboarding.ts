import type { IDevice } from "./device.ts";
import { PtySession } from "./pty.ts";
import type { IServer } from "./server.ts";

const PAIRING_CODE = /\b(\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/;

// the answers a first-time user gives: defaults wherever a default is offered
const PREFERENCES = [
  { expect: "anonymous telemetry", send: "\r" },
  { expect: "Check for updates daily", send: "\r" },
  { expect: "Install the shell notice", send: "\r" },
  { expect: "Install the agent skill", send: "\r" },
  { expect: "Sync env files for these checkouts", send: "\r" },
];

export async function setupLikeAUser(
  binary: string,
  device: IDevice,
  server: IServer,
  password: string,
): Promise<void> {
  const setup = new PtySession({
    label: `${device.name} setup`,
    binary,
    env: device.env,
    args: ["setup"],
  });

  await setup.steps([
    { expect: "Host the server on this machine", send: "\r" },
    { expect: "Server address", send: `${server.url}\r` },
    { expect: "Server setup token", send: `${server.token}\r` },
    { expect: "Device name", send: "\r" },
    { expect: "Master password", send: `${password}\r` },
    { expect: "Confirm master password", send: `${password}\r` },
    { expect: "Open it now?", send: "n" },
    ...PREFERENCES,
    { expect: "Setup complete" },
  ]);

  await setup.succeeds();
}

export async function joinLikeAUser(
  binary: string,
  approver: IDevice,
  device: IDevice,
  server: IServer,
  password: string,
): Promise<void> {
  const add = new PtySession({
    label: `${approver.name} device add`,
    binary,
    env: approver.env,
    args: ["device", "add"],
  });

  await add.steps([{ expect: "Master password", send: `${password}\r` }]);
  const code = await add.expect(PAIRING_CODE);

  const joining = new PtySession({
    label: `${device.name} join`,
    binary,
    env: device.env,
    args: ["join", server.url],
  });

  await joining.steps([
    { expect: "Device name", send: "\r" },
    { expect: "Pairing code", send: `${code}\r` },
  ]);

  await add.steps([{ expect: "Add ", send: "y" }, { expect: "added" }]);
  await add.succeeds();

  await joining.steps([...PREFERENCES, { expect: "Joined as" }]);
  await joining.succeeds();
}
