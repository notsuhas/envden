import { expect } from "bun:test";

export class Reference {
  commits: (string | undefined)[];
  seen = [0, 0];
  edited = [false, false];
  removal = [false, false];
  required = new Set<string>();

  constructor(initial: string) {
    this.commits = [initial];
  }

  user(device: number, before: string | undefined, next: string | undefined) {
    if (before !== undefined) this.required.delete(before);
    if (next !== undefined) this.required.add(next);
    this.edited[device] = true;
    this.removal[device] = next === undefined;
  }

  observe(device: number, next: string | undefined) {
    if (next !== undefined) this.removal[device] = false;
    if (next === this.commits.at(-1)) this.seen[device] = this.commits.length - 1;
  }

  commit(device: number, next: string | undefined) {
    if (next === this.commits.at(-1)) return;
    if (next === undefined) expect(this.removal[device]).toBe(true);

    if (next !== undefined && this.commits.includes(next)) {
      expect(this.edited[device]).toBe(true);
      expect(this.seen[device]).toBe(this.commits.length - 1);
    }

    this.commits.push(next);
    this.seen[device] = this.commits.length - 1;
    this.edited[device] = false;
  }

  survive(values: (string | undefined)[]) {
    for (const bytes of this.required) expect(values).toContain(bytes);
  }
}

export function sequences() {
  const singles = Array.from({ length: 20 }, (_, op) => [op]);
  let seed = 731;

  const sampled = Array.from({ length: 24 }, () =>
    Array.from({ length: 8 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed % 20;
    }),
  );

  return [...singles, ...sampled];
}
