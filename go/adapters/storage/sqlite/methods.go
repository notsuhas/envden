package sqlite

import "github.com/notsuhas/envden/go/core/adapters"

func (s *storage) VaultIDs() (result [][]byte, err error) {
	return s.vaultIDs()
}

func (s *storage) CapUnlocks(vaultID []byte, until int64) (err error) {
	return s.capUnlocks(vaultID, until)
}

func (s *storage) HasVault(vaultID []byte) (result bool, err error) {
	return s.hasVault(vaultID)
}

func (s *storage) Vault(vaultID []byte) (result *adapters.StoredVault, err error) {
	return s.vault(vaultID)
}

func (s *storage) ConfigureVault(vaultID []byte, state adapters.StoredVault, writes []adapters.StateWrite, setupTokenHash []byte) (err error) {
	return s.configureVault(vaultID, state, writes, setupTokenHash)
}

func (s *storage) DiscardInactiveVault(vaultID []byte) (err error) {
	return s.discardInactiveVault(vaultID)
}

func (s *storage) FindCommitted(vaultID, digest []byte) (result bool, err error) {
	return s.findCommitted(vaultID, digest)
}

func (s *storage) HasBlob(vaultID, hash []byte) (result bool, err error) {
	return s.hasBlob(vaultID, hash)
}

func (s *storage) Head(vaultID []byte) (result []byte, err error) {
	return s.head(vaultID)
}

func (s *storage) CommitSwap(vaultID, expectedHead []byte, swap adapters.StoredSwap, now int64) (result adapters.CommitResult, err error) {
	return s.commitSwap(vaultID, expectedHead, swap, now)
}

func (s *storage) Headers(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) (result []adapters.StoredHeader, err error) {
	return s.headers(vaultID, fromSeq, toSeq, limit, maxBytes)
}

func (s *storage) HeadersForFiles(vaultID, hash []byte) (result []adapters.StoredHeader, err error) {
	return s.headersForFiles(vaultID, hash)
}

func (s *storage) Header(vaultID, hash []byte) (result *adapters.StoredHeader, err error) {
	return s.header(vaultID, hash)
}

func (s *storage) Entries(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) (result []adapters.StoredHeader, err error) {
	return s.entries(vaultID, fromSeq, toSeq, limit, maxBytes)
}

func (s *storage) PutFileList(vaultID []byte, files adapters.StoredFiles, now int64) (err error) {
	return s.putFileList(vaultID, files, now)
}

func (s *storage) FileList(vaultID, hash []byte) (result []byte, err error) {
	return s.fileList(vaultID, hash)
}

func (s *storage) State(vaultID []byte, kind adapters.StateKind, key []byte) (result []byte, err error) {
	return s.state(vaultID, kind, key)
}

func (s *storage) States(vaultID []byte, kind adapters.StateKind) (result []adapters.StateEntry, err error) {
	return s.states(vaultID, kind)
}

func (s *storage) WriteState(vaultID []byte, writes []adapters.StateWrite) (err error) {
	return s.writeState(vaultID, writes)
}

func (s *storage) Device(vaultID, device []byte) (result *adapters.StoredDevice, err error) {
	return s.device(vaultID, device)
}

func (s *storage) PutDevice(vaultID, device []byte, state adapters.StoredDevice) (err error) {
	return s.putDevice(vaultID, device, state)
}

func (s *storage) PutBlob(vaultID, hash, b []byte, verify func([]byte) ([]byte, error), now, quota int64) (err error) {
	return s.putBlob(vaultID, hash, b, verify, now, quota)
}

func (s *storage) GetBlob(vaultID, hash []byte) (result []byte, err error) {
	return s.getBlob(vaultID, hash)
}

func (s *storage) BlobHashes(vaultID []byte) (result [][]byte, err error) {
	return s.blobHashes(vaultID)
}

func (s *storage) VaultUsage(vaultID []byte) (result int64, err error) {
	return s.vaultUsage(vaultID)
}

func (s *storage) Prune(vaultID []byte, policy adapters.HistoryPolicy, now int64) (result adapters.PruneResult, err error) {
	return s.prune(vaultID, policy, now)
}

func (s *storage) SetupToken() (result []byte, err error) {
	return s.setupToken()
}

func (s *storage) SetSetupToken(hash []byte) (err error) {
	return s.setSetupToken(hash)
}
