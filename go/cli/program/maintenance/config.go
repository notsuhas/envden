package maintenance

import (
	"github.com/notsuhas/envden/go/cli/output/render"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/lib/commander"
)

func ConfigCommand() *commander.Command {
	c := commander.New("config").Description("Read or change settings")
	c.AddArgument(commander.NewArgument("[key]", "telemetry, update-check, agent-merge, auto-approve-worktrees, unlock-period, placement or env-files"))
	c.AddArgument(commander.NewArgument("[values...]", "New value; placement takes a checkout path and link or copy"))
	c.Action(func(i *commander.Invocation) error {
		env, e := runtime.Get(i)
		if e != nil {
			return e
		}

		var key *string
		values := []string{}
		if len(i.Args) > 0 {
			key = &i.Args[0]
			values = i.Args[1:]
		}

		r, e := settings.SettingRequest(key, values)
		if e != nil {
			return e
		}

		if r.Kind == "unlock-period" || r.Key == "unlock-period" {
			s, e := store.LoadState(env.Adapters.Home)
			if e != nil {
				return e
			}

			if _, e = state.RequireConfigured(s); e != nil {
				return e
			}

			return applyUnlockPeriod(i, env, r)
		}

		var c settings.Config
		switch r.Kind {
		case "placement":
			c, e = settings.SetCheckoutPlacement(env.Context, env.Adapters, r.Checkout, r.Mode)
		case "set":
			c, e = settings.SetConfig(env.Context, r.Key, r.Value, env.Adapters.Home, env.Adapters.Timing, env.Interactive)
		default:
			c, e = settings.ReadConfig(env.Adapters.Home)
		}

		if e != nil {
			return e
		}

		if r.Kind == "list" {
			return runtime.Print(i, render.ConfigText(c, env.Env))
		}

		k := r.Key
		if r.Kind == "placement" {
			k = "placement"
		}

		return runtime.Print(i, render.SettingText(k, c, env.Env))
	})

	return c
}
