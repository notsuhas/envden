import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { adminContext } from "../../admin/shared/context.ts";
import { createClient } from "../../client/request.ts";
import { text } from "../../client/encoding.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { approveJoin, joinRequests } from "../approver.ts";

test("a reveal that doesn't open the listed commit is refused before any words are shown", async () => {
  const f = await fixture();

  try {
    const member = await adminContext(f.first, f.now);
    const pin = Buffer.from(f.result.state.server!.pin, "base64url");
    const impostor = f.home("impostor");
    const identity = await deviceIdentity(impostor.keychain, impostor.home, "laptop", true);

    const client = createClient({
      address: f.result.address,
      pin,
      vaultId: new Uint8Array(32),
      identity,
      version: "0.0.0",
      now: f.now,
      fetcher: f.fetcher,
    });

    const committed = p.randomBytes(32);
    let revealed = false;
    const commit = p.joinCommit(pin, identity.record, committed);
    await client.request("/v1/join-requests", "POST", { commit: text(commit) });
    const [request] = await joinRequests(member.client);
    const asked: string[] = [];

    const approving = approveJoin(
      {
        adapters: f.first,
        client: member.client,
        identity: member.identity,
        pin,
        vaultId: member.vaultId,
        now: f.now,
      },
      request!,
      {
        confirm: async (question) => {
          asked.push(question);

          return true;
        },
        report: () => {},
        pause: async () => {
          if (revealed) return;
          revealed = true;

          const reveal = p.encode(p.JoinRevealCodec, {
            device: identity.record,
            nonce: p.randomBytes(32),
          });

          await client
            .request(`/v1/join-requests/${request!.number}/reveal`, "PUT", {
              message: text(reveal),
            })
            .catch(() => {});
        },
      },
    );

    await Promise.resolve(expect(approving).rejects.toMatchObject({ code: "INVALID_DATA" }));
    expect(asked).toEqual([]);
    expect(await joinRequests(member.client)).toEqual([]);
  } finally {
    await f.close();
  }
});
