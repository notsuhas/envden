import { expect, test } from "bun:test";
import {
  chmod,
  link,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRcShellAdapter } from "../adapter.ts";
import { editRc } from "../files/edit.ts";

for (const step of ["resolved", "opened", "read"] as const) {
  test(`rc swap after ${step} cannot copy private bytes into the checkout`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-rc-swap-"));

    try {
      const path = join(home, "rc");
      const target = join(home, "checkout");
      const privateFile = join(home, "private");
      const original = join(home, "original");
      await writeFile(target, "# user\n");
      await writeFile(privateFile, "PRIVATE BYTES");
      await symlink(target, path);

      const swap = async () => {
        await rename(target, original);
        await symlink(privateFile, target);
      };

      let result = "";

      const editing = editRc(
        path,
        (current) => {
          result = current;

          return current + "# edited\n";
        },
        undefined,
        { [step]: swap },
      );

      await Promise.resolve(expect(editing).rejects.toThrow());

      expect(result).not.toContain("PRIVATE BYTES");
      expect(await readFile(privateFile, "utf8")).toBe("PRIVATE BYTES");
      await unlink(target);
      await writeFile(target, "checkout replacement");
      expect(await readFile(target, "utf8")).not.toContain("PRIVATE BYTES");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("rc editing rejects hard links and non-files without changing their contents", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rc-links-"));

  try {
    const original = join(home, "original");
    const path = join(home, "rc");
    await writeFile(original, "private");
    await link(original, path);
    await Promise.resolve(expect(editRc(path, () => "replacement")).rejects.toThrow());
    await Promise.resolve(expect(editRc(home, () => "replacement")).rejects.toThrow());
    expect(await readFile(original, "utf8")).toBe("private");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

for (const operation of ["install", "uninstall"] as const) {
  test(`${operation} never copies a privately resolved rc into a swapped checkout file`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-rc-disclosure-"));

    try {
      const path = join(home, "rc");
      const checkout = join(home, "checkout");
      const privateFile = join(home, "private");
      await writeFile(privateFile, "PRIVATE BYTES\n# hook\n");
      await symlink(privateFile, checkout);
      await symlink(checkout, path);

      await editRc(
        path,
        (current) =>
          operation === "install" ? current + "# installed\n" : current.replace("# hook\n", ""),
        undefined,
        {
          read: async () => {
            await unlink(checkout);
            await writeFile(checkout, "checkout replacement");
          },
        },
      );

      expect(await readFile(checkout, "utf8")).toBe("checkout replacement");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("rc install preserves non-UTF-8 bytes, mode and CRLF without duplicate blocks", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rc-bytes-"));

  try {
    const adapter = createRcShellAdapter("bash", home);
    const original = Buffer.from([35, 32, 255, 13, 10]);
    await writeFile(adapter.rcPath(), original, { mode: 0o640 });
    await adapter.install("/opt/envden");
    await adapter.install("/opt/envden");
    const current = await readFile(adapter.rcPath());
    expect(current.subarray(0, original.length)).toEqual(original);
    expect(current.toString().match(/# >>> envden >>>/g)).toHaveLength(1);
    expect(current.toString().replaceAll("\r\n", "")).not.toContain("\n");

    expect((await stat(adapter.rcPath())).mode & 0o777).toBe(0o640);

    await adapter.uninstall();
    expect(await readFile(adapter.rcPath())).toEqual(original);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("rc editing replaces read-only files and preserves their permissions", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rc-readonly-"));
  const path = join(home, "rc");

  try {
    await writeFile(path, "# user\n");
    await chmod(path, 0o444);
    const mode = (await stat(path)).mode & 0o777;
    await editRc(path, (current) => current + "# edited\n");
    expect(await readFile(path, "utf8")).toBe("# user\n# edited\n");
    expect((await stat(path)).mode & 0o777).toBe(mode);
    expect(await readdir(home)).toEqual(["rc"]);
  } finally {
    await chmod(path, 0o600);
    await rm(home, { recursive: true, force: true });
  }
});

test("rc append during editing is retained and reported as a conflict", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rc-append-"));
  const path = join(home, "rc");

  try {
    await writeFile(path, "original");

    await Promise.resolve(
      expect(
        editRc(path, () => "replacement", undefined, {
          read: () => writeFile(path, "original appended"),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );

    expect(await readFile(path, "utf8")).toBe("original appended");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

import { bashRcPath } from "../files/bash-profile.ts";

test("macOS bash chooses a login profile unless it sources bashrc", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-profile-"));

  try {
    expect(bashRcPath(home, "darwin")).toBe(join(home, ".bash_profile"));

    if (process.platform === "darwin")
      expect(createRcShellAdapter("bash", home).rcPath()).toBe(join(home, ".bash_profile"));

    await writeFile(join(home, ".bash_profile"), "# user\n");
    expect(bashRcPath(home, "darwin")).toBe(join(home, ".bash_profile"));

    if (process.platform === "darwin")
      expect(createRcShellAdapter("bash", home).rcPath()).toBe(join(home, ".bash_profile"));

    await writeFile(join(home, ".bash_profile"), 'source "$HOME/.bashrc"\n');
    expect(bashRcPath(home, "darwin")).toBe(join(home, ".bashrc"));
    expect(bashRcPath(home, "linux")).toBe(join(home, ".bashrc"));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

for (const [file, content, expected] of [
  [".profile", "# user", ".profile"],
  [".bash_login", "# user", ".bash_login"],
  [".bashrc", "# >>> envden >>>", ".bashrc"],
  [".bash_profile", "[ -f ~/.bashrc ] && . ~/.bashrc", ".bashrc"],
  [".bash_profile", "if true; then . ~/.bashrc; fi", ".bashrc"],
  [".bash_profile", "[[ -r ~/.bashrc ]] && source ~/.bashrc", ".bashrc"],
  [".bash_profile", "# source ~/.bashrc", ".bash_profile"],
])
  test(`bash selects ${expected} for ${content}`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-login-"));

    try {
      await writeFile(join(home, file!), content!);
      expect(bashRcPath(home, "darwin")).toBe(join(home, expected!));
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

test("rc install and uninstall keep user lines after an orphan start marker", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rc-orphan-"));

  try {
    const adapter = createRcShellAdapter("zsh", home);
    const original = "# >>> envden >>>\n# user line\n";
    await writeFile(adapter.rcPath(), original);
    expect(await adapter.installed()).toBe(false);
    await adapter.install("/opt/envden");
    expect(await adapter.installed()).toBe(true);
    await adapter.uninstall();
    expect(await readFile(adapter.rcPath(), "utf8")).toBe(original);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
