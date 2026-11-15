import * as p from "@envden/core/protocol";
import type { TSyncContext } from "./context.ts";
import { text } from "../../client/encoding.ts";
import { saveState } from "../../state/store/repository.ts";
import { adoptCommittedName } from "../../identity/rename.ts";

export async function persistCheckpoint(context: TSyncContext): Promise<void> {
  context.state.checkpoint = text(
    p.objectHash(p.ManifestHeaderCodec, context.checkpoint.header, "manifest"),
  );

  context.state.verifiedState = context.checkpoint.state;

  const own = context.checkpoint.state.devices.get(p.base32(context.identity.record.id));

  if (own && own.name !== context.state.deviceName) {
    await adoptCommittedName(context.adapters.keychain, context.adapters.home, own);
    context.state.deviceName = own.name;
  }

  context.state.files = text(p.FilesCodec.write(context.checkpoint.files));

  context.state.headers = context.headers.map((item) =>
    text(p.signedCodec(p.ManifestHeaderCodec).write(item)),
  );

  context.state.entries = context.entries.map((item) =>
    text(p.signedCodec(p.EntryCodec).write(item)),
  );

  await saveState(context.adapters.home, context.state, context.options.now);
}
