package maintenance

import (
	"github.com/notsuhas/envden/go/cli/diagnostics"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/render"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/spf13/cobra"
)

func DoctorCommand() *cobra.Command {
	c := command.New("doctor", "Check key files, symlinks, updates, Tailscale, HTTPS and shell notices")
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Print the report as JSON"})
	command.Action(c, func(i *command.Invocation) error {
		env, e := runtime.Get(i)
		if e != nil {
			return e
		}

		r, e := diagnostics.Doctor(env.Adapters, settings.Paths(env.Adapters.Home))
		if e != nil {
			return e
		}

		text := render.DoctorText(r)
		if i.Values["json"] == true {
			text, e = output.TerminalJSON(r)
			if e != nil {
				return e
			}
		}

		return runtime.Print(i, text)
	})

	return c
}
