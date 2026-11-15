package adapters

// Storage is where the server keeps ciphertext. Encoded objects are opaque; callers supply verified indexes.
// Methods return errors where the TS adapter throws.
type Storage interface {
	ID() string
	Close() error
	// Transaction runs fn atomically; nested calls join the outer transaction.
	Transaction(fn func() error) error
	VaultIDs() ([][]byte, error)
	CapUnlocks(vaultID []byte, until int64) error
	HasVault(vaultID []byte) (bool, error)
	Vault(vaultID []byte) (*StoredVault, error)
	ConfigureVault(vaultID []byte, state StoredVault, writes []StateWrite, setupTokenHash []byte) error
	DiscardInactiveVault(vaultID []byte) error

	FindCommitted(vaultID, digest []byte) (bool, error)
	HasBlob(vaultID, hash []byte) (bool, error)
	Head(vaultID []byte) ([]byte, error)
	CommitSwap(vaultID, expectedHead []byte, swap StoredSwap, now int64) (CommitResult, error)
	// Headers/Entries: limit and maxBytes of 0 mean unbounded.
	Headers(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) ([]StoredHeader, error)
	HeadersForFiles(vaultID, hash []byte) ([]StoredHeader, error)
	Header(vaultID, hash []byte) (*StoredHeader, error)
	Entries(vaultID []byte, fromSeq, toSeq uint64, limit, maxBytes int) ([]StoredHeader, error)
	PutFileList(vaultID []byte, files StoredFiles, now int64) error
	FileList(vaultID, hash []byte) ([]byte, error)

	State(vaultID []byte, kind StateKind, key []byte) ([]byte, error)
	States(vaultID []byte, kind StateKind) ([]StateEntry, error)
	WriteState(vaultID []byte, writes []StateWrite) error
	Device(vaultID, device []byte) (*StoredDevice, error)
	PutDevice(vaultID, device []byte, state StoredDevice) error

	// PutBlob: verify may be nil; now and quotaBytes of 0 mean absent.
	PutBlob(vaultID, hash, bytes []byte, verify func([]byte) ([]byte, error), now int64, quotaBytes int64) error
	GetBlob(vaultID, hash []byte) ([]byte, error)
	BlobHashes(vaultID []byte) ([][]byte, error)
	VaultUsage(vaultID []byte) (int64, error)
	Prune(vaultID []byte, policy HistoryPolicy, now int64) (PruneResult, error)

	SetupToken() ([]byte, error)
	SetSetupToken(hash []byte) error
	PutSession(vaultID []byte, key SessionKey, bytes []byte, now int64) error
	Session(vaultID []byte, key SessionKey, now int64) ([]byte, error)
	ConsumeSession(vaultID []byte, key SessionKey, now int64) ([]byte, error)
	Charge(vaultID []byte, bucket RateBucket, now int64) (RateCharge, error)
	Refund(receipt string, now int64) (bool, error)

	OpenMailbox(vaultID, device []byte, now int64) (*StoredMailbox, error)
	Mailbox(vaultID []byte, number int, now int64) (*StoredMailbox, error)
	WriteMailbox(vaultID []byte, number int, slot MailboxSlot, bytes []byte, now int64) (MailboxWrite, error)
	CloseMailbox(vaultID []byte, number int) error
	Approver(vaultID, device []byte, now int64) ([]byte, error)

	RememberNonce(device, nonce []byte, now int64) (bool, error)
}
