package status

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/notice"
	state "github.com/notsuhas/envden/go/cli/state/model"
	synccli "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/local/lineage"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func DefaultSources() Sources {
	return Sources{
		Changes: func(ctx context.Context, a contracts.Adapters) ([]Change, error) {
			changes, e := synccli.Diff(ctx, a, sm.Options{Now: a.Now, Fetcher: a.Fetcher, All: true})
			result := []Change{}
			for _, c := range changes {
				result = append(result, Change{Root: c.Root, Path: c.Path, Kind: c.Kind, Differs: c.Differs, Keys: Keys{Added: c.Added, Removed: c.Removed, Changed: c.Changed}})
			}
			return result, e
		},
		HeldBack: func(a contracts.Adapters) ([]Held, error) {
			held, e := lineage.HeldBackFiles(a, sm.Links{ApprovedCheckout: func(repo adapters.Repo, s *state.State, root string) (*adapters.Checkout, error) {
				return links.ApprovedCheckout(repo, s, root)
			}})
			result := []Held{}
			for _, h := range held {
				result = append(result, Held{Path: h.Path, Reason: h.Reason})
			}
			return result, e
		},
		Remote: func(ctx context.Context, a contracts.Adapters) ([]RemoteFile, error) {
			remote, e := notice.RemoteNotice(ctx, a, sm.Options{Now: a.Now, Fetcher: a.Fetcher, All: true})
			result := []RemoteFile{}
			for _, f := range remote.Files {
				result = append(result, RemoteFile{f.RepoID, f.Path})
			}
			return result, e
		},
		Conflicts: func(home string) ([]File, error) {
			records, e := local.ConflictRecords(home)
			result := []File{}
			for _, r := range records {
				result = append(result, File{Root: r.Root, Path: r.Path})
			}
			return result, e
		},
	}
}
