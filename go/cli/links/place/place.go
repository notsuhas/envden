package place

import (
	"context"
	"encoding/json"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/takeover"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

type LinkOptions struct {
	Copy, Interactive bool
	Approve           func(adapters.Checkout) (bool, error)
	Ask               func(string) (bool, error)
	Choose            links.ChooseVersion
	Report            func(string)
}

func LinkCheckout(ctx context.Context, a contracts.Adapters, state *model.State, item adapters.Checkout, options LinkOptions) ([]links.OwnLink, error) {
	own := []links.OwnLink{}
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		approval := links.CheckoutApproval(state, item)
		if approval == "changed" {
			return errors.New(errors.Conflict, "Checkout remote changed; use envden alias")
		}

		if approval == "ask" {
			auto, err := checkout.AutoApprovedWorktree(a, state, item)
			if err != nil {
				return err
			}

			if auto {
				if options.Report != nil {
					options.Report(checkout.WorktreeApprovedNotice(item))
				}
			} else {
				if options.Approve == nil {
					return nil
				}

				yes, err := options.Approve(item)
				if err != nil {
					return err
				}

				if !yes {
					return nil
				}
			}
		}

		approved := []model.Checkout{}
		for _, old := range state.Approved {
			if old.Root != item.Root {
				approved = append(approved, old)
			}
		}

		state.Approved = append(approved, checkout.ApprovalRecord(item))
		placement, err := checkout.SupportedPlacement(ctx, a, item.Root, options.Copy, options.Ask, options.Interactive)
		if err != nil {
			return err
		}

		config, err := settings.ReadConfig(a.Home)
		if err != nil {
			return err
		}

		var rules *adapters.EnvFileRules
		if config.EnvFiles != nil {
			raw, err := json.Marshal(config.EnvFiles)
			if err != nil {
				return err
			}

			rules = &adapters.EnvFileRules{}
			if err := json.Unmarshal(raw, rules); err != nil {
				return err
			}
		}

		paths, err := a.Repo.EnvFiles(item, rules)
		if err != nil {
			return err
		}

		for _, path := range paths {
			result, err := links.LinkFile(ctx, a, state, item, placement, path, options.Choose, options.Report)
			if err != nil {
				return err
			}

			if result.Link != nil && !takeover.SiblingLink(*result.Link, paths) {
				own = append(own, *result.Link)
			}
		}

		return nil
	})

	return own, err
}
