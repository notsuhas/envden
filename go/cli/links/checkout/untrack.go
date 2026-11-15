package checkout

import (
	"context"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links/takeover/target"
	"github.com/notsuhas/envden/go/cli/notice"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	syncfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

func Untrack(ctx context.Context, a contracts.Adapters, path string) ([]string, error) {
	cancelled := []string{}
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		state, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}

		item, err := a.Repo.CheckoutAt(path)
		if err != nil {
			return err
		}

		found := false
		if state != nil && item != nil {
			for _, old := range state.Approved {
				if old.Root == item.Root {
					found = true
				}
			}
		}

		if !found {
			return errors.New(errors.NotFound, "Checkout is not tracked")
		}

		removed, remaining := []model.Link{}, []model.Link{}
		for _, link := range state.Links {
			if link.Root == item.Root {
				removed = append(removed, link)
			} else {
				remaining = append(remaining, link)
			}
		}

		for _, link := range removed {
			intent, err := operation.ReadDeletion(a.Home, link.Store, a.Now)
			if err != nil {
				return err
			}

			if intent != nil {
				other := false
				for _, r := range remaining {
					if r.Store == link.Store {
						other = true
					}
				}

				targets := []string{}
				for _, p := range intent.Targets {
					if p != filepath.Join(item.Root, link.Path) {
						targets = append(targets, p)
					}
				}

				if err := operation.RequestDeletion(a.Home, link.Store, other, &intent.Entry, targets, a.Now); err != nil {
					return err
				}

				if !other {
					cancelled = append(cancelled, intent.Targets...)
				}
			}

			if err := detachFile(a, link); err != nil {
				return err
			}
		}

		if err := RemoveCheckoutBases(a.Home, removed, remaining, a.Now); err != nil {
			return err
		}

		if err := RemoveConflictTargets(a.Home, item.Root, a.Now); err != nil {
			return err
		}

		state.Links = remaining
		approved := []model.Checkout{}
		for _, old := range state.Approved {
			if old.Root != item.Root {
				approved = append(approved, old)
			}
		}

		state.Approved = approved
		if err := store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
			return err
		}

		return notice.RefreshNotice(ctx, a.Home, state, func(root string) (bool, error) { return a.Repo.CaseInsensitive(root, true) }, a.Now, a.Timing)
	})

	return cancelled, err
}

func detachFile(a contracts.Adapters, link model.Link) error {
	placement := a.Placement(adapters.PlacementCopy, link.Root)
	destination := filepath.Join(link.Root, link.Path)
	status, err := placement.Inspect(link.Store, destination)
	if err != nil {
		return err
	}

	if status != adapters.PlacementLinked && status != adapters.PlacementRelinkable {
		return nil
	}

	if link.OriginalLink != nil && *link.OriginalLink != "" {
		path := *link.OriginalLink
		if !filepath.IsAbs(path) {
			path = filepath.Join(filepath.Dir(destination), path)
		}

		if target.RegularTarget(path) {
			if err := placement.Remove(&link.Store, destination); err != nil {
				return err
			}

			return os.Symlink(*link.OriginalLink, destination)
		}
	}

	content, err := syncfiles.ReadBytes(link.Store)
	if err != nil {
		return err
	}

	if content == nil {
		return placement.Remove(&link.Store, destination)
	}

	return placement.Place(link.Store, destination, nil, nil)
}
