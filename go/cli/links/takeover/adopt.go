package takeover

import (
	"bytes"
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	linkmodel "github.com/notsuhas/envden/go/cli/links/model"
	"github.com/notsuhas/envden/go/cli/links/takeover/target"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/store"
	syncfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/validation"
	"github.com/notsuhas/envden/go/core/adapters"
	"path/filepath"
)

func AdoptGroup(ctx context.Context, a contracts.Adapters, state *model.State, group linkmodel.OwnLinkGroup, copy bool, report func(string)) []linkmodel.OwnLink {
	shownTarget := output.SanitizeTerminal(homePath(group.Target, output.RealHome(a.UserHome)))
	content := target.ReadTarget(group.Target)
	if content == nil {
		if report != nil {
			report("envden: can't read " + shownTarget + "; left the links to it in place")
		}
		return group.Links
	}
	if notice := validation.FileSizeNotice(group.Target, content); notice != "" {
		if report != nil {
			report(notice)
		}
		return group.Links
	}
	left := []linkmodel.OwnLink{}
	for _, own := range group.Links {
		adopted, err := adoptLink(ctx, a, state, own, content, copy)
		if adopted && err == nil {
			continue
		}
		if report != nil {
			shown := output.SanitizeTerminal(homePath(filepath.Join(own.Checkout.Root, own.Path), output.RealHome(a.UserHome)))
			if err != nil {
				report("envden: couldn't take over " + shown + "; left it linked to " + shownTarget)
			} else {
				report("envden: left " + shown + " linked to " + shownTarget + ": its synced copy differs")
			}
		}
		left = append(left, own)
	}
	return left
}

func adoptLink(ctx context.Context, a contracts.Adapters, state *model.State, own linkmodel.OwnLink, content []byte, copy bool) (bool, error) {
	stored, err := store.StorePath(a.Home, checkout.RepoID(state, own.Checkout.RepoID), own.Path)
	if err != nil {
		return false, err
	}
	existing, err := syncfiles.ReadBytes(stored)
	if err != nil {
		return false, err
	}
	if existing == nil {
		if err := files.AtomicWrite(stored, content, a.Now); err != nil {
			return false, err
		}
	} else if !bytes.Equal(existing, content) {
		return false, nil
	}
	if err := a.Repo.EnsureIgnored(own.Checkout, own.Path); err != nil {
		return false, err
	}
	placement, err := checkout.SupportedPlacement(ctx, a, own.Checkout.Root, copy, nil, false)
	if err != nil {
		return false, err
	}
	if err := placement.Place(stored, filepath.Join(own.Checkout.Root, own.Path), nil, &own.Link); err != nil {
		return false, err
	}
	if placement.Mode() == adapters.PlacementCopy {
		if err := syncfiles.WriteBytes(syncfiles.BasePath(a.Home, stored, own.Checkout.Root), content, a.Now); err != nil {
			return false, err
		}
	}
	state.Links = append(state.Links, model.Link{Root: own.Checkout.Root, Path: own.Path, Store: stored, Mode: string(placement.Mode()), OriginalLink: &own.Link})
	return true, nil
}
