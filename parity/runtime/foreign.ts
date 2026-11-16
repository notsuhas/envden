// Caches other tools write when envden runs them; their bytes differ on every run.
const FOREIGN_CACHES = [/(?:^|\/)\.cache\/powershell\//];

export function isForeignCache(relative: string): boolean {
  return FOREIGN_CACHES.some((pattern) => pattern.test(relative));
}
