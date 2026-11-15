import { expect, test } from "bun:test";
import { createSharedFixture } from "../../../sync/__tests__/shared-fixture.ts";
import { dashboardClient } from "../../server/__tests__/client.ts";

const syncFixture = createSharedFixture();

test.each([
  ["an empty body", undefined],
  ["no name", {}],
  ["a number", { name: 5 }],
  ["an empty name", { name: "" }],
  ["a huge name", { name: "x".repeat(300) }],
  ["an extra field", { name: "laptop", device: "second" }],
] as const)("rename rejects %s", async (_name, body) => {
  const f = await syncFixture();
  const { app, send } = dashboardClient(f.now);
  const { response, json } = await send(app(f.first), "/api/devices/rename", {}, body ?? null);

  expect(response.status).toBe(400);
  expect(json()).toEqual({ error: "INVALID_INPUT", message: "Enter a device name" });
});

test("this device renames itself; taken and invalid names are refused inline", async () => {
  const f = await syncFixture();
  const { app, send } = dashboardClient(f.now);
  const rename = (name: string) => send(app(f.first), "/api/devices/rename", {}, { name });

  const taken = await rename("second");
  expect(taken.response.status).toBe(400);
  expect(taken.json().message).toBe("Another device has that name");

  const invalid = await rename("bad​name");
  expect(invalid.response.status).toBe(400);
  expect(invalid.json().message).toBe("Device names are 1-64 bytes with no invisible characters");

  expect((await rename("first")).json()).toEqual({ kind: "unchanged" });
  expect((await rename("laptop")).json()).toEqual({ kind: "renamed" });

  const status = (await send(app(f.first), "/api/status")).json();
  expect(status.overview.deviceName).toBe("laptop");

  const devices = (await send(app(f.first), "/api/devices")).json();

  expect(devices.map((device: { name: string }) => device.name).sort()).toEqual([
    "laptop",
    "second",
    "third",
  ]);

  expect(devices.find((device: { current: boolean }) => device.current).name).toBe("laptop");
});
