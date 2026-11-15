package storage

import "github.com/notsuhas/envden/go/core/adapters"

type fake struct{ operations Operations }

func CreateFakeStorageAdapter(operations ...Operations) adapters.Storage {
	var o Operations
	if len(operations) > 0 {
		o = operations[0]
	}

	return &fake{o}
}

func (f *fake) ID() string {
	if f.operations.ID != "" {
		return f.operations.ID
	}

	return "fake-storage"
}

func (f *fake) Close() error {
	if f.operations.Close == nil {
		panic("Unexpected fake operation: storage.close")
	}

	return f.operations.Close()
}

func (f *fake) Transaction(fn func() error) error {
	if f.operations.Transaction == nil {
		panic("Unexpected fake operation: storage.transaction")
	}

	return f.operations.Transaction(fn)
}

func (f *fake) VaultIDs() ([][]byte, error) {
	if f.operations.VaultIDs == nil {
		panic("Unexpected fake operation: storage.vaultIds")
	}

	return f.operations.VaultIDs()
}

func (f *fake) CapUnlocks(vaultID []byte, until int64) error {
	if f.operations.CapUnlocks == nil {
		panic("Unexpected fake operation: storage.capUnlocks")
	}

	return f.operations.CapUnlocks(vaultID, until)
}

func (f *fake) HasVault(vaultID []byte) (bool, error) {
	if f.operations.HasVault == nil {
		panic("Unexpected fake operation: storage.hasVault")
	}

	return f.operations.HasVault(vaultID)
}

func (f *fake) Vault(vaultID []byte) (*adapters.StoredVault, error) {
	if f.operations.Vault == nil {
		panic("Unexpected fake operation: storage.vault")
	}

	return f.operations.Vault(vaultID)
}

func (f *fake) ConfigureVault(vaultID []byte, state adapters.StoredVault, writes []adapters.StateWrite, setupTokenHash []byte) error {
	if f.operations.ConfigureVault == nil {
		panic("Unexpected fake operation: storage.configureVault")
	}

	return f.operations.ConfigureVault(vaultID, state, writes, setupTokenHash)
}

func (f *fake) DiscardInactiveVault(vaultID []byte) error {
	if f.operations.DiscardInactiveVault == nil {
		panic("Unexpected fake operation: storage.discardInactiveVault")
	}

	return f.operations.DiscardInactiveVault(vaultID)
}

func (f *fake) FindCommitted(vaultID, digest []byte) (bool, error) {
	if f.operations.FindCommitted == nil {
		panic("Unexpected fake operation: storage.findCommitted")
	}

	return f.operations.FindCommitted(vaultID, digest)
}

func (f *fake) HasBlob(vaultID, hash []byte) (bool, error) {
	if f.operations.HasBlob == nil {
		panic("Unexpected fake operation: storage.hasBlob")
	}

	return f.operations.HasBlob(vaultID, hash)
}

func (f *fake) Head(vaultID []byte) ([]byte, error) {
	if f.operations.Head == nil {
		panic("Unexpected fake operation: storage.head")
	}

	return f.operations.Head(vaultID)
}

func (f *fake) CommitSwap(vaultID, expectedHead []byte, swap adapters.StoredSwap, now int64) (adapters.CommitResult, error) {
	if f.operations.CommitSwap == nil {
		panic("Unexpected fake operation: storage.commitSwap")
	}

	return f.operations.CommitSwap(vaultID, expectedHead, swap, now)
}

func (f *fake) Headers(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) ([]adapters.StoredHeader, error) {
	if f.operations.Headers == nil {
		panic("Unexpected fake operation: storage.headers")
	}

	return f.operations.Headers(vaultID, fromSeq, toSeq, limit, maxBytes)
}

func (f *fake) HeadersForFiles(vaultID, hash []byte) ([]adapters.StoredHeader, error) {
	if f.operations.HeadersForFiles == nil {
		panic("Unexpected fake operation: storage.headersForFiles")
	}

	return f.operations.HeadersForFiles(vaultID, hash)
}

func (f *fake) Header(vaultID, hash []byte) (*adapters.StoredHeader, error) {
	if f.operations.Header == nil {
		panic("Unexpected fake operation: storage.header")
	}

	return f.operations.Header(vaultID, hash)
}

func (f *fake) Entries(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) ([]adapters.StoredHeader, error) {
	if f.operations.Entries == nil {
		panic("Unexpected fake operation: storage.entries")
	}

	return f.operations.Entries(vaultID, fromSeq, toSeq, limit, maxBytes)
}

func (f *fake) PutFileList(vaultID []byte, files adapters.StoredFiles, now int64) error {
	if f.operations.PutFileList == nil {
		panic("Unexpected fake operation: storage.putFileList")
	}

	return f.operations.PutFileList(vaultID, files, now)
}

func (f *fake) FileList(vaultID, hash []byte) ([]byte, error) {
	if f.operations.FileList == nil {
		panic("Unexpected fake operation: storage.fileList")
	}

	return f.operations.FileList(vaultID, hash)
}

func (f *fake) State(vaultID []byte, kind adapters.StateKind, key []byte) ([]byte, error) {
	if f.operations.State == nil {
		panic("Unexpected fake operation: storage.state")
	}

	return f.operations.State(vaultID, kind, key)
}

func (f *fake) States(vaultID []byte, kind adapters.StateKind) ([]adapters.StateEntry, error) {
	if f.operations.States == nil {
		panic("Unexpected fake operation: storage.states")
	}

	return f.operations.States(vaultID, kind)
}

func (f *fake) WriteState(vaultID []byte, writes []adapters.StateWrite) error {
	if f.operations.WriteState == nil {
		panic("Unexpected fake operation: storage.writeState")
	}

	return f.operations.WriteState(vaultID, writes)
}

func (f *fake) Device(vaultID, device []byte) (*adapters.StoredDevice, error) {
	if f.operations.Device == nil {
		panic("Unexpected fake operation: storage.device")
	}

	return f.operations.Device(vaultID, device)
}

func (f *fake) PutDevice(vaultID, device []byte, state adapters.StoredDevice) error {
	if f.operations.PutDevice == nil {
		panic("Unexpected fake operation: storage.putDevice")
	}

	return f.operations.PutDevice(vaultID, device, state)
}
