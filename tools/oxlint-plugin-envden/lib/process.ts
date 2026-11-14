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
  const name = memberOwner(node.init) ?? "";
  const aliases = groups.find((known) => known.has(name));
  if (!aliases) return false;
  if (node.id.type !== "Identifier") return true;
  aliases.add(node.id.name);

  return false;
}

function processModule(value: unknown): boolean {
  return value === "process" || value === "node:process";
}

// Records default and namespace node:process aliases and returns the named imports to report.
export function registerProcessImport(
  node: ESTree.ImportDeclaration,
  aliases: Set<string>,
): ESTree.ImportDeclaration["specifiers"] {
  if (!processModule(node.source.value)) return [];

  return node.specifiers.filter((specifier) => {
    if (specifier.type !== "ImportSpecifier") {
      aliases.add(specifier.local.name);

      return false;
    }

    return ["binding", "getBuiltinModule"].includes(propertyName(specifier.imported) ?? "");
  });
}

export function reexportsSubprocess(source: ESTree.Node | null | undefined): boolean {
  return source?.type === "Literal" && (subprocessModule(source.value) || source.value === "bun");
}

const GLOBAL_RUNTIMES: Record<string, "bun" | "process"> = { Bun: "bun", process: "process" };

function globalMember(node: ESTree.Node): node is ESTree.MemberExpression {
  return (
    node.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    node.object.name === "globalThis"
  );
}

function globalRuntime(node: ESTree.Node): "bun" | "process" | undefined {
  return globalMember(node) ? GLOBAL_RUNTIMES[propertyName(node.property) ?? ""] : undefined;
}

export function memberOwner(object: ESTree.Node | null | undefined): string | undefined {
  if (!object) return undefined;
  if (object.type === "Identifier") return object.name;

  const runtime = globalRuntime(object);

  return runtime === "bun" ? "Bun" : runtime;
}

function processOwner(object: ESTree.Node, aliases: Set<string>): boolean {
  return object.type === "Identifier"
    ? aliases.has(object.name)
    : globalRuntime(object) === "process";
}

export function loadsBuiltinSubprocess(
  node: ESTree.CallExpression,
  processAliases: Set<string>,
): boolean {
  const callee = node.callee;

  if (callee.type !== "MemberExpression" || propertyName(callee.property) !== "getBuiltinModule")
    return false;

  return processOwner(callee.object, processAliases) && loadsSubprocess(node.arguments[0]);
}

export function requiresSubprocess(node: ESTree.CallExpression): boolean {
  return (
    node.callee.type === "Identifier" &&
    node.callee.name === "require" &&
    loadsSubprocess(node.arguments[0])
  );
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
