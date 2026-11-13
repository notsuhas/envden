import { describe, expect, test } from "bun:test";
import { deriveTripView } from "../view.ts";

describe("deriveTripView", () => {
  test("written shows only the laptop file", () => {
    expect(deriveTripView("written")).toEqual({
      sealing: false,
      pushPacket: "waiting",
      serverFilled: false,
      pullPacket: "waiting",
      desktopHolds: "nothing",
      identical: false,
    });
  });

  test("sealed readies the push packet before anything reaches the server", () => {
    const view = deriveTripView("sealed");

    expect(view.sealing).toBe(true);
    expect(view.pushPacket).toBe("ready");
    expect(view.serverFilled).toBe(false);
  });

  test("stored fills the server and readies the pull", () => {
    const view = deriveTripView("stored");

    expect(view.sealing).toBe(false);
    expect(view.pushPacket).toBe("sent");
    expect(view.serverFilled).toBe(true);
    expect(view.pullPacket).toBe("ready");
    expect(view.desktopHolds).toBe("nothing");
  });

  test("pulled leaves ciphertext on the desktop until it is opened", () => {
    const view = deriveTripView("pulled");

    expect(view.pullPacket).toBe("sent");
    expect(view.desktopHolds).toBe("ciphertext");
    expect(view.identical).toBe(false);
  });

  test("opened shows the file and marks both copies identical", () => {
    const view = deriveTripView("opened");

    expect(view.desktopHolds).toBe("file");
    expect(view.identical).toBe(true);
    expect(view.serverFilled).toBe(true);
  });
});
