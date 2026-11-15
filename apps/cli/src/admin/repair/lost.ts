import { EnvdenError } from "@envden/core/errors";
import { submitAdmin } from "../shared/submission.ts";
import { join } from "node:path";
import { atomicWrite } from "../../state/store/files.ts";
import * as p from "@envden/core/protocol";
import { chooseRecoveryCandidate } from "@envden/core/chain";
import type { THistory } from "../../vault/history.ts";
import type { TAdminContext } from "../shared/context.ts";
import { currentMaterial } from "../shared/material.ts";
import { optionalObject } from "../shared/transfer.ts";
import { text } from "../../client/encoding.ts";
import { adminSwap } from "../shared/swap.ts";
import { whenText } from "../../time/format.ts";

export async function fixLost(
  context: TAdminContext,
  history: THistory,
  files: p.IFiles,
  lost: p.IFileEntry[],
  available: ReadonlySet<string>,
  repairId: Uint8Array,
) {
  const { key, ring, keys } = await currentMaterial(context, history);

  const older = await Promise.all(
    history.headers.map(async (header) => {
      const bytes = await optionalObject(
        context.client,
        `/v1/files/${text(header.body.filesHash)}`,
      );

      if (bytes && !p.equal(p.H("files", bytes), header.body.filesHash))
        throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

      return { header: header.body, files: bytes ? p.decode(p.FilesCodec, bytes) : undefined };
    }),
  );

  const losses = new Set(lost.map((e) => text(e.fileId)));
  const entries: p.IFileEntry[] = [];
  const report: string[] = [];

  for (const file of files.entries) {
    if (!losses.has(text(file.fileId))) {
      entries.push(file);
      continue;
    }

    const c = {
      vaultId: context.vaultId,
      epoch: file.epoch,
      fileId: file.fileId,
      version: file.version,
    };

    const name = p.openFileName(file.name, keys.get(file.epoch)!, ring.idKey, c);
    const next = { ...c, epoch: ring.epoch, version: file.version + 1n };

    const candidate = chooseRecoveryCandidate({
      fileId: file.fileId,
      beforeVersion: file.version,
      history: older,
      availableBlobs: available,
    });

    let blobHash: Uint8Array = new Uint8Array(32);
    let state: p.IFileEntry["state"] = 4;

    if (candidate.kind === "recovered") {
      const entry = candidate.entry;
      const box = await optionalObject(context.client, `/v1/blobs/${text(entry.blobHash)}`);

      if (box) {
        const old = { ...c, epoch: entry.epoch, version: entry.version };

        const content = p.openFile(
          box,
          keys.get(entry.epoch)!,
          ring.idKey,
          old,
          entry.blobHash,
          name,
        );

        const blob = p.sealFile(content, key, next);
        blobHash = p.H("blob", blob);
        await context.client.request(`/v1/blobs/${text(blobHash)}`, "PUT", blob);
        state = 3;
      }
    }

    report.push(
      `${name.repoId}/${name.path}: ${state === 3 && candidate.kind === "recovered" ? `recovered from ${whenText(Number(candidate.header.createdAt), context.now())}` : "lost; no verified older copy"}`,
    );

    entries.push({
      ...file,
      epoch: next.epoch,
      version: next.version,
      state,
      blobHash,
      name: p.sealFileName(name, key, next),
    });
  }

  const swap = adminSwap(history, context.identity, 11, context.now(), { files: { entries } });

  await atomicWrite(
    join(context.adapters.home, "state", `repair-report-${text(repairId)}`),
    report.join("\n"),
    context.now,
  );

  await submitAdmin(context, swap);
}
