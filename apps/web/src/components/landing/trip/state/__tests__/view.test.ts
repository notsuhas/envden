import { describe, expect, test } from "bun:test";
import { deriveTripView } from "../view.ts";

describe("deriveTripView", () => {
  test("idle shows only the laptop file", () => {
    expect(deriveTripView("idle")).toEqual({
      pushActive: false,
      serverFilled: false,
      scrambling: false,
      pullActive: false,
      desktopFilled: false,
      done: false,
    });
  });

  test("pushing fills the server and scrambles", () => {
    const view = deriveTripView("pushing");
    expect(view.pushActive).toBe(true);
    expect(view.serverFilled).toBe(true);
    expect(view.scrambling).toBe(true);
    expect(view.desktopFilled).toBe(false);
  });

  test("stored settles the server before the pull", () => {
    const view = deriveTripView("stored");
    expect(view.serverFilled).toBe(true);
    expect(view.scrambling).toBe(false);
    expect(view.desktopFilled).toBe(false);
  });

  test("pulling fills the desktop", () => {
    const view = deriveTripView("pulling");
    expect(view.pullActive).toBe(true);
    expect(view.desktopFilled).toBe(true);
    expect(view.done).toBe(false);
  });

  test("done keeps everything filled and idle", () => {
    expect(deriveTripView("done")).toEqual({
      pushActive: false,
      serverFilled: true,
      scrambling: false,
      pullActive: false,
      desktopFilled: true,
      done: true,
    });
  });
});
