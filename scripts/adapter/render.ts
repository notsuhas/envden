import type { IAdapterNames } from "./names.ts";

export function render(template: string, names: IAdapterNames): string {
  const tokens: Record<string, string> = { ...names };

  return template.replace(/\{\{(\w+)\}\}/gu, (_, token: string) => {
    const value = tokens[token];
    if (value === undefined) throw new Error(`Unknown template token: ${token}`);

    return value;
  });
}
