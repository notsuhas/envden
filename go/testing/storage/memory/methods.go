package memory

import "github.com/notsuhas/envden/go/core/adapters"

func (m *memory) VaultIDs() (result [][]byte, err error) {
	defer recoverError(&err)
	return m.vaultIDs(), nil
}

func (m *memory) CapUnlocks(vaultID []byte, until int64) (err error) {
	defer recoverError(&err)
	m.capUnlocks(vaultID, until)
	return nil
}

func (m *memory) HasVault(vaultID []byte) (result bool, err error) {
	defer recoverError(&err)
	return m.hasVault(vaultID), nil
}

func (m *memory) Vault(vaultID []byte) (result *adapters.StoredVault, err error) {
	defer recoverError(&err)
	return m.vault(vaultID), nil
}

func (m *memory) ConfigureVault(vaultID []byte, state adapters.StoredVault, writes []adapters.StateWrite, setupTokenHash []byte) (err error) {
	defer recoverError(&err)
	m.configureVault(vaultID, state, writes, setupTokenHash)
	return nil
}

func (m *memory) DiscardInactiveVault(vaultID []byte) (err error) {
	defer recoverError(&err)
	m.discardInactiveVault(vaultID)
	return nil
}

func (m *memory) FindCommitted(vaultID, digest []byte) (result bool, err error) {
	defer recoverError(&err)
	return m.findCommitted(vaultID, digest), nil
}

func (m *memory) HasBlob(vaultID, hash []byte) (result bool, err error) {
	defer recoverError(&err)
	return m.hasBlob(vaultID, hash), nil
}

func (m *memory) Head(vaultID []byte) (result []byte, err error) {
	defer recoverError(&err)
	return m.head(vaultID), nil
}

func (m *memory) CommitSwap(vaultID, expectedHead []byte, swap adapters.StoredSwap, now int64) (result adapters.CommitResult, err error) {
	defer recoverError(&err)
	return m.commitSwap(vaultID, expectedHead, swap, now), nil
}

func (m *memory) Headers(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) (result []adapters.StoredHeader, err error) {
	defer recoverError(&err)
	return m.headers(vaultID, fromSeq, toSeq, limit, maxBytes), nil
}

func (m *memory) Header(vaultID, hash []byte) (result *adapters.StoredHeader, err error) {
	defer recoverError(&err)
	return m.header(vaultID, hash), nil
}

func (m *memory) Entries(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) (result []adapters.StoredHeader, err error) {
	defer recoverError(&err)
	return m.entries(vaultID, fromSeq, toSeq, limit, maxBytes), nil
}

func (m *memory) FileList(vaultID, hash []byte) (result []byte, err error) {
	defer recoverError(&err)
	return m.fileList(vaultID, hash), nil
}

func (m *memory) State(vaultID []byte, kind adapters.StateKind, key []byte) (result []byte, err error) {
	defer recoverError(&err)
	return m.state(vaultID, kind, key), nil
}

func (m *memory) States(vaultID []byte, kind adapters.StateKind) (result []adapters.StateEntry, err error) {
	defer recoverError(&err)
	return m.states(vaultID, kind), nil
}

func (m *memory) WriteState(vaultID []byte, writes []adapters.StateWrite) (err error) {
	defer recoverError(&err)
	m.writeState(vaultID, writes)
	return nil
}

func (m *memory) Device(vaultID, device []byte) (result *adapters.StoredDevice, err error) {
	defer recoverError(&err)
	return m.device(vaultID, device), nil
}

func (m *memory) PutDevice(vaultID, device []byte, state adapters.StoredDevice) (err error) {
	defer recoverError(&err)
	m.putDevice(vaultID, device, state)
	return nil
}

func (m *memory) PutBlob(vaultID, hash, bytes []byte, verify func([]byte) ([]byte, error), now int64, quotaBytes int64) (err error) {
	defer recoverError(&err)
	m.putBlob(vaultID, hash, bytes, verify, now, quotaBytes)
	return nil
}

func (m *memory) GetBlob(vaultID, hash []byte) (result []byte, err error) {
	defer recoverError(&err)
	return m.getBlob(vaultID, hash), nil
}

func (m *memory) BlobHashes(vaultID []byte) (result [][]byte, err error) {
	defer recoverError(&err)
	return m.blobHashes(vaultID), nil
}

func (m *memory) VaultUsage(vaultID []byte) (result int64, err error) {
	defer recoverError(&err)
	return m.vaultUsage(vaultID), nil
}

func (m *memory) Prune(vaultID []byte, policy adapters.HistoryPolicy, now int64) (result adapters.PruneResult, err error) {
	defer recoverError(&err)
	return m.prune(vaultID, policy, now), nil
}

func (m *memory) SetupToken() (result []byte, err error) {
	defer recoverError(&err)
	return m.setupToken(), nil
}

func (m *memory) SetSetupToken(hash []byte) (err error) {
	defer recoverError(&err)
	m.setSetupToken(hash)
	return nil
}

func (m *memory) PutSession(vaultID []byte, key adapters.SessionKey, bytes []byte, now int64) (err error) {
	defer recoverError(&err)
	m.putSession(vaultID, key, bytes, now)
	return nil
}

func (m *memory) Session(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	defer recoverError(&err)
	return m.session(vaultID, key, now), nil
}

func (m *memory) ConsumeSession(vaultID []byte, key adapters.SessionKey, now int64) (result []byte, err error) {
	defer recoverError(&err)
	return m.consumeSession(vaultID, key, now), nil
}

func (m *memory) Charge(vaultID []byte, bucket adapters.RateBucket, now int64) (result adapters.RateCharge, err error) {
	defer recoverError(&err)
	return m.charge(vaultID, bucket, now), nil
}

func (m *memory) Refund(receipt string, now int64) (result bool, err error) {
	defer recoverError(&err)
	return m.refund(receipt, now), nil
}

func (m *memory) OpenMailbox(vaultID, device []byte, now int64) (result *adapters.StoredMailbox, err error) {
	defer recoverError(&err)
	return m.openMailbox(vaultID, device, now), nil
}

func (m *memory) Mailbox(vaultID []byte, number int, now int64) (result *adapters.StoredMailbox, err error) {
	defer recoverError(&err)
	return m.mailbox(vaultID, number, now), nil
}

func (m *memory) WriteMailbox(vaultID []byte, number int, slot adapters.MailboxSlot, bytes []byte, now int64) (result adapters.MailboxWrite, err error) {
	defer recoverError(&err)
	return m.writeMailbox(vaultID, number, slot, bytes, now), nil
}

func (m *memory) CloseMailbox(vaultID []byte, number int) (err error) {
	defer recoverError(&err)
	m.closeMailbox(vaultID, number)
	return nil
}

func (m *memory) Approver(vaultID, device []byte, now int64) (result []byte, err error) {
	defer recoverError(&err)
	return m.approver(vaultID, device, now), nil
}

func (m *memory) RememberNonce(device, nonce []byte, now int64) (result bool, err error) {
	defer recoverError(&err)
	return m.rememberNonce(device, nonce, now), nil
}

func (m *memory) HeadersForFiles(v, h []byte) ([]adapters.StoredHeader, error) {
	panic("Unexpected fake operation: storage.headersForFiles")
}

func (m *memory) PutFileList(v []byte, f adapters.StoredFiles, now int64) error {
	panic("Unexpected fake operation: storage.putFileList")
}
