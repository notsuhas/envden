import type { IStorageAdapter } from "@envden/core/adapters";
import { unexpected } from "../fakes/operation.ts";

export function createFakeStorageAdapter(
  operations: { [K in keyof IStorageAdapter]?: IStorageAdapter[K] | undefined } = {},
): IStorageAdapter {
  return {
    id: operations.id ?? "fake-storage",
    close: operation(operations, "close", operations.close),
    transaction: operation(operations, "transaction", operations.transaction),
    vaultIds: operation(operations, "vaultIds", operations.vaultIds),
    capUnlocks: operation(operations, "capUnlocks", operations.capUnlocks),
    findCommitted: operation(operations, "findCommitted", operations.findCommitted),
    hasBlob: operation(operations, "hasBlob", operations.hasBlob),
    hasVault: operation(operations, "hasVault", operations.hasVault),
    vault: operation(operations, "vault", operations.vault),
    configureVault: operation(operations, "configureVault", operations.configureVault),
    discardInactiveVault: operation(
      operations,
      "discardInactiveVault",
      operations.discardInactiveVault,
    ),
    head: operation(operations, "head", operations.head),
    commitSwap: operation(operations, "commitSwap", operations.commitSwap),
    headers: operation(operations, "headers", operations.headers),
    header: operation(operations, "header", operations.header),
    entries: operation(operations, "entries", operations.entries),
    fileList: operation(operations, "fileList", operations.fileList),
    state: operation(operations, "state", operations.state),
    states: operation(operations, "states", operations.states),
    writeState: operation(operations, "writeState", operations.writeState),
    device: operation(operations, "device", operations.device),
    putDevice: operation(operations, "putDevice", operations.putDevice),
    putBlob: operation(operations, "putBlob", operations.putBlob),
    getBlob: operation(operations, "getBlob", operations.getBlob),
    blobHashes: operation(operations, "blobHashes", operations.blobHashes),
    vaultUsage: operation(operations, "vaultUsage", operations.vaultUsage),
    prune: operation(operations, "prune", operations.prune),
    setupToken: operation(operations, "setupToken", operations.setupToken),
    setSetupToken: operation(operations, "setSetupToken", operations.setSetupToken),
    putSession: operation(operations, "putSession", operations.putSession),
    session: operation(operations, "session", operations.session),
    consumeSession: operation(operations, "consumeSession", operations.consumeSession),
    charge: operation(operations, "charge", operations.charge),
    refund: operation(operations, "refund", operations.refund),
    openMailbox: operation(operations, "openMailbox", operations.openMailbox),
    mailbox: operation(operations, "mailbox", operations.mailbox),
    writeMailbox: operation(operations, "writeMailbox", operations.writeMailbox),
    closeMailbox: operation(operations, "closeMailbox", operations.closeMailbox),
    approver: operation(operations, "approver", operations.approver),
    rememberNonce: operation(operations, "rememberNonce", operations.rememberNonce),
  };
}

function operation<T extends (...args: never[]) => unknown>(
  operations: object,
  key: string,
  supplied: T | undefined,
): T {
  return (supplied?.bind(operations) ?? unexpected(`storage.${key}`)) as T;
}
