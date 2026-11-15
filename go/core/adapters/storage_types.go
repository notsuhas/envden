package adapters

// Optional TS fields are pointers or nil slices; times are Unix milliseconds.

type StoredRestored struct {
	RepairTokenHash []byte
	RestoredHead    []byte
	FinishProgress  []byte // nil when absent
}

type StoredVault struct {
	Active       bool
	Frozen       bool
	ServerMoved  []byte // nil when absent
	SKRefused    bool
	UnlockPeriod *int64 // nil means "never"
	Restored     *StoredRestored
}

type StoredObject struct {
	Hash  []byte
	Bytes []byte
}

type StoredHeader struct {
	StoredObject
	Seq uint64
}

type StoredDevice struct {
	UnlockedUntil int64
	FreshUntil    int64
	ClientVersion string
	MailboxGrant  []byte // nil when absent
}

// StateKind is one of the TStateKind strings.
type StateKind string

const (
	StateKeyring        StateKind = "keyring"
	StateEnvelope       StateKind = "envelope"
	StateSKPub          StateKind = "skPub"
	StateOpaqueRecord   StateKind = "opaqueRecord"
	StateRepairReport   StateKind = "repair-report"
	StateMoveSession    StateKind = "move-session"
	StateSetupIssued    StateKind = "setup-issued"
	StateServerIdentity StateKind = "server-identity"
	StatePairingIndex   StateKind = "pairing-index"
	StateMailboxJoiner  StateKind = "mailbox-joiner"
)

type StateWrite struct {
	Kind  StateKind
	Key   []byte
	Bytes []byte // nil deletes
}

type SessionKind string

const (
	SessionLogin      SessionKind = "login"
	SessionJoinTicket SessionKind = "join-ticket"
)

type SessionKey struct {
	Kind    SessionKind
	Device  []byte
	Purpose string
}

type FileVersion struct {
	FileID    []byte
	Version   uint64
	BlobHash  []byte // nil when absent
	Tombstone bool
}

type StoredFiles struct {
	StoredObject
	Versions      []FileVersion
	RetainForever bool
}

type StoredDeviceState struct {
	ID    []byte
	State StoredDevice
}

type StoredApprover struct {
	Device []byte
	Bytes  []byte
}

type StoredSwap struct {
	Header             StoredHeader
	Entries            []StoredHeader
	FilesHash          []byte
	Files              *StoredFiles
	BodyDigest         []byte
	State              []StateWrite
	Vault              *StoredVault
	Devices            []StoredDeviceState
	Approver           *StoredApprover
	ConsumeSessions    []SessionKey
	CloseMailbox       *int
	SetupTokenHash     []byte
	ClearRepairReports bool
}

// CommitKind is committed | retry-of-committed | head-moved.
type CommitKind string

const (
	Committed        CommitKind = "committed"
	RetryOfCommitted CommitKind = "retry-of-committed"
	HeadMovedResult  CommitKind = "head-moved"
)

type CommitResult struct {
	Kind CommitKind
	Head []byte // head-moved only, may be nil
}

type HistoryPolicy struct {
	MaxAge      int64
	MinVersions int
}

type MailboxSlot string

const (
	SlotKE1        MailboxSlot = "KE1"
	SlotKE2        MailboxSlot = "KE2"
	SlotKE3        MailboxSlot = "KE3"
	SlotPairJoiner MailboxSlot = "PairJoiner"
)

type StoredMailbox struct {
	Number    int
	Device    []byte
	ExpiresAt int64
	Slots     map[MailboxSlot][]byte
}

// MailboxWrite is written | identical | closed | out-of-order.
type MailboxWrite string

// RateBucket kind is member | non-member | mailbox; Device is nil when absent.
type RateBucket struct {
	Kind   string
	Device []byte
}

// RateCharge kind is charged (Receipt) or locked (Until).
type RateCharge struct {
	Kind    string
	Receipt string
	Until   int64
}

type StateEntry struct {
	Key   []byte
	Bytes []byte
}

type PruneResult struct {
	Lists int
	Blobs int
}
