package storage

import "github.com/notsuhas/envden/go/core/adapters"

type Operations struct {
	ID                   string
	Close                func() error
	Transaction          func(fn func() error) error
	VaultIDs             func() ([][]byte, error)
	CapUnlocks           func(vaultID []byte, until int64) error
	HasVault             func(vaultID []byte) (bool, error)
	Vault                func(vaultID []byte) (*adapters.StoredVault, error)
	ConfigureVault       func(vaultID []byte, state adapters.StoredVault, writes []adapters.StateWrite, setupTokenHash []byte) error
	DiscardInactiveVault func(vaultID []byte) error
	FindCommitted        func(vaultID, digest []byte) (bool, error)
	HasBlob              func(vaultID, hash []byte) (bool, error)
	Head                 func(vaultID []byte) ([]byte, error)
	CommitSwap           func(vaultID, expectedHead []byte, swap adapters.StoredSwap, now int64) (adapters.CommitResult, error)
	Headers              func(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) ([]adapters.StoredHeader, error)
	HeadersForFiles      func(vaultID, hash []byte) ([]adapters.StoredHeader, error)
	Header               func(vaultID, hash []byte) (*adapters.StoredHeader, error)
	Entries              func(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) ([]adapters.StoredHeader, error)
	PutFileList          func(vaultID []byte, files adapters.StoredFiles, now int64) error
	FileList             func(vaultID, hash []byte) ([]byte, error)
	State                func(vaultID []byte, kind adapters.StateKind, key []byte) ([]byte, error)
	States               func(vaultID []byte, kind adapters.StateKind) ([]adapters.StateEntry, error)
	WriteState           func(vaultID []byte, writes []adapters.StateWrite) error
	Device               func(vaultID, device []byte) (*adapters.StoredDevice, error)
	PutDevice            func(vaultID, device []byte, state adapters.StoredDevice) error
	PutBlob              func(vaultID, hash, bytes []byte, verify func([]byte) ([]byte, error), now int64, quotaBytes int64) error
	GetBlob              func(vaultID, hash []byte) ([]byte, error)
	BlobHashes           func(vaultID []byte) ([][]byte, error)
	VaultUsage           func(vaultID []byte) (int64, error)
	Prune                func(vaultID []byte, policy adapters.HistoryPolicy, now int64) (adapters.PruneResult, error)
	SetupToken           func() ([]byte, error)
	SetSetupToken        func(hash []byte) error
	PutSession           func(vaultID []byte, key adapters.SessionKey, bytes []byte, now int64) error
	Session              func(vaultID []byte, key adapters.SessionKey, now int64) ([]byte, error)
	ConsumeSession       func(vaultID []byte, key adapters.SessionKey, now int64) ([]byte, error)
	Charge               func(vaultID []byte, bucket adapters.RateBucket, now int64) (adapters.RateCharge, error)
	Refund               func(receipt string, now int64) (bool, error)
	OpenMailbox          func(vaultID, device []byte, now int64) (*adapters.StoredMailbox, error)
	Mailbox              func(vaultID []byte, number int, now int64) (*adapters.StoredMailbox, error)
	WriteMailbox         func(vaultID []byte, number int, slot adapters.MailboxSlot, bytes []byte, now int64) (adapters.MailboxWrite, error)
	CloseMailbox         func(vaultID []byte, number int) error
	Approver             func(vaultID, device []byte, now int64) ([]byte, error)
	RememberNonce        func(device, nonce []byte, now int64) (bool, error)
}
