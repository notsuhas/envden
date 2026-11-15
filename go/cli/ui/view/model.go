package view

type FileView struct {
	Path       string `json:"path"`
	Mode       string `json:"mode"`
	Status     string `json:"status"`
	Held       string `json:"held,omitempty"`
	ConflictID string `json:"conflictId,omitempty"`
	Keys       any    `json:"keys,omitempty"`
}

type CheckoutView struct {
	Root     string     `json:"root"`
	Approval string     `json:"approval"`
	Files    []FileView `json:"files"`
}

type RepoView struct {
	RepoID    string         `json:"repoId"`
	Status    string         `json:"status"`
	Checkouts []CheckoutView `json:"checkouts"`
}

type ConflictView struct {
	ID            string   `json:"id"`
	Path          string   `json:"path"`
	Roots         []string `json:"roots"`
	Keys          any      `json:"keys"`
	ServerDeleted bool     `json:"serverDeleted"`
	MineDeleted   bool     `json:"mineDeleted"`
}
