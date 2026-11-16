export function isLiteralFile(path: string): boolean {
  return /(?:^|\/)\.env(?:\.[^/]*)?$/.test(path) || path.endsWith("shared.env");
}
