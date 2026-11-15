export function withDocsVersion(docs: string, version: string) {
  return docs
    .replace(/For v\d+\.\d+\.\d+, this prints:/, `For v${version}, this prints:`)
    .replace(/(this prints:\n\n```text\n)\d+\.\d+\.\d+(\n```)/, `$1${version}$2`);
}
