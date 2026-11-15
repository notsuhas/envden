// dependency and cache folders never hold checkouts worth syncing
const everywhere = new Set([
  "node_modules",
  "bower_components",
  "Pods",
  "Carthage",
  "DerivedData",
  "venv",
  "__pycache__",
]);

// build output and vendored code, but a top-level ~/target/svc is a project
const projectOutput = new Set(["target", "build", "dist", "vendor", "third_party"]);

// home-level tool and media folders; a project named go elsewhere is still scanned
const homeLevel = new Set([
  "Library",
  "Applications",
  "Pictures",
  "Music",
  "Movies",
  "AppData",
  "snap",
  "go",
  "miniconda3",
  "anaconda3",
]);

const manifests = new Set([
  ".git",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pyproject.toml",
  "composer.json",
  "Gemfile",
  "Package.swift",
  "CMakeLists.txt",
  "Makefile",
]);

export interface IFolderPlace {
  home: boolean;
  project: boolean;
}

// hidden folders hold tool state (~/.codex, ~/.gradle), not projects; worktrees there come from git
export function skippedFolder(name: string, place: IFolderPlace) {
  return (
    name.startsWith(".") ||
    everywhere.has(name) ||
    (place.home && homeLevel.has(name)) ||
    (place.project && projectOutput.has(name))
  );
}

export function projectFolder(names: string[]) {
  return names.some((name) => manifests.has(name));
}
