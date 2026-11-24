import type { IDevice } from "./device.ts";
import { failure } from "./failure.ts";
import { PtySession } from "./pty.ts";
import type { IServer } from "./server.ts";

const RECOVERY_CODE = /Recovery code:\s+(ER1-[0-9A-Z-]+)/;
const JOINER_WORDS = /Words: ([a-z]+ [a-z]+ [a-z]+)\s/;
const APPROVER_WORDS = /wants to join\. Words: ([a-z]+ [a-z]+ [a-z]+)\./;

// the answers a first-time user gives: defaults wherever a default is offered
const PREFERENCES = [
  { expect: "anonymous telemetry", send: "\r" },
  { expect: "Check for updates daily", send: "\r" },
  { expect: "Install the shell notice", send: "\r" },
  { expect: "Install the agent skill", send: "\r" },
  { expect: "Sync env files for these checkouts", send: "\r" },
];

// Returns the recovery code setup showed, as a user would copy it into a password manager.
export async function setupLikeAUser(
  binary: string,
  device: IDevice,
  server: IServer,
): Promise<string> {
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
  ]);

  const code = await setup.expect(RECOVERY_CODE);

  await setup.steps([
    { expect: "Stored it?", send: "y" },
    ...PREFERENCES,
    { expect: "Setup complete" },
  ]);

  await setup.succeeds();

  return code;
}

// Both screens must show the same three words before either says yes.
export async function joinLikeAUser(
  binary: string,
  approver: IDevice,
  device: IDevice,
  server: IServer,
): Promise<void> {
  const joining = new PtySession({
    label: `${device.name} join`,
    binary,
    env: device.env,
    args: ["join", server.url],
  });

  await joining.steps([{ expect: "Device name", send: "\r" }, { expect: "envden device approve" }]);

  const approve = new PtySession({
    label: `${approver.name} device approve`,
    binary,
    env: approver.env,
    args: ["device", "approve"],
  });

  const shown = await approve.expect(APPROVER_WORDS);
  const words = await joining.expect(JOINER_WORDS);

  if (shown !== words) throw failure(`words differ: ${shown} / ${words}`, joining.output());

  await joining.steps([{ expect: "Do they match", send: "y" }]);

  await approve.steps([
    { expect: "Do they match the other screen?", send: "y" },
    { expect: "added" },
  ]);

  await approve.succeeds();

  await joining.steps([...PREFERENCES, { expect: "Joined as" }]);
  await joining.succeeds();
}

export async function recoverLikeAUser(
  binary: string,
  device: IDevice,
  server: IServer,
  code: string,
): Promise<void> {
  const joining = new PtySession({
    label: `${device.name} join --recovery`,
    binary,
    env: device.env,
    args: ["join", server.url, "--recovery"],
  });

  await joining.steps([
    { expect: "Device name", send: "\r" },
    { expect: "Recovery code", send: `${code}\r` },
    ...PREFERENCES,
    { expect: "Joined as" },
  ]);

  await joining.succeeds();
}

export async function removeLikeAUser(binary: string, device: IDevice, name: string) {
  const removing = new PtySession({
    label: `${device.name} device rm`,
    binary,
    env: device.env,
    args: ["device", "rm", name],
  });

  await removing.steps([
    { expect: "Remove this device?", send: "y" },
    { expect: "Device removed" },
  ]);

  await removing.succeeds();
}
