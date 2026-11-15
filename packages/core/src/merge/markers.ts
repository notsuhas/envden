import { assembleLayout, layoutChanged } from "./layout/assemble.ts";
import { parseSides } from "./entries/sides.ts";
import { lineEnding, withLineEnding } from "./layout/line-ending.ts";
import { selectEntry } from "./selection.ts";
import type { IEnvEntry } from "./types.ts";

interface ILabels {
  mine: string;
  theirs: string;
}

type TMarked =
  | { kind: "keys"; bytes: Uint8Array; keys: string[] }
  | { kind: "file"; bytes: Uint8Array };

export function markConflicts(
  base: Uint8Array | undefined,
  local: Uint8Array,
  remote: Uint8Array,
  labels: ILabels,
): TMarked {
  const ending = lineEnding(local, remote);
  const keyed = base ? keyConflicts(base, local, remote, labels, ending) : undefined;

  return keyed ?? { kind: "file", bytes: markerBlock(local, remote, labels, ending) };
}

export function hasConflictMarkers(bytes: Uint8Array) {
  return /^(<{7}|={7}|>{7})(\s|$)/m.test(Buffer.from(bytes).toString("latin1"));
}

function keyConflicts(
  base: Uint8Array,
  local: Uint8Array,
  remote: Uint8Array,
  labels: ILabels,
  ending: string,
): TMarked | undefined {
  const parsed = parseSides(base, local, remote);
  if (parsed.kind === "conflict" || layoutChanged(parsed.files)) return undefined;
  const selected = new Map<string, IEnvEntry>();
  const blocks = new Map<string, Uint8Array>();

  for (const [key, [b, l, r]] of parsed.sides) {
    const result = selectEntry(key, b, l, r);

    if (result.kind === "conflict") {
      const theirs = r && withLineEnding(r.raw, ending);
      blocks.set(key, markerBlock(l?.raw, theirs, labels, ending));
    } else if (result.entry) selected.set(key, result.entry);
  }

  if (!blocks.size) return undefined;

  return {
    kind: "keys",
    bytes: assembleLayout(parsed.files, selected, ending, blocks),
    keys: [...blocks.keys()],
  };
}

function markerBlock(
  mine: Uint8Array | undefined,
  theirs: Uint8Array | undefined,
  labels: ILabels,
  ending: string,
) {
  return Buffer.concat([
    Buffer.from(`<<<<<<< ${oneLine(labels.mine)}${ending}`),
    terminated(mine, ending),
    Buffer.from(`=======${ending}`),
    terminated(theirs, ending),
    Buffer.from(`>>>>>>> ${oneLine(labels.theirs)}${ending}`),
  ]);
}

function terminated(bytes: Uint8Array | undefined, ending: string) {
  if (!bytes?.length) return new Uint8Array();
  if (bytes[bytes.length - 1] === 10) return bytes;

  return Buffer.concat([bytes, Buffer.from(ending)]);
}

function oneLine(label: string) {
  return label.replace(/[\r\n]+/g, " ");
}
