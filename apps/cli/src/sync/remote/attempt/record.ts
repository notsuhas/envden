import { readAttempts } from "./state.ts";
import { rm } from "node:fs/promises";
import {
  deletionRequested,
  requestDeletion,
} from "../../local/reconciliation/operation/deletion.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../context.ts";
import { atomicWrite } from "../../../state/store/files.ts";
import { binary, text } from "../../../client/encoding.ts";
import { appliedFiles, saveAppliedFiles } from "../../local/applied.ts";
import { saveBase } from "../../local/reconciliation/history.ts";
import { basePath } from "../../local/files.ts";
import { entryContent, entryName } from "../content.ts";
import { storePath } from "../../../store/path.ts";

export async function saveAttempt(
  context: TSyncContext,
  entries: p.IFileEntry[],
  header: TSyncContext["checkpoint"]["header"],
  places: string[],
) {
  const hash = text(p.objectHash(p.ManifestHeaderCodec, header, "manifest"));

  const document = JSON.stringify({
    header: hash,
    sequence: String(header.body.seq),
    places,
    entries: entries.map((entry) => text(p.FileEntryCodec.write(entry))),
  });

  const receipt = text(p.sha256(new TextEncoder().encode(document)));
  await atomicWrite(join(context.adapters.home, "state", "attempts", receipt), document);
}

export async function acknowledgeAttempt(context: TSyncContext) {
  const attempts = await readAttempts(
    context.adapters,
    context.state.links,
    context.options.now,
    context.options.report,
  );

  for (const attempted of attempts) {
    const accepted = context.headers.some(
      (header) =>
        text(p.objectHash(p.ManifestHeaderCodec, header, "manifest")) === attempted.header,
    );

    if (accepted) await applyAttempt(context, attempted);

    if (accepted || context.checkpoint.header.body.seq >= BigInt(attempted.sequence)) {
      await rm(attempted.path, { force: true });
    }
  }
}

async function applyAttempt(
  context: TSyncContext,
  attempted: { entries: string[]; places: string[] },
) {
  const applied = await appliedFiles(context.adapters.home);

  for (const value of attempted.entries) {
    const entry = p.decode(p.FileEntryCodec, binary(value));
    const id = p.base32(entry.fileId);
    const encoded = text(p.FileEntryCodec.write(entry));
    const name = entryName(context, entry);
    const store = storePath(context.adapters.home, name.repoId, name.path);
    const content = await entryContent(context, entry);

    for (const place of attempted.places) {
      if (
        place === basePath(context.adapters.home, store) ||
        context.state.links.some(
          (link) =>
            link.store === store &&
            link.mode === "copy" &&
            place === basePath(context.adapters.home, store, link.root),
        )
      )
        await saveBase(place, content);
    }

    await atomicWrite(basePath(context.adapters.home, store) + ".entry", encoded);
    applied[id] = encoded;

    if (await deletionRequested(context.adapters.home, store))
      await requestDeletion(context.adapters.home, store, content !== undefined, encoded);
  }

  await saveAppliedFiles(context.adapters.home, applied);
}
