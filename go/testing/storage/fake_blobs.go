package storage

import "github.com/notsuhas/envden/go/core/adapters"

func (f *fake) PutBlob(vaultID, hash, bytes []byte, verify func([]byte) ([]byte, error), now int64, quotaBytes int64) error {
	if f.operations.PutBlob == nil {
		panic("Unexpected fake operation: storage.putBlob")
	}
	return f.operations.PutBlob(vaultID, hash, bytes, verify, now, quotaBytes)
}

func (f *fake) GetBlob(vaultID, hash []byte) ([]byte, error) {
	if f.operations.GetBlob == nil {
		panic("Unexpected fake operation: storage.getBlob")
	}
	return f.operations.GetBlob(vaultID, hash)
}

func (f *fake) BlobHashes(vaultID []byte) ([][]byte, error) {
	if f.operations.BlobHashes == nil {
		panic("Unexpected fake operation: storage.blobHashes")
	}
	return f.operations.BlobHashes(vaultID)
}

func (f *fake) VaultUsage(vaultID []byte) (int64, error) {
	if f.operations.VaultUsage == nil {
		panic("Unexpected fake operation: storage.vaultUsage")
	}
	return f.operations.VaultUsage(vaultID)
}

func (f *fake) Prune(vaultID []byte, policy adapters.HistoryPolicy, now int64) (adapters.PruneResult, error) {
	if f.operations.Prune == nil {
		panic("Unexpected fake operation: storage.prune")
	}
	return f.operations.Prune(vaultID, policy, now)
}

func (f *fake) SetupToken() ([]byte, error) {
	if f.operations.SetupToken == nil {
		panic("Unexpected fake operation: storage.setupToken")
	}
	return f.operations.SetupToken()
}

func (f *fake) SetSetupToken(hash []byte) error {
	if f.operations.SetSetupToken == nil {
		panic("Unexpected fake operation: storage.setSetupToken")
	}
	return f.operations.SetSetupToken(hash)
}
