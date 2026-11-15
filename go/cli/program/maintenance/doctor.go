package maintenance

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func DoctorCommand() *commander.Command {
	c := commander.New("doctor").Description("Check key files, symlinks, updates, Tailscale, HTTPS and shell notices")
	c.AddOption(commander.NewOption("--json", "Print the report as JSON"))
	c.Action(stub.Action)
	return c
}
