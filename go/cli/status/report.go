package status

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/updates"
	"path/filepath"
)

type Keys struct {
	Added   []string `json:"added"`
	Removed []string `json:"removed"`
	Changed []string `json:"changed"`
}
type File struct {
	Root   string `json:"root"`
	Path   string `json:"path"`
	RepoID string `json:"repoId,omitempty"`
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
	Keys   *Keys  `json:"keys,omitempty"`
}
type Report struct {
	Configured    bool           `json:"configured"`
	VaultID       string         `json:"vaultId,omitempty"`
	Server        string         `json:"server,omitempty"`
	ServerReason  string         `json:"serverReason,omitempty"`
	ServerChecked *bool          `json:"serverChecked,omitempty"`
	Files         []File         `json:"files,omitempty"`
	Update        updates.Status `json:"update"`
}
type Change struct {
	Root, Path, Kind string
	Differs          bool
	Keys             Keys
}
type Held struct{ Path, Reason string }
type RemoteFile struct{ RepoID, Path string }
type Sources struct {
	Changes   func(context.Context, contracts.Adapters) ([]Change, error)
	HeldBack  func(contracts.Adapters) ([]Held, error)
	Remote    func(context.Context, contracts.Adapters) ([]RemoteFile, error)
	Conflicts func(string) ([]File, error)
}

func StatusReport(ctx context.Context, a contracts.Adapters, sources Sources) (Report, error) {
	local, e := LocalStatus(ctx, a, sources)
	if e != nil {
		return Report{}, e
	}
	s, e := store.LoadState(a.Home)
	if e != nil {
		return Report{}, e
	}
	if !local.Configured || s == nil {
		return Report{Update: local.Update}, nil
	}
	changes := []Change{}
	held := []Held{}
	if sources.Changes != nil {
		changes, e = sources.Changes(ctx, a)
		if e != nil {
			return Report{}, e
		}
	}
	if sources.HeldBack != nil {
		held, e = sources.HeldBack(a)
		if e != nil {
			return Report{}, e
		}
	}
	remote := []RemoteFile{}
	checked := false
	if local.Server == "reachable" && sources.Remote != nil {
		remote, e = sources.Remote(ctx, a)
		checked = e == nil
	}
	r := Report{Configured: true, VaultID: s.VaultID, Server: local.Server, ServerReason: local.ServerReason, ServerChecked: &checked, Files: []File{}, Update: local.Update}
	for _, link := range local.Links {
		repo := ""
		for _, c := range s.Approved {
			if c.Root == link.Root {
				repo = c.RepoID
				if alias, ok := s.Aliases.Get(repo).(string); ok {
					repo = alias
				}
				break
			}
		}
		facts := FileFacts{LocalOnly: link.LocalOnly, Conflict: link.Conflict, Placement: link.Status}
		var keys *Keys
		for _, c := range changes {
			if c.Root == link.Root && c.Path == link.Path {
				facts.Changed = c.Differs
				if c.Differs && c.Kind == "diff" {
					k := c.Keys
					keys = &k
				}
			}
		}
		reason := ""
		for _, h := range held {
			if h.Path == filepath.Join(link.Root, link.Path) {
				facts.HeldBack = true
				reason = h.Reason
			}
		}
		for _, f := range remote {
			if f.RepoID == repo && f.Path == link.Path {
				facts.Remote = true
			}
		}
		state := DeriveFileState(facts)
		if state != "held-back" {
			reason = ""
		}
		r.Files = append(r.Files, File{link.Root, link.Path, repo, state, reason, keys})
	}
	for _, c := range s.Approved {
		repo := c.RepoID
		if alias, ok := s.Aliases.Get(repo).(string); ok {
			repo = alias
		}
		for _, f := range remote {
			if f.RepoID != repo {
				continue
			}
			found := false
			for _, link := range s.Links {
				if link.Root == c.Root && link.Path == f.Path {
					found = true
					break
				}
			}
			if !found {
				r.Files = append(r.Files, File{Root: c.Root, Path: f.Path, RepoID: repo, State: "remote"})
			}
		}
	}
	return r, nil
}

func (r Report) MarshalJSON() ([]byte, error) {
	if !r.Configured {
		return jsonvalue.Marshal(jsonvalue.Object{{Key: "configured", Value: false}, {Key: "update", Value: r.Update}})
	}
	o := jsonvalue.Object{{Key: "configured", Value: true}, {Key: "vaultId", Value: r.VaultID}, {Key: "server", Value: r.Server}}
	if r.ServerReason != "" {
		o.Set("serverReason", r.ServerReason)
	}
	o.Set("serverChecked", r.ServerChecked != nil && *r.ServerChecked)
	files := r.Files
	if files == nil {
		files = []File{}
	}
	o.Set("files", files)
	o.Set("update", r.Update)
	return jsonvalue.Marshal(o)
}
