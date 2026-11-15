import { test, expect } from "bun:test";
import { projectFolder, skippedFolder } from "../folders.ts";

const anywhere = { home: false, project: false };

test("hidden and dependency folders are skipped anywhere", () => {
  for (const name of [
    ".codex",
    ".t3",
    ".gradle",
    ".venv",
    ".conda",
    "node_modules",
    "Pods",
    "venv",
  ])
    expect(skippedFolder(name, anywhere)).toBe(true);

  for (const name of ["Work", "app", "dotfiles", "pods-demo", "go", "target", "AppData"])
    expect(skippedFolder(name, anywhere)).toBe(false);
});

test("tool and media folders are skipped in the home folder, build output inside a project", () => {
  for (const name of ["Library", "Movies", "AppData", "snap", "go", "miniconda3", "anaconda3"])
    expect(skippedFolder(name, { home: true, project: false })).toBe(true);

  for (const name of ["target", "build", "dist", "vendor", "third_party"]) {
    expect(skippedFolder(name, { home: false, project: true })).toBe(true);
    expect(skippedFolder(name, { home: true, project: false })).toBe(false);
  }

  expect(projectFolder(["src", "Cargo.toml"])).toBe(true);
  expect(projectFolder(["src", ".git"])).toBe(true);
  expect(projectFolder(["target", "notes"])).toBe(false);
});
