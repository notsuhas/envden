package maintenance

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func ServeCommand() *commander.Command {
	c := commander.New("serve").Description("Run the server; ENVDEN_SETUP_TOKEN replaces the setup token")
	c.AddOption(commander.NewOption("--restored", "Start a restored backup in repair-only mode"))
	c.AddOption(commander.NewOption("--min-client <version>", "Oldest client version to accept"))
	c.AddOption(commander.NewOption("--data-dir <path>", "Server data directory"))
	c.AddOption(commander.NewOption("--port <port>", "Localhost port"))
	c.Action(stub.Action)
	return c
}
