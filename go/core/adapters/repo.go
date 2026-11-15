package adapters

// Checkout is which repo a checkout belongs to (DESIGN § Store, checkouts and placement).
type Checkout struct {
	Root               string  `json:"root"`
	RepoID             string  `json:"repoId"`
	UpstreamRepoID     *string `json:"upstreamRepoId,omitempty"`
	GitDir             string  `json:"gitDir"`
	Identity           *string `json:"identity,omitempty"`
	RootDevice         *int64  `json:"rootDevice,omitempty"`
	RegisteredWorktree *bool   `json:"registeredWorktree,omitempty"`
}

// EnvFileRules: nil slices mean "not given", matching optional TS fields.
type EnvFileRules struct {
	Include      []string `json:"include,omitempty"`
	Exclude      []string `json:"exclude,omitempty"`
	ExtraSkipped []string `json:"extraSkipped,omitempty"`
}

type Repo interface {
	ID() string
	CaseInsensitive(root string, readOnly bool) (bool, error)
	// CheckoutAt returns nil, nil when path is not a checkout.
	CheckoutAt(path string) (*Checkout, error)
	Worktrees(checkout Checkout) ([]string, error)
	// Submodules returns checkout-relative paths from .gitmodules.
	Submodules(checkout Checkout) ([]string, error)
	EnvFiles(checkout Checkout, rules *EnvFileRules) ([]string, error)
	IsIgnored(checkout Checkout, relPath string) (bool, error)
	EnsureIgnored(checkout Checkout, relPath string) error
}
