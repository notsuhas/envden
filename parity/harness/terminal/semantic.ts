import { jsonOutput } from "./json.ts";
import type { Normalizer } from "../normalize.ts";
import { stripVTControlCharacters } from "node:util";

const outcomes = new Set(
  "synced conflict conflicts pushed pulled joined added removed locked unlocked failed error success cancelled aborted refused rejected expired missing invalid wrong unavailable unreachable created updated deleted saved restored tracked untracked enabled disabled installed uninstalled pending ready complete completed repair repaired rotated replaced uploaded downloaded yes no not never cannot without keep mine take server merge local remote".split(
    " ",
  ),
);

export function plainTerminal(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/[\u2500-\u259f\u25a0-\u25ff\u2800-\u28ff✓✔✗✘✖•→↳]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function facts(text: string, names: ReadonlySet<string> = new Set()): string[] {
  const plain = plainTerminal(text);

  const tokens =
    plain.match(
      /\b(?:name|named|alias|device)\s*[:=]\s*[\w-]+|<[^<>]+>(?:[/\\][\w.<>:/-]+)*|["'`]([^"'`\n]+)["'`]|(?:https?:\/\/|\/|\.\.?\/)[^\s,;!?]+|--?[a-z][\w-]*|(?<!\w)\.?[\w-]+(?:\.[\w-]+)+\b|\.[A-Za-z][\w.-]*|\b\d+(?:\.\d+)?\b|[\w-]+/gi,
    ) ?? [];

  return tokens.flatMap((token) => {
    if (/^(?:name|named|alias|device)\s*[:=]/i.test(token))
      return [token.replace(/\s*[:=]\s*/, "=")];

    if (/^["'`]/.test(token)) {
      return [quotedFact(token, names)];
    }

    if (names.has(token)) return [token];
    if (outcomes.has(token.toLowerCase())) return [token.toLowerCase()];

    if (/[<>/.\d]/.test(token) || token.startsWith("-") || /^[A-Z][A-Z_]+$/.test(token))
      return [token];

    return [];
  });
}

function quotedFact(token: string, names: ReadonlySet<string>) {
  const quoted = token.slice(1, -1);
  const parameter = /^\[([a-z][\w-]*)\]$/.exec(quoted)?.[1];

  return parameter && names.has(parameter) ? parameter : quoted;
}

function helpNames(text: string): string[] {
  const names = new Set(text.match(/--?[a-z][\w-]*/gi) ?? []);
  let commands = false;

  for (const line of text.split("\n")) {
    if (/^\s*(?:commands|subcommands):/i.test(line)) commands = true;
    else if (/^\s*\w[\w ]+:\s*$/.test(line)) commands = false;
    else if (commands) {
      const name = /^\s+([a-z][\w-]*)\b/.exec(line)?.[1];
      if (name) names.add(name);
    }
  }

  return [...names].sort();
}

export function semanticOutput(text: string, label: string, names?: ReadonlySet<string>): unknown {
  if (/(?:^|\s)--help(?:\s|$)/.test(label)) return helpNames(text);

  if (/(?:^|\s)--json(?:\s|$)/.test(label))
    return text.trim() ? { json: JSON.parse(text) } : { empty: true };

  const tokens = facts(text, names);

  return /^error\s*:/i.test(plainTerminal(text)) ? tokens.sort() : tokens;
}

export function normalizedOutput(
  text: string,
  label: string,
  n: Normalizer,
  names: ReadonlySet<string>,
  strict: boolean,
  mixed = false,
) {
  if (strict) return n.text(text);

  if (/(?:^|\s)--json(?:\s|$)/.test(label)) {
    const parsed = jsonOutput(text, mixed);
    if (!("json" in parsed)) return parsed;

    return n.value({
      json: parsed.json,
      ...(parsed.before ? { terminal: facts(n.text(parsed.before), names) } : {}),
    });
  }

  const structured = /(?:^|\s)--(?:json|help)(?:\s|$)/.test(label);

  return n.value(semanticOutput(structured ? text : n.text(text), label, names));
}
