const OUTSIDE_BINARY = [/^apps\/web\//, /^docs\//, /^\.changeset\//, /^[^/]+\.md$/, /^LICENSE$/];

export function touchesBinary(paths: readonly string[]) {
  return paths.some((path) => !OUTSIDE_BINARY.some((pattern) => pattern.test(path)));
}
