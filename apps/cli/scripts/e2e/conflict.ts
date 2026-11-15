import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { same, statusSays } from "./checks.ts";
import type { IDevice } from "./device.ts";
import { failure } from "./failure.ts";
import { attempt, run } from "./run.ts";

const mine = "API_URL=https://api.example.com\nTOKEN=from-b\n";
const theirs = "API_URL=https://api.example.com\nTOKEN=from-a\n";
const resolved = "API_URL=https://api.example.com\nTOKEN=agreed\n";
const MARKERS = ["<<<<<<<", "TOKEN=from-a", "TOKEN=from-b", ">>>>>>>"];

function expect(ok: boolean, message: string, output: string): void {
  if (!ok) throw failure(message, output);
}

async function pullConflict(binary: string, b: IDevice): Promise<string> {
  const pulled = await attempt([binary, "pull", "--yes"], b.env, b.checkout);
  const reported = pulled.code === 3 && pulled.output.includes("Conflict in .env");
  expect(reported, "device-b pull should report the conflict and exit 3", pulled.output);

  await statusSays(binary, b, "Conflicts");

  const args = [binary, "resolve", "--list", "--json"];
  const listed = await run("device-b resolve --list", args, b.env, b.checkout);
  const file = (JSON.parse(listed) as { file: string }[])[0]?.file;
  expect(file !== undefined, "resolve --list named no conflict file", listed);

  return file!;
}

async function resolveByEditing(binary: string, b: IDevice, file: string): Promise<void> {
  const markers = await readFile(file, "utf8");
  const both = MARKERS.every((part) => markers.includes(part));
  expect(both, "the conflict file must show both versions between markers", markers);

  const refused = await attempt([binary, "resolve"], b.env, b.checkout);
  const guarded = refused.code !== 0 && refused.output.includes("Conflict markers");
  expect(guarded, "resolve must refuse while markers remain", refused.output);

  await writeFile(file, resolved);
  await run("device-b resolve", [binary, "resolve"], b.env, b.checkout);
}

// both devices edit the same key; nothing may be lost and resolve must not guess
export async function conflictRound(binary: string, a: IDevice, b: IDevice): Promise<void> {
  await writeFile(join(a.checkout, ".env"), theirs);
  await writeFile(join(b.checkout, ".env"), mine);
  await run("device-a push", [binary, "push", "--yes"], a.env, a.checkout);

  await resolveByEditing(binary, b, await pullConflict(binary, b));

  await run("device-b push", [binary, "push", "--yes"], b.env, b.checkout);
  await run("device-a pull", [binary, "pull", "--yes"], a.env, a.checkout);
  await same(a, b, resolved, "after resolving the conflict");
}
