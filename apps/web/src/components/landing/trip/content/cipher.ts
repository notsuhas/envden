export const CIPHER_ROWS = 6;
export const CIPHER_COLUMNS = 28;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function nextState(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

export function cipherLine(length: number, seed: number): string {
  let state = nextState(seed >>> 0);
  let line = "";

  for (let index = 0; index < length; index += 1) {
    state = nextState(state);
    line += ALPHABET.charAt(state >>> 26);
  }

  return line;
}
