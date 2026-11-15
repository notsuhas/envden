export const REPOSITORY = "notsuhas/envden";

export const NEW_ISSUE_URL = `https://github.com/${REPOSITORY}/issues/new`;

const MAX_URL = 7000;

const TRUNCATED = "\n\n(Truncated. The full report is on the reporter's machine.)";

function url(title: string, body: string): string {
  return `${NEW_ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export function issueTitle(args: readonly string[], code: string): string {
  const command = args.find((arg) => /^[a-z][a-z-]*$/.test(arg));

  return `envden ${command ?? ""} fails with ${code}`.replace(/\s+/g, " ");
}

function wellFormed(text: string): string {
  return text.replace(/\p{Cs}/gu, "\uFFFD");
}

function prefix(text: string, length: number): string {
  return wellFormed(text.slice(0, length));
}

export function issueUrl(title: string, report: string): string {
  const body = wellFormed(report);
  if (url(title, body).length <= MAX_URL) return url(title, body);

  const budget = MAX_URL - url(title, TRUNCATED).length;
  let [low, high] = [0, body.length];

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (encodeURIComponent(prefix(body, middle)).length <= budget) low = middle;
    else high = middle - 1;
  }

  return url(title, prefix(body, low) + TRUNCATED);
}
