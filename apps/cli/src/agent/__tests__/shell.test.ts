import { test, expect } from "bun:test";
import { manageShell } from "../shell.ts";
import { createAdapters } from "../../adapters.ts";

test("shell management installs and uninstalls the selected shell", async () => {
  const adapters = createAdapters();
  const calls: string[] = [];

  adapters.shell = (shell) => ({
    id: shell,
    installed: async () => false,
    install: async (binary) => {
      calls.push(`install:${binary}`);
    },
    uninstall: async () => {
      calls.push("uninstall");
    },
    rcPath: () => "",
    hookSnippet: () => "",
  });

  await manageShell(adapters, "install", "fish");
  await manageShell(adapters, "uninstall", "fish");
  expect(calls).toEqual([`install:${process.execPath}`, "uninstall"]);
});
