export type TRandom = (length: number) => Uint8Array;
export const randomBytes: TRandom = (length) => crypto.getRandomValues(new Uint8Array(length));
