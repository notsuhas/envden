import { basename } from "node:path";
import type { HTMLBundle } from "bun";

export interface IPageAsset {
  body: ArrayBuffer;
  type: string;
}

interface IBuiltFile {
  path: string;
  type: string;
  bytes: () => Promise<ArrayBuffer>;
}

export async function pageAssets(bundle: HTMLBundle): Promise<Map<string, IPageAsset>> {
  const files = bundle.files ? compiledFiles(bundle.files) : await sourceFiles(bundle.index);
  const assets = new Map<string, IPageAsset>();

  for (const file of files) {
    const route = file.type.startsWith("text/html") ? "/" : `/${basename(file.path)}`;

    assets.set(route, { body: await file.bytes(), type: file.type });
  }

  return assets;
}

// The compiled binary embeds the bundle; read it from Bun's virtual filesystem.
function compiledFiles(files: NonNullable<HTMLBundle["files"]>): IBuiltFile[] {
  return files.map((file) => ({
    path: file.path,
    type: file.headers["content-type"],
    bytes: () => Bun.file(file.path).arrayBuffer(),
  }));
}

async function sourceFiles(index: string): Promise<IBuiltFile[]> {
  const result = await Bun.build({ entrypoints: [index] });

  return result.outputs.map((output) => ({
    path: output.path,
    type: output.type,
    bytes: () => output.arrayBuffer(),
  }));
}
