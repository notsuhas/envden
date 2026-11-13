import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { decodeHistoryEntries, decodeHistoryHeader } from "../history.ts";
import { VERSION } from "../../version.ts";
import { createGenesis } from "../../vault/genesis.ts";

test("CLI authenticates unknown entries and header versions before reporting an update", async () => {
  const keys = p.generateDeviceKeys();
  const identity = { keys, record: { ...keys, id: p.deviceId(keys), name: "test" } };
  const material = await createGenesis(identity, new Uint8Array(32), 0);
  const genesis = p.encode(p.signedCodec(p.EntryCodec), material.genesis);
  const body = p.encode(p.EntryCodec, material.epoch.body);
  body[74] = 99;
  const unknown = p.concat(body, p.Sign(keys.objSk, "entry", body));

  expect(() => decodeHistoryEntries([genesis, unknown], [], "999.0.0")).toThrow(
    expect.objectContaining({ code: "UPDATE_REQUIRED" }),
  );

  unknown[unknown.length - 1] = unknown[unknown.length - 1]! ^ 1;

  expect(() => decodeHistoryEntries([genesis, unknown], [], "999.0.0")).toThrow(
    expect.objectContaining({ code: "INVALID_DATA" }),
  );

  const headerBody = p.concat(Uint8Array.of(2, 2), identity.record.id);
  const header = p.concat(headerBody, p.Sign(keys.objSk, "manifest", headerBody));

  expect(() => decodeHistoryHeader(header, [material.genesis], [], "999.0.0")).toThrow(
    expect.objectContaining({ code: "UPDATE_REQUIRED" }),
  );

  expect(() => decodeHistoryHeader(header, [material.genesis], [], VERSION)).toThrow(
    "Unreadable data from server",
  );
});
