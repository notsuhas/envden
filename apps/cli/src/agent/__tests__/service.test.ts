import { test, expect } from "bun:test";
import { serviceDefinition } from "../service/generate.ts";
import { installHostService } from "../service/install.ts";

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
        },
        fixtureClock,
      );

    expect(commands[0]?.[1]).toBe(platform === "darwin" ? "bootout" : "/End");
    expect(commands[1]?.[1]).toBe(platform === "darwin" ? "bootstrap" : "/Create");
  });
