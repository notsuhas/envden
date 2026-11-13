export interface IAdapterNames {
  kind: string;
  impl: string;
  Kind: string;
  Impl: string;
}

const KIND = /^[a-z]+$/u;
const IMPL = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

function pascal(name: string): string {
  return name
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

export function adapterNames(kind: string, impl: string): IAdapterNames {
  if (!KIND.test(kind)) throw new Error("Kind must be one lowercase word, for example network");

  if (!IMPL.test(impl))
    throw new Error("Implementation must be kebab-case, for example secret-service");

  return { kind, impl, Kind: pascal(kind), Impl: pascal(impl) };
}
