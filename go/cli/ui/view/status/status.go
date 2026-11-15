package status

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/ui/view"
	"github.com/notsuhas/envden/go/cli/ui/view/unlock"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/merge"
)

type Change struct {
	Root, Path string
	Differs    bool
	Result     merge.Result
}

type Held struct{ Path, Kind string }

type Sources struct {
	Diff         func(context.Context) ([]Change, error)
	HeldBack     func(context.Context) ([]Held, error)
	Remote       func(context.Context) ([]string, error)
	Reachability func(context.Context) (string, error)
	Probe        func(context.Context) unlock.Probe
}

func DashboardStatus(ctx context.Context, a contracts.Adapters, sources Sources) (jsonvalue.Object, error) {
	unconfigured := jsonvalue.Object{{Key: "kind", Value: "not-configured"}}
	before, err := store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}

	if before == nil || before.Server == nil || before.VaultID == "" {
		return unconfigured, nil
	}

	sources = defaultSources(a, sources)
	diffs := []Change{}
	if sources.Diff != nil {
		diffs, err = sources.Diff(ctx)
		if err != nil {
			return nil, err
		}
	}

	state, err := store.LoadState(a.Home)
	if err != nil {
		return nil, err
	}

	if state == nil || state.Server == nil || state.VaultID == "" {
		return unconfigured, nil
	}

	held := []Held{}
	if sources.HeldBack != nil {
		held, err = sources.HeldBack(ctx)
		if err != nil {
			return nil, err
		}
	}

	remote := []string{}
	if sources.Remote != nil {
		remote, err = sources.Remote(ctx)
		if err != nil {
			return nil, err
		}
	}

	conflicts, err := view.ConflictViews(a.Home)
	if err != nil {
		return nil, err
	}

	var probe unlock.Probe
	if sources.Probe != nil {
		probe = sources.Probe(ctx)
	} else {
		probe = unlock.ProbeUnlock(ctx, a)
	}

	checkedAt := a.Now()
	rows := []view.FileRow{}
	statuses := []string{}
	approvals := map[string]string{}
	for _, l := range state.Links {
		if _, ok := approvals[l.Root]; !ok {
			item, err := a.Repo.CheckoutAt(l.Root)
			if err != nil {
				return nil, err
			}

			approval := "unavailable"
			if item != nil {
				approval = links.CheckoutApproval(state, *item)
				if approval == "ask" {
					approval = "needs-approval"
				}
			}

			approvals[l.Root] = approval
		}

		repo := checkout.CheckoutRepo(state, l.Root)
		if repo == "" {
			repo = "unapproved"
		}

		placement, err := a.Placement(adapters.PlacementMode(l.Mode), l.Root).Inspect(l.Store, filepath.Join(l.Root, l.Path))
		if err != nil {
			return nil, err
		}

		file := view.FileView{Path: l.Path, Mode: l.Mode}
		facts := view.FileFacts{LocalOnly: l.LocalOnly, Placement: string(placement)}
		for _, d := range diffs {
			if d.Root == l.Root && d.Path == l.Path && d.Differs {
				facts.Changed = true
				file.Keys = view.KeyChangesView(d.Result)
			}
		}

		for _, h := range held {
			if h.Path == filepath.Join(l.Root, l.Path) {
				facts.HeldBack = true
				file.Held = h.Kind
			}
		}

		for _, c := range conflicts {
			if c.Path == l.Path {
				for _, r := range c.Roots {
					if r == l.Root {
						facts.Conflict = true
						file.ConflictID = c.ID
					}
				}
			}
		}

		for _, r := range remote {
			if r == repo {
				facts.Remote = true
			}
		}

		file.Status = view.FileStatus(facts)
		statuses = append(statuses, file.Status)
		rows = append(rows, view.FileRow{RepoID: repo, Root: l.Root, Approval: approvals[l.Root], File: file})
	}

	reachability := "unknown"
	if sources.Reachability != nil {
		reachability, err = sources.Reachability(ctx)
		if err != nil {
			return nil, err
		}
	}

	var recorded *int64
	if state.Session != nil {
		recorded = state.Session.UnlockedUntil
	}

	id := state.VaultID
	if len(id) > 8 {
		id = id[:8]
	}

	overview := jsonvalue.Object{{Key: "vaultId", Value: id}, {Key: "server", Value: jsonvalue.Object{{Key: "address", Value: state.Server.Address}, {Key: "reachability", Value: reachability}}}, {Key: "deviceName", Value: state.DeviceName}, {Key: "unlock", Value: unlock.DeriveUnlock(recorded, state.Session != nil, probe, checkedAt)}, {Key: "checkedAt", Value: checkedAt}, {Key: "pending", Value: view.PendingCount(statuses)}}

	return jsonvalue.Object{{Key: "kind", Value: "configured"}, {Key: "overview", Value: overview}, {Key: "repos", Value: view.GroupRepos(rows)}, {Key: "conflicts", Value: conflicts}}, nil
}
