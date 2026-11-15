const encoder = new TextEncoder();

export function isDeviceName(name: string) {
  const length = encoder.encode(name).length;

  return length >= 1 && length <= 64 && !/\p{Cf}/u.test(name);
}
