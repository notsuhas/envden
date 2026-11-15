package maintenance

import "github.com/notsuhas/envden/go/cli/program/runtime"
import "github.com/notsuhas/envden/go/cli/diagnostics"
import "github.com/notsuhas/envden/go/cli/output"
import "github.com/notsuhas/envden/go/cli/output/render"
import "github.com/notsuhas/envden/go/cli/settings"
import "github.com/notsuhas/envden/go/lib/commander"

func DoctorCommand() *commander.Command {
	c := commander.New("doctor").Description("Check key files, symlinks, updates, Tailscale, HTTPS and shell notices")
	c.AddOption(commander.NewOption("--json", "Print the report as JSON"))
	c.Action(func(i *commander.Invocation) error {
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
