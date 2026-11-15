package conflicts

import (
	"github.com/notsuhas/envden/go/cli/state/model"
)

type Record struct {
	JSONOrder    []string     `json:"-"`
	Alternatives []string     `json:"alternatives"`
	Remote       string       `json:"remote"`
	Root         string       `json:"root"`
	Path         string       `json:"path"`
	Store        string       `json:"store"`
	Mode         string       `json:"mode"`
	Base         string       `json:"base"`
	Entry        *string      `json:"entry"`
	Targets      []model.Link `json:"targets"`
	File         string       `json:"file"`
	Server       string       `json:"server"`
	Mine         string       `json:"mine"`
	MineDeleted  bool         `json:"mineDeleted"`
	Deleted      bool         `json:"deleted"`
}

type Backup struct {
	Source string `json:"source"`
	Path   string `json:"path"`
}

type Resolved struct {
	Kind             string   `json:"kind"`
	Path             string   `json:"path"`
	Preserved        []string `json:"preserved"`
	PlacementReports []string `json:"placementReports"`
	Backups          string   `json:"backups"`
	SavedBackups     []Backup `json:"savedBackups"`
}
