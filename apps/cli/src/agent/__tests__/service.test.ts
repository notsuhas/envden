import { test, expect } from "bun:test";
import { serviceDefinition } from "../service/generate.ts";
import { installHostService } from "../service/install.ts";
import { writeThrough } from "../write-through.ts";

const fixtureClock = () => 1800000000000;

test("login service definitions quote paths and start at login", () => {
  expect(serviceDefinition("darwin", "/bin/env den&", "/data", "/log").content).toContain(
    "env den&amp;",
  );

  expect(serviceDefinition("darwin", "/bin/envden", "/data", "/log").content).toContain(
    "<key>RunAtLoad</key><true/>",
  );

  const linux = serviceDefinition("linux", '/bin/env den"', "/data%name", "/log");
  expect(linux.content).toContain('"/data%%name"');
  expect(linux.content).toContain("WantedBy=default.target");

  const logged = serviceDefinition("linux", "/bin/envden", "/data", "/logs%h/envden.log").content;
  expect(logged).toContain("StandardOutput=append:/logs%%h/envden.log\n");
  expect(logged).toContain("StandardError=append:/logs%%h/envden.log\n");
  expect(() => serviceDefinition("linux", "/bin/envden", "/data", "/log\nUser=root")).toThrow();

  expect(serviceDefinition("win32", "C:\\envden.exe", "C:\\data", "C:\\log").content).toContain(
    "LogonTrigger",
  );

  expect(() => serviceDefinition("other", "", "", "")).toThrow();
});

test("service installer writes and enables through supplied effects", async () => {
  const writes: string[] = [];
  const commands: string[][] = [];

  const result = await installHostService(
    {
      platform: "linux",
      executable: "/bin/envden",
      userHome: "/test",
      home: "/test/envden",
      uid: 1,
      write: async (path) => {
        writes.push(path);
      },
      run: async (args) => {
        commands.push(args);
      },
      pause: async () => {},
    },
    fixtureClock,
  );

  expect(writes).toEqual([result.path]);

  expect(commands).toEqual([
    ["systemctl", "--user", "daemon-reload"],
    ["systemctl", "--user", "enable", "envden.service"],
    ["systemctl", "--user", "restart", "envden.service"],
  ]);
});

for (const platform of ["darwin", "win32"])
  test(`${platform} service install stops before replacing`, async () => {
    const commands: string[][] = [];

    for (let pass = 0; pass < 2; pass++)
      await installHostService(
        {
          platform,
          executable: "/bin/envden",
          userHome: "/test",
          home: "/test/envden",
          uid: 1,
          write: async () => {},
          run: async (args) => {
            commands.push(args);
          },
          pause: async () => {},
        },
        fixtureClock,
      );

    expect(commands[0]?.[1]).toBe(platform === "darwin" ? "bootout" : "/End");
    expect(commands[1]?.[1]).toBe(platform === "darwin" ? "bootstrap" : "/Create");
  });

test("launchd bootstrap retries while the old job is still unloading", async () => {
  const commands: string[][] = [];
  let pauses = 0;
  let busy = 2;

  await installHostService(
    {
      platform: "darwin",
      executable: "/bin/envden",
      userHome: "/test",
      home: "/test/envden",
      uid: 1,
      write: async () => {},
      run: async (args) => {
        commands.push(args);
        if (args[1] === "bootstrap" && busy-- > 0) throw new Error("Bootstrap failed: 5");
      },
      pause: async () => {
        pauses++;
      },
    },
    fixtureClock,
  );

  expect(commands.filter((args) => args[1] === "bootstrap")).toHaveLength(3);
  expect(pauses).toBe(2);
});

for (const platform of ["darwin", "linux"])
  test(`${platform} service install writes through a service folder and file linked into dotfiles`, async () => {
    const { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } =
      await import("node:fs/promises");

    const { tmpdir } = await import("node:os");
    const { dirname, join } = await import("node:path");
    const { serviceFile } = await import("../service/location.ts");
    const userHome = await mkdtemp(join(tmpdir(), "envden-service-"));

    try {
      const path = serviceFile(platform, userHome, join(userHome, ".envden"))!;
      const dotfiles = join(userHome, "dotfiles", "services");
      await mkdir(dotfiles, { recursive: true });
      await mkdir(dirname(dirname(path)), { recursive: true });
      await symlink(dotfiles, dirname(path));
      await writeFile(join(dotfiles, "tracked"), "old");
      await symlink(join(dotfiles, "tracked"), path);

      await installHostService(
        {
          platform,
          executable: "/bin/envden",
          userHome,
          home: join(userHome, ".envden"),
          uid: 1,
          write: writeThrough,
          run: async () => {},
          pause: async () => {},
        },
        fixtureClock,
      );

      expect((await lstat(dirname(path))).isSymbolicLink()).toBe(true);
      expect((await lstat(path)).isSymbolicLink()).toBe(true);
      expect(await readFile(join(dotfiles, "tracked"), "utf8")).toContain("/bin/envden");
    } finally {
      await rm(userHome, { recursive: true, force: true });
    }
  });
