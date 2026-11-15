package sqlite

import "github.com/notsuhas/envden/go/core/adapters"

func (s *storage) VaultIDs() (result [][]byte, err error) {
	defer recoverError(&err)
	return s.vaultIDs(), nil
}

func (s *storage) CapUnlocks(vaultID []byte, until int64) (err error) {
	defer recoverError(&err)
	s.capUnlocks(vaultID, until)
	return nil
}

func (s *storage) HasVault(vaultID []byte) (result bool, err error) {
	defer recoverError(&err)
	return s.hasVault(vaultID), nil
}

func (s *storage) Vault(vaultID []byte) (result *adapters.StoredVault, err error) {
	defer recoverError(&err)
	return s.vault(vaultID), nil
}

func (s *storage) ConfigureVault(vaultID []byte, state adapters.StoredVault, writes []adapters.StateWrite, setupTokenHash []byte) (err error) {
	defer recoverError(&err)
	s.configureVault(vaultID, state, writes, setupTokenHash)
	return nil
}

func (s *storage) DiscardInactiveVault(vaultID []byte) (err error) {
	defer recoverError(&err)
	s.discardInactiveVault(vaultID)
	return nil
}

func (s *storage) FindCommitted(vaultID, digest []byte) (result bool, err error) {
	defer recoverError(&err)
	return s.findCommitted(vaultID, digest), nil
}

func (s *storage) HasBlob(vaultID, hash []byte) (result bool, err error) {
	defer recoverError(&err)
	return s.hasBlob(vaultID, hash), nil
}

func (s *storage) Head(vaultID []byte) (result []byte, err error) {
	defer recoverError(&err)
	return s.head(vaultID), nil
}

func (s *storage) CommitSwap(vaultID, expectedHead []byte, swap adapters.StoredSwap, now int64) (result adapters.CommitResult, err error) {
	defer recoverError(&err)
	return s.commitSwap(vaultID, expectedHead, swap, now), nil
}

func (s *storage) Headers(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) (result []adapters.StoredHeader, err error) {
	defer recoverError(&err)
	return s.headers(vaultID, fromSeq, toSeq, limit, maxBytes), nil
}

func (s *storage) HeadersForFiles(vaultID, hash []byte) (result []adapters.StoredHeader, err error) {
	defer recoverError(&err)
	return s.headersForFiles(vaultID, hash), nil
}

func (s *storage) Header(vaultID, hash []byte) (result *adapters.StoredHeader, err error) {
	defer recoverError(&err)
	return s.header(vaultID, hash), nil
}

func (s *storage) Entries(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) (result []adapters.StoredHeader, err error) {
	defer recoverError(&err)
	return s.entries(vaultID, fromSeq, toSeq, limit, maxBytes), nil
}

func (s *storage) PutFileList(vaultID []byte, files adapters.StoredFiles, now int64) (err error) {
	defer recoverError(&err)
	s.putFileList(vaultID, files, now)
	return nil
}

func (s *storage) FileList(vaultID, hash []byte) (result []byte, err error) {
	defer recoverError(&err)
	return s.fileList(vaultID, hash), nil
}

func (s *storage) State(vaultID []byte, kind adapters.StateKind, key []byte) (result []byte, err error) {
	defer recoverError(&err)
	return s.state(vaultID, kind, key), nil
}

func (s *storage) States(vaultID []byte, kind adapters.StateKind) (result []adapters.StateEntry, err error) {
	defer recoverError(&err)
	return s.states(vaultID, kind), nil
}

func (s *storage) WriteState(vaultID []byte, writes []adapters.StateWrite) (err error) {
	defer recoverError(&err)
	s.writeState(vaultID, writes)
	return nil
}

func (s *storage) Device(vaultID, device []byte) (result *adapters.StoredDevice, err error) {
	defer recoverError(&err)
	return s.device(vaultID, device), nil
}

func (s *storage) PutDevice(vaultID, device []byte, state adapters.StoredDevice) (err error) {
	defer recoverError(&err)
	s.putDevice(vaultID, device, state)
	return nil
}

func (s *storage) PutBlob(vaultID, hash, b []byte, verify func([]byte) ([]byte, error), now, quota int64) (err error) {
	defer recoverError(&err)
	s.putBlob(vaultID, hash, b, verify, now, quota)
	return nil
}

func (s *storage) GetBlob(vaultID, hash []byte) (result []byte, err error) {
	defer recoverError(&err)
	return s.getBlob(vaultID, hash), nil
}

func (s *storage) BlobHashes(vaultID []byte) (result [][]byte, err error) {
	defer recoverError(&err)
	return s.blobHashes(vaultID), nil
}

func (s *storage) VaultUsage(vaultID []byte) (result int64, err error) {
	defer recoverError(&err)
	return s.vaultUsage(vaultID), nil
}

func (s *storage) Prune(vaultID []byte, policy adapters.HistoryPolicy, now int64) (result adapters.PruneResult, err error) {
	defer recoverError(&err)
	return s.prune(vaultID, policy, now), nil
}

func (s *storage) SetupToken() (result []byte, err error) {
	defer recoverError(&err)
	return s.setupToken(), nil
}

func (s *storage) SetSetupToken(hash []byte) (err error) {
	defer recoverError(&err)
	s.setSetupToken(hash)
	return nil
}
