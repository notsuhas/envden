package reconcile

import (
	"bytes"

	"github.com/notsuhas/envden/go/cli/output"
	state "github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func reconcileUnpublished(context *syncmodel.Context, repos map[string]bool) (int, map[string]bool, error) {
	conflicts := 0
	failed, seen := map[string]bool{}, map[string]bool{}

	for _, link := range context.State.Links {
		eligible, err := isUnpublished(context, repos, link)
		if err != nil {
			return 0, nil, err
		}

		if !eligible || seen[link.Store] {
			continue
		}

		seen[link.Store] = true
		targets := []state.Link{}

		for _, item := range context.State.Links {
			if item.Store == link.Store && !item.LocalOnly && !context.SkippedRoots[item.Root] {
				targets = append(targets, item)
			}
		}

		value, readErr := localfiles.ReadBytes(link.Store)

		if readErr == nil && link.Mode == "link" && value == nil {
			context.Report(output.SanitizeTerminal(link.Path + ": content was lost outside envden"))
			failed[link.Store] = true
			conflicts++
			context.Report(output.SanitizeTerminal("Could not place unpublished env file: " + link.Path))
			continue
		}

		result, err := reconciliation.ReconcileFile(context, targets, link.Store, nil, map[string]bool{}, nil)
		if err != nil {
			if syncmodel.IsCancelled(err) {
				return 0, nil, err
			}

			failed[link.Store] = true
			conflicts++
			context.Report(output.SanitizeTerminal("Could not place unpublished env file: " + link.Path))
		} else {
			conflicts += result.Conflicts
		}
	}

	return conflicts, failed, nil
}

func isUnpublished(context *syncmodel.Context, repos map[string]bool, link state.Link) (bool, error) {
	if link.LocalOnly || context.SkippedRoots[link.Root] {
		return false, nil
	}

	for _, checkout := range context.State.Approved {
		if checkout.Root != link.Root {
			continue
		}

		id := syncmodel.Alias(context.State, checkout.RepoID)

		if !repos[id] {
			return false, nil
		}

		fileID, err := protocolfiles.FileID(context.Checkpoint.IdKey, id, link.Path)
		if err != nil {
			return false, err
		}

		for _, entry := range context.Checkpoint.Files.Entries {
			if bytes.Equal(entry.FileId, fileID) {
				return false, nil
			}
		}

		return true, nil
	}

	return false, nil
}
