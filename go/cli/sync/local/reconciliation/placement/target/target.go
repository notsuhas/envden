package target

import (
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/output"
	state "github.com/notsuhas/envden/go/cli/state/model"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/placement"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func PlaceFileTarget(context *sm.Context, target state.Link, value []byte, preserveDeleted bool, synced []byte) (bool, error) {
	stat, err := os.Lstat(target.Root)
	if err != nil || !stat.IsDir() {
		return false, nil
	}
	destination := filepath.Join(target.Root, target.Path)
	var checkout *adapters.Checkout
	if context.Links.ApprovedCheckout != nil {
		checkout, err = context.Links.ApprovedCheckout(context.Adapters.Repo, context.State, target.Root)
		if err != nil {
			return false, err
		}
	}
	skip := placement.TargetSkip(context.State.Links, target, checkout != nil)
	if skip != "" {
		reason := map[string]string{"unapproved": "checkout needs approval; run envden track", "local-only": "marked local only", "changed": "placement changed; run envden pull"}[skip]
		context.Report(output.SanitizeTerminal("Skipped " + destination + ": " + reason))

		return false, nil
	}
	adapter := context.Adapters.Placement(adapters.PlacementMode(target.Mode), target.Root)
	status, err := adapter.Inspect(target.Store, destination)
	if err != nil {
		return false, err
	}
	identical := status == "linked"
	if !identical {
		old, err := f.ReadBytes(destination)
		if err != nil {
			return false, err
		}
		identical = f.Same(old, value)
	}
	if !identical {
		if err := KeepUnsynced(context, destination, &target, synced); err != nil {
			return false, err
		}
	}
	if value != nil {
		if err := context.Adapters.Repo.EnsureIgnored(*checkout, target.Path); err != nil {
			return false, err
		}
		if target.Mode == "copy" && !identical || target.Mode != "copy" && status != "linked" {
			if err := adapter.Place(target.Store, destination, nil, nil); err != nil {
				return false, err
			}
		}
		exists := false
		for _, item := range context.State.Links {
			if item.Root == target.Root && item.Path == target.Path {
				exists = true
				break
			}
		}
		if !exists {
			context.State.Links = append(context.State.Links, target)
		}
	} else {
		if err := adapter.Remove(&target.Store, destination); err != nil {
			return false, err
		}
		if !preserveDeleted {
			kept := context.State.Links[:0]
			for _, item := range context.State.Links {
				if item.Root != target.Root || item.Path != target.Path {
					kept = append(kept, item)
				}
			}
			context.State.Links = kept
		}
	}

	return true, nil
}
