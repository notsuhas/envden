import type { ESTree } from "vite-plus/lint/plugins";

export function subprocessModule(value: unknown): boolean {
  return /^(?:(?:node:)?child_process|execa(?:\/.*)?|zx(?:\/.*)?)$/.test(String(value));
}

function propertyName(property: ESTree.Node): string | undefined {
  if (property.type === "Identifier") return property.name;
  if (property.type === "Literal") return String(property.value);

  return undefined;
}

export function loadsSubprocess(source: ESTree.Node | undefined): boolean {
  if (source?.type !== "Literal") return false;

  return subprocessModule(source.value) || source.value === "bun";
}

function bunProcessProperty(node: ESTree.Node): boolean {
  return ["spawn", "spawnSync", "$"].includes(propertyName(node) ?? "");
}

export function exemptProcessPath(path: string): boolean {
  // The process boundary implements the only production subprocess API.
  if (path.includes("/packages/core/src/process/")) return true;
  // The fixture runner must execute oxlint against deliberately invalid source.
  if (path.endsWith("/tools/oxlint-plugin-envden/__tests__/utils.ts")) return true;

  // The signing test executes the release script in an isolated process.
  return path.endsWith("/scripts/release/__tests__/sign.test.ts");
}

export function registerBunImport(
  specifier: ESTree.ImportDeclaration["specifiers"][number],
  aliases: Set<string>,
): boolean {
  if (specifier.type === "ImportSpecifier") return bunProcessProperty(specifier.imported);
  aliases.add(specifier.local.name);

  return false;
}

export function registerProcessAlias(
  node: ESTree.VariableDeclarator,
  groups: Set<string>[],
): boolean {
  const name = identifierName(node.init);
  const aliases = groups.find((known) => known.has(name));
  if (!aliases) return false;
  if (node.id.type !== "Identifier") return true;
  aliases.add(node.id.name);

  return false;
}

export function forbiddenMember(
  name: string,
  property: ESTree.Node,
  bunAliases: Set<string>,
  processAliases: Set<string>,
): boolean {
  if (bunAliases.has(name)) return bunProcessProperty(property);
  if (processAliases.has(name)) return propertyName(property) === "binding";

  return false;
}

function identifierName(node: ESTree.Node | null | undefined): string {
  if (!node) return "";

  return node.type === "Identifier" ? node.name : "";
}
