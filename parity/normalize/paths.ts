export function joinWrappedPaths(text: string, paths: readonly string[]): string {
  for (const path of paths) {
    if (!path) continue;

    const pattern = Array.from(path, (char) => RegExp.escape(char)).join(
      "(?:\\n[ \\t]*(?:[│┃][ \\t]*)?)?",
    );

    text = text.replaceAll(new RegExp(pattern, "gu"), () => path);
  }

  return text;
}
