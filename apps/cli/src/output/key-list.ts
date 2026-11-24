export const SHOWN_KEYS = 3;

export function keyList(keys: string[], total = keys.length) {
  const shown = keys.slice(0, SHOWN_KEYS).join(", ");

  return total > SHOWN_KEYS ? `${shown} and ${total - SHOWN_KEYS} more` : shown;
}
