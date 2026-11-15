package status

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/notice"
	localstatus "github.com/notsuhas/envden/go/cli/status"
	syncdomain "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local/lineage"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/merge"
)

func defaultSources(a contracts.Adapters, s Sources) Sources {
	if s.Diff == nil {
		s.Diff = func(ctx context.Context) ([]Change, error) {
			values, err := syncdomain.Diff(ctx, a, syncdomain.Options{Now: a.Now, Fetcher: a.Fetcher, All: true})
			if err != nil {
				return nil, err
			}
			result := []Change{}
			for _, v := range values {
				result = append(result, Change{v.Root, v.Path, v.Differs, merge.Result{Kind: v.Kind, Added: v.Added, Removed: v.Removed, Changed: v.Changed, Reason: v.Reason, Key: v.Key}})
			}
			return result, nil
		}
	}
	if s.HeldBack == nil {
		s.HeldBack = func(context.Context) ([]Held, error) {
			values, err := lineage.HeldBackFiles(a, syncmodel.Links{ApprovedCheckout: links.ApprovedCheckout, CheckoutApproval: links.CheckoutApproval})
			if err != nil {
				return nil, err
			}
			result := []Held{}
			for _, v := range values {
				result = append(result, Held{v.Path, v.Kind})
			}
			return result, nil
		}
	}
	if s.Remote == nil {
		s.Remote = func(context.Context) ([]string, error) {
			remote := notice.ReadRemoteNotice(a.Home)
			if remote == nil {
				return []string{}, nil
			}
			return remote.Repos, nil
		}
	}
	if s.Reachability == nil {
		s.Reachability = func(ctx context.Context) (string, error) {
			local, err := localstatus.LocalStatus(ctx, a, localstatus.Sources{})
			return local.Server, err
		}
	}
	return s
}
