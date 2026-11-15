import type { IFailure } from "./failure.ts";
import { redactSecrets } from "./redact.ts";

interface IReportFacts {
  version: string;
  os: string;
  arch: string;
  install: string;
  args: string[];
  failure: IFailure;
  serverLog: string | undefined;
  files: { path: string; exists: boolean }[];
  userHome: string;
}

const LOG_LINES = 80;

function fenced(text: string): string {
  return ["~~~", text.trimEnd(), "~~~"].join("\n");
}

function errorSection(failure: IFailure): string[] {
  return [
    "## Error",
    "",
    `- Code: ${failure.code}`,
    `- Message: ${failure.message}`,
    ...failure.causes.map((cause) => `- Caused by: ${cause}`),
    ...(failure.stack ? ["", fenced(failure.stack)] : []),
  ];
}

function logSection(serverLog: string | undefined): string[] {
  const tail = serverLog?.trimEnd().split("\n").slice(-LOG_LINES).join("\n");

  return [`## Server log (last ${LOG_LINES} lines)`, "", tail ? fenced(tail) : "No server log."];
}

function withHome(text: string, userHome: string): string {
  return userHome.length > 1 ? text.replaceAll(userHome, "~") : text;
}

export function reportDocument(facts: IReportFacts): string {
  const document = [
    "# envden problem report",
    "",
    `- Version: ${facts.version}`,
    `- OS: ${facts.os} (${facts.arch})`,
    `- Install method: ${facts.install}`,
    `- Command: envden ${facts.args.join(" ")}`,
    "",
    ...errorSection(facts.failure),
    "",
    ...logSection(facts.serverLog),
    "",
    "## Other files",
    "",
    "Paths only; contents are not included.",
    "",
    ...facts.files.map((file) => `- ${file.path}${file.exists ? "" : " (missing)"}`),
    "",
  ].join("\n");

  return redactSecrets(withHome(document, facts.userHome));
}
