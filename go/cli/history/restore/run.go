package restore

import (
	"bytes"
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	hf "github.com/notsuhas/envden/go/cli/history/files"
	hl "github.com/notsuhas/envden/go/cli/history/list"
	"github.com/notsuhas/envden/go/cli/history/versions"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	sf "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	f "github.com/notsuhas/envden/go/core/protocol/files"
	"path/filepath"
)

type Options struct {
	Cwd, File        string
	Version          uint64
	Yes, Interactive bool
	Confirm          func(string) (bool, error)
	Now              func() int64
	Fetcher          client.Fetch
}
type Result struct {
	Kind    string `json:"kind"`
	Path    string `json:"path"`
	Version uint64 `json:"version"`
	Changes any    `json:"changes"`
	Backup  string `json:"backup,omitempty"`
}

func RestoreVersion(ctx context.Context, a contracts.Adapters, o Options) (Result, error) {
	var result Result
	config, err := settings.ReadConfig(a.Home)
	if err != nil {
		return result, err
	}
	gate, message := RestoreGate(o.Yes, o.Interactive, config.AgentMerge)
	if gate == "refused" {
		return result, errors.New(errors.InvalidInput, message)
	}
	err = lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		stateValue, e := store.LoadState(a.Home)
		if e != nil {
			return e
		}
		s, e := state.RequireConfigured(stateValue)
		if e != nil {
			return e
		}
		repos, e := hf.SelectedRepos(ctx, a, s, hf.Selection{Cwd: o.Cwd, File: &o.File})
		if e != nil {
			return e
		}
		targets, e := hf.HistoryTargets(s, repos, hf.Selection{Cwd: o.Cwd, File: &o.File})
		if e != nil {
			return e
		}
		target := targets[0]
		var current []byte
		detached := false
		if target.Link != nil {
			current, detached, e = hf.CheckoutBytes(a, target)
			if e != nil {
				return e
			}
		}
		records, e := local.ConflictRecords(a.Home)
		if e != nil {
			return e
		}
		conflicted := false
		for _, r := range records {
			if target.Link != nil && r.Store == target.Link.Store {
				conflicted = true
			}
		}
		if e = RestoreRefusal(target.Link != nil, target.Link != nil && target.Link.LocalOnly, detached, conflicted); e != nil {
			return e
		}
		source, e := versions.HistorySource(ctx, a, o.Now, o.Fetcher)
		if e != nil {
			return e
		}
		id, e := f.FileID(source.IDKey, target.RepoID, target.Path)
		if e != nil {
			return e
		}
		walks, e := versions.RetainedVersions(ctx, source, [][]byte{id})
		if e != nil {
			return e
		}
		var chosen *versions.RetainedVersion
		for _, v := range walks[b.Base32(id)].Versions {
			if v.Version == o.Version {
				copy := v
				chosen = &copy
				break
			}
		}
		if chosen == nil {
			return errors.New(errors.NotFound, "Version is not retained on the server")
		}
		if chosen.Content == nil {
			return errors.New(errors.InvalidInput, "That version deleted the file; choose one with content")
		}
		path := filepath.Join(target.Root, target.Path)
		changes := hl.VersionChanges([][]byte{chosen.Content, current}, true)[0]
		result = Result{Kind: "unchanged", Path: path, Version: o.Version, Changes: changes}
		if bytes.Equal(current, chosen.Content) && (current == nil) == (chosen.Content == nil) {
			return nil
		}
		if gate == "confirm" {
			yes, e := o.Confirm(fmt.Sprintf("Restore %s to version %d? %s", path, o.Version, hl.ChangesText(changes)))
			if e != nil {
				return e
			}
			if !yes {
				result.Kind = "cancelled"
				return nil
			}
		}
		destination := path
		if target.Link.Mode == "link" {
			destination = target.Link.Store
		}
		saved, e := local.Backup(a.Home, destination, o.Now())
		if e != nil {
			return e
		}
		if e = sf.WriteBytes(destination, chosen.Content, o.Now); e != nil {
			return e
		}
		result.Kind = "restored"
		result.Backup = saved
		return nil
	})
	return result, err
}
