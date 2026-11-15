package list

import (
	"context"
	"time"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	historyfiles "github.com/notsuhas/envden/go/cli/history/files"
	"github.com/notsuhas/envden/go/cli/history/versions"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

type Options struct {
	Selection historyfiles.Selection
	Now       func() int64
	Fetcher   client.Fetch
}

type Checkout struct {
	Root    string  `json:"root"`
	Version *uint64 `json:"version,omitempty"`
}

type Version struct {
	Version       uint64 `json:"version"`
	Kind          string `json:"kind"`
	Time          string `json:"time,omitempty"`
	Device        string `json:"device,omitempty"`
	RemovedDevice bool   `json:"removedDevice,omitempty"`
	Changes       any    `json:"changes"`
}

type File struct {
	RepoID    string     `json:"repoId"`
	Path      string     `json:"path"`
	Pruned    bool       `json:"pruned"`
	Checkouts []Checkout `json:"checkouts"`
	Versions  []Version  `json:"versions"`
}

type Result struct {
	Files []File `json:"files"`
}

func FileHistory(ctx context.Context, a contracts.Adapters, o Options) (Result, error) {
	result := Result{Files: []File{}}
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		local, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}

		local, err = state.RequireConfigured(local)
		if err != nil {
			return err
		}

		repos, err := historyfiles.SelectedRepos(ctx, a, local, o.Selection)
		if err != nil {
			return err
		}

		targets, err := historyfiles.HistoryTargets(local, repos, o.Selection)
		if err != nil {
			return err
		}

		groups := [][]historyfiles.Target{}
		indexes := map[string]int{}
		for _, t := range targets {
			k := t.RepoID + "\x00" + t.Path
			i, ok := indexes[k]
			if !ok {
				i = len(groups)
				indexes[k] = i
				groups = append(groups, nil)
			}

			groups[i] = append(groups[i], t)
		}

		source, err := versions.HistorySource(ctx, a, o.Now, o.Fetcher)
		if err != nil {
			return err
		}

		ids := [][]byte{}
		for _, g := range groups {
			id, e := protocolfiles.FileID(source.IDKey, g[0].RepoID, g[0].Path)
			if e != nil {
				return e
			}

			ids = append(ids, id)
		}

		walks, err := versions.RetainedVersions(ctx, source, ids)
		if err != nil {
			return err
		}

		for i, g := range groups {
			walk := walks[encoding.Base32(ids[i])]
			file := File{RepoID: g[0].RepoID, Path: g[0].Path, Pruned: walk.Pruned, Checkouts: []Checkout{}, Versions: []Version{}}
			content := [][]byte{}
			for _, v := range walk.Versions {
				content = append(content, v.Content)
			}

			changes := VersionChanges(content, !walk.Pruned)
			for _, t := range g {
				data, _, e := historyfiles.CheckoutBytes(a, t)
				if e != nil {
					return e
				}

				file.Checkouts = append(file.Checkouts, Checkout{t.Root, versions.MatchingVersion(walk.Versions, data)})
			}

			for j, v := range walk.Versions {
				version := Version{Version: v.Version, Kind: VersionKind(v.State), Changes: changes[j]}
				if v.Header != nil {
					version.Time = time.UnixMilli(int64(v.Header.Body.CreatedAt)).UTC().Format("2006-01-02T15:04:05.000Z") //nolint:gosec // The signed timestamp conversion preserves existing date formatting for all wire values.
					if d, ok := source.History.State.Devices[encoding.Base32(v.Header.Body.Signer)]; ok {
						version.Device = d.Name
					} else {
						version.RemovedDevice = true
					}
				}

				file.Versions = append(file.Versions, version)
			}

			result.Files = append(result.Files, file)
		}

		return nil
	})

	return result, err
}
