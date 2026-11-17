import { presentation } from "./presentation.ts";

const outcomes =
  /\b(?:newer\s+on\s+server|held\s+back|in\s+sync|not\s+configured|not\s+found|permission\s+denied|conflicts?|pushed|pulled|skipped|removed|added|joined|unlocked|locked|changed|unchanged|created|deleted|failed|refused|cancelled|canceled|not|never|nothing|none|cannot|unable|denied|missing|invalid|expired|unavailable|enabled|disabled|success|error|warning|yes|no|on|off)\b/gi;

const identifiers =
  /<[^<>\n]+>(?:[^\s"'`<>]*[\w/])?|https?:\/\/[^\s"'`<>]+|(?:~?\/|\.{1,2}\/)[^\s"'`<>]+|(?<![\w])--?[a-zA-Z][\w-]*|(?<!\w)\.[A-Za-z][\w.-]*|(?<!\w)\.?[\w]+(?:[./@-][\w-]+)+\b|(?<!\w)[+-]?\d+(?:\.\d+)*(?!\w)|\b(?:Dockerfile|Makefile|LICENSE|README)\b|\b(?:[A-Z]+_[A-Z_\d]+|ROLLBACK|FORK|UNAUTHORIZED|LOCKED|CONFLICT|MOVING|INTERNAL|BUSY|(?!ERROR\b|ENVDEN\b|ENABLED\b|EXPIRED\b)E[A-Z]{2,})\b/g;

export function facts(text: string, names: string[] = []): string[] {
  let remaining = presentation(text)
    .replace(/\bcommand-argument value\b/g, "argument value")
    .replace(/\bfor (["'])\[([\w-]+)\]\1/g, "for '$2'")
    .replace(/\bfor \[([\w-]+)\]/g, "for argument '$1'")
    .replace(/(--[\w-]+) <[^>]+>/g, "$1");

  const result: string[] = [];

  for (const name of [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])${RegExp.escape(name)}(?![\\p{L}\\p{N}_])`,
      "gu",
    );

    remaining = remaining.replace(pattern, () => {
      result.push(`value:${name}`);

      return " ";
    });
  }

  remaining = remaining.replace(/(["'`])([^\n]*?)\1/g, (_, _quote: string, name: string) => {
    if (name.trim()) result.push(`value:${name}`);

    return " ";
  });

  remaining = remaining.replace(identifiers, (value) => {
    result.push(`value:${value.replace(/[.,;:!?]+$/, "")}`);

    return " ";
  });

  remaining = remaining.replace(
    /\b(?:device|repo(?:sitory)?|name|file(?:name)?)(?:\s*[:=]\s*|\s+)([\p{L}\p{N}_-]+)/giu,
    (whole: string, name: string) => {
      if (
        /^(?:is|was|has|not|added|removed|name|id|key|to|from|on|off|unlocked|locked|joined|password|address|setup|files|with|for|and|or|can|will|this|the)$/i.test(
          name,
        )
      )
        return whole;

      result.push(`value:${name}`);

      return " ";
    },
  );

  for (const match of remaining.matchAll(outcomes))
    result.push(`outcome:${match[0].toLowerCase().replace(/\s+/g, " ")}`);

  return result.sort();
}
