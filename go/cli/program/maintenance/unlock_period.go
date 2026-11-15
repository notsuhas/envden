package maintenance

import (
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/output/render"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/lib/commander"
)

func applyUnlockPeriod(i *commander.Invocation, env runtime.Environment, r settings.Request) error {
	s, e := store.LoadState(env.Adapters.Home)
	if e != nil {
		return e
	}
	c, e := vault.VaultConnection(env.Context, env.Adapters, s, nil)
	if e != nil {
		return e
	}
	if r.Kind == "read" {
		v, e := settings.GetUnlockPeriod(env.Context, c.Client)
		if e != nil {
			return e
		}
		return runtime.Print(i, render.UnlockPeriodText(v.Period))
	}
	password, e := prompts.Secret("Master password")
	if e != nil {
		return e
	}
	if e = settings.SetUnlockPeriod(env.Context, c.Client, c.VaultID, r.Value, password); e != nil {
		return e
	}
	return runtime.Print(i, "unlock-period: "+r.Value)
}
