import { test, expect } from "bun:test";
import { projectFolder, skippedFolder } from "../folders.ts";

const anywhere = { home: false, project: false };

test("hidden and dependency folders are skipped anywhere", () => {
  for (const name of [".codex", "node_modules"]) expect(skippedFolder(name, anywhere)).toBe(true);

  for (const name of ["Work", "pods-demo", "go", "target"])
    expect(skippedFolder(name, anywhere)).toBe(false);
});

test("tool and media folders are skipped in the home folder, build output inside a project", () => {
  expect(skippedFolder("go", { home: true, project: false })).toBe(true);
  expect(skippedFolder("target", { home: false, project: true })).toBe(true);
  expect(skippedFolder("target", { home: true, project: false })).toBe(false);

  expect(projectFolder(["src", "Cargo.toml"])).toBe(true);
  expect(projectFolder(["src", ".git"])).toBe(true);
  expect(projectFolder(["target", "notes"])).toBe(false);
});
