package checkouts

import (
	"context"
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/clack"
	"io"
)

type Eligible struct {
	Checkout adapters.Checkout
	Files    []string
}
type Dependencies struct {
	Find        func(*model.State) ([]Eligible, error)
	AutoApprove func(*model.State, adapters.Checkout) (bool, error)
	Label       func(*model.State, Eligible) string
	Link        func(context.Context, *model.State, adapters.Checkout) error
	Finish      func(context.Context, *model.State) error
}

func Setup(ctx context.Context, a contracts.Adapters, input *model.State, interactive bool, terminal *clack.Terminal, stdout io.Writer, d Dependencies) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		state, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}
		if state == nil {
			state = input
		}
		eligible, err := d.Find(state)
		if err != nil {
			return err
		}
		automatic := []adapters.Checkout{}
		asked := []Eligible{}
		for _, item := range eligible {
			approved := false
			for _, old := range state.Approved {
				if old.Root == item.Checkout.Root {
					approved = true
					break
				}
			}
			if !approved && d.AutoApprove != nil {
				approved, err = d.AutoApprove(state, item.Checkout)
				if err != nil {
					return err
				}
			}
			if approved {
				automatic = append(automatic, item.Checkout)
			} else {
				asked = append(asked, item)
			}
		}
		if len(asked) > 0 {
			if !interactive {
				return errors.New(errors.InvalidInput, "Approve checkouts in your own terminal with envden track")
			}
			options := []clack.Option{}
			initial := []string{}
			for _, item := range asked {
				options = append(options, clack.Option{Value: item.Checkout.Root, Label: d.Label(state, item)})
				initial = append(initial, item.Checkout.Root)
			}
			roots, err := terminal.Multiselect(clack.PromptOptions{Message: "Sync env files for these checkouts?", Options: options, InitialValues: initial, Required: false})
			if err != nil {
				return err
			}
			if len(roots) == 0 {
				fmt.Fprintln(stdout, "No checkouts selected. Add one later with: envden track <path>")
			}
			for _, item := range asked {
				for _, root := range roots {
					if item.Checkout.Root == root {
						automatic = append(automatic, item.Checkout)
						break
					}
				}
			}
		}
		for _, item := range automatic {
			if err = d.Link(ctx, state, item); err != nil {
				return err
			}
			if err = store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
				return err
			}
		}
		if d.Finish != nil {
			if err = d.Finish(ctx, state); err != nil {
				return err
			}
		}
		if err = store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
			return err
		}
		*input = *state
		return nil
	})
}
