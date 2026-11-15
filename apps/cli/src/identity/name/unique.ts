import { fitDeviceName } from "./fit.ts";

export function uniqueDeviceName(name: string, taken: Iterable<string>) {
  const names = new Set(taken);
  if (!names.has(name)) return name;

  for (let number = 2; ; number++) {
    const suffix = `-${number}`;
    const candidate = fitDeviceName(name, suffix.length) + suffix;

    if (!names.has(candidate)) return candidate;
  }
}
