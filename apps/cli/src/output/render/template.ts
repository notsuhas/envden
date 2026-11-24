import type { ITemplateDrift } from "../../templates/compare.ts";

export function templateLine(name: string, template: string, drift: ITemplateDrift) {
  const parts = [
    ...(drift.missing.length ? [`missing ${drift.missing.join(", ")}`] : []),
    ...(drift.extra.length ? [`extra ${drift.extra.join(", ")}`] : []),
  ];

  return `${name} vs ${template}: ${parts.join("; ")}`;
}
