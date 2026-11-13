export function cellNoise(row: number, column: number, epoch: number): number {
  let state =
    (Math.imul(row + 1, 73856093) ^
      Math.imul(column + 1, 19349663) ^
      Math.imul(epoch + 1, 83492791)) >>>
    0;

  state = (Math.imul(state ^ (state >>> 15), 2246822519) ^ (state >>> 13)) >>> 0;

  return state / 4294967296;
}
