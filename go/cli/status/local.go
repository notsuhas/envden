package status

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/updates"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/adapters"
)

type Link struct {
	Root      string `json:"root"`
	Path      string `json:"path"`
	Mode      string `json:"mode"`
	LocalOnly bool   `json:"localOnly"`
	Status    string `json:"status"`
	Conflict  bool   `json:"conflict"`
}

type Local struct {
	Configured   bool           `json:"configured"`
	VaultID      string         `json:"vaultId,omitempty"`
	Server       string         `json:"server"`
	ServerReason string         `json:"serverReason,omitempty"`
	Links        []Link         `json:"links"`
	Update       updates.Status `json:"update"`
}

func LocalStatus(ctx context.Context, a contracts.Adapters, sources Sources) (Local, error) {
	s, e := store.LoadState(a.Home)
	r := Local{Server: "unknown", Links: []Link{}, Update: updates.UpdateStatus(a.Home)}
	if e != nil {
		return r, e
	}

	if s == nil || s.Server == nil || s.VaultID == "" {
		return r, nil
	}

	conflicts := []File{}
	if sources.Conflicts != nil {
		conflicts, e = sources.Conflicts(a.Home)
		if e != nil {
			return r, e
		}
	}

	for _, l := range s.Links {
		placement, e := a.Placement(adapters.PlacementMode(l.Mode), l.Root).Inspect(l.Store, filepath.Join(l.Root, l.Path))
		if e != nil {
			return r, e
		}

		conflict := false
		for _, c := range conflicts {
			if c.Root == l.Root && c.Path == l.Path {
				conflict = true
			}
		}

		r.Links = append(r.Links, Link{l.Root, l.Path, l.Mode, l.LocalOnly, string(placement), conflict})
	}

	r.Configured = true
	r.VaultID = s.VaultID
	r.Server = "reachable"
	pin, e := client.Binary(s.Server.Pin)
	if e == nil {
		_, e = client.Hello(ctx, s.Server.Address, pin, a.Fetcher, version.MinServer)
	}

	if e != nil {
		r.Server, r.ServerReason = ServerReachability(e)
	}

	return r, nil
}
