package notice

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/files"
	"os"
	"path/filepath"
)

type Remote struct {
	CheckedAt int64    `json:"checkedAt"`
	Repos     []string `json:"repos"`
}

func ReadRemoteNotice(home string) *Remote {
	raw, e := os.ReadFile(filepath.Join(home, "state", "remote-notice.json"))
	if e != nil {
		return nil
	}
	var r struct {
		CheckedAt *int64    `json:"checkedAt"`
		Repos     *[]string `json:"repos"`
	}
	if json.Unmarshal(raw, &r) != nil || r.CheckedAt == nil || r.Repos == nil {
		return nil
	}
	return &Remote{*r.CheckedAt, *r.Repos}
}
func WriteRemoteNotice(home string, r Remote, now func() int64) error {
	raw, e := jsonvalue.Marshal(r)
	if e != nil {
		return e
	}
	return files.AtomicWrite(filepath.Join(home, "state", "remote-notice.json"), raw, now)
}
