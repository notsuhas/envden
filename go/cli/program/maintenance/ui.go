package maintenance

import "github.com/notsuhas/envden/go/cli/program/stub"
import "github.com/notsuhas/envden/go/lib/commander"

func UiCommand() *commander.Command {
	c := commander.New("ui").Description("Open a local dashboard for this device")
	c.AddOption(commander.NewOption("--port <port>", "Port on 127.0.0.1 (default: random)"))
	c.AddOption(commander.NewOption("--no-open", "Print the link without opening a browser"))
	c.Action(stub.Action)
	return c
}
