package links

import (
	"bytes"
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	linkmodel "github.com/notsuhas/envden/go/cli/links/model"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/store"
	syncfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/validation"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
)

type OwnLink = linkmodel.OwnLink
type LinkResult struct {
	Kind string
	Link *OwnLink
}
type ChooseVersion func(string) (string, error)

func LinkFile(ctx context.Context, a contracts.Adapters, state *model.State, item adapters.Checkout, placement adapters.Placement, path string, choose ChooseVersion, report func(string)) (LinkResult, error) {
	done := LinkResult{Kind: "done"}
	destination := filepath.Join(item.Root, path)
	stored, err := store.StorePath(a.Home, RepoID(state, item.RepoID), path)
	if err != nil {
		return done, err
	}
	for i := range state.Links {
		old := &state.Links[i]
		if old.Root == item.Root && old.Path == path {
			return done, relinkExisting(a, item, placement, destination, old)
		}
	}
	stat, err := os.Lstat(destination)
	if err != nil {
		return done, err
	}
	if stat.Mode()&os.ModeSymlink != 0 {
		status, err := placement.Inspect(stored, destination)
		if err != nil {
			return done, err
		}
		if status != adapters.PlacementLinked {
			text, err := os.Readlink(destination)
			if err != nil {
				return done, err
			}
			target := text
			if !filepath.IsAbs(target) {
				target = filepath.Join(filepath.Dir(destination), target)
			}
			real, err := filepath.EvalSymlinks(target)
			if err == nil {
				target = real
			}
			return LinkResult{Kind: "own-link", Link: &OwnLink{Checkout: item, Path: path, Link: text, Target: target}}, nil
		}
		if _, err := os.Lstat(stored); os.IsNotExist(err) {
			if err := placement.Remove(&stored, destination); err != nil {
				return done, err
			}
			if report != nil {
				report("envden: removed " + destination + ", a link to a deleted copy")
			}
			return done, nil
		} else if err != nil {
			return done, err
		}
		state.Links = append(state.Links, model.Link{Root: item.Root, Path: path, Store: stored, Mode: string(placement.Mode())})
		return done, nil
	}
	content, err := os.ReadFile(destination)
	if err != nil {
		return done, err
	}
	if notice := validation.FileSizeNotice(destination, content); notice != "" {
		if report != nil {
			report(notice)
		}
		return done, nil
	}
	choice := "store"
	st, err := os.Lstat(stored)
	if os.IsNotExist(err) {
		err = files.AtomicWrite(stored, content, a.Now)
	} else if err == nil {
		if !st.Mode().IsRegular() {
			return done, errors.New(errors.InvalidData, "Unsafe store file")
		}
		old, e := os.ReadFile(stored)
		if e != nil {
			return done, e
		}
		if !bytes.Equal(old, content) {
			choice = "skip"
			if choose != nil {
				choice, err = choose(destination)
			}
		}
	}
	if err != nil {
		return done, err
	}
	if choice == "skip" {
		if report != nil {
			report(fmt.Sprintf("envden: %s differs from the synced copy; skipped", destination))
		}
		return done, nil
	}
	if err := a.Repo.EnsureIgnored(item, path); err != nil {
		return done, err
	}
	if choice == "separate" {
		state.Links = append(state.Links, model.Link{Root: item.Root, Path: path, Store: stored, Mode: "copy", LocalOnly: true})
		return done, nil
	}
	if err := placement.Place(stored, destination, nil, nil); err != nil {
		return done, err
	}
	if err := copyBase(a, stored, item.Root, placement.Mode()); err != nil {
		return done, err
	}
	state.Links = append(state.Links, model.Link{Root: item.Root, Path: path, Store: stored, Mode: string(placement.Mode())})
	return done, nil
}

func copyBase(a contracts.Adapters, stored, root string, mode adapters.PlacementMode) error {
	if mode != adapters.PlacementCopy {
		return nil
	}
	content, err := syncfiles.ReadBytes(stored)
	if err != nil {
		return err
	}
	return syncfiles.WriteBytes(syncfiles.BasePath(a.Home, stored, root), content, a.Now)
}

func relinkExisting(a contracts.Adapters, item adapters.Checkout, placement adapters.Placement, destination string, existing *model.Link) error {
	if existing.LocalOnly {
		return nil
	}
	current := a.Placement(adapters.PlacementMode(existing.Mode), item.Root)
	status, err := current.Inspect(existing.Store, destination)
	if err != nil {
		return err
	}
	if status != adapters.PlacementRelinkable && status != adapters.PlacementLinked {
		return nil
	}
	if existing.Mode != string(placement.Mode()) {
		if err := placement.Place(existing.Store, destination, nil, nil); err != nil {
			return err
		}
		if err := copyBase(a, existing.Store, item.Root, placement.Mode()); err != nil {
			return err
		}
		existing.Mode = string(placement.Mode())
	} else if status == adapters.PlacementRelinkable {
		return current.Place(existing.Store, destination, nil, nil)
	}
	return nil
}
