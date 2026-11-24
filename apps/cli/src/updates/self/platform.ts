export function releasePlatform(platform: string, arch: string, glibc?: string) {
  return `${platform}-${arch}${platform === "linux" && !glibc ? "-musl" : ""}`;
}

export function currentReleasePlatform() {
  const report = process.report?.getReport();

  const glibc =
    report &&
    typeof report === "object" &&
    "header" in report &&
    typeof report.header === "object" &&
    report.header &&
    "glibcVersionRuntime" in report.header
      ? String(report.header.glibcVersionRuntime)
      : undefined;

  return releasePlatform(process.platform, process.arch, glibc);
}
