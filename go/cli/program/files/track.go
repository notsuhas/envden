package files

import (
	"github.com/notsuhas/envden/go/lib/commander"
)

func TrackCommand(scanners ...TrackScanner) *commander.Command {
	c := commander.New("track").Description("Scan, approve and link checkout env files")
	c.AddOption(commander.NewOption("--copy", "Place real copies instead of links"))
	c.AddOption(commander.NewOption("--verbose", "List each repo and env file the scan skipped"))
	c.AddArgument(commander.NewArgument("[path]", "Checkout or scan root").Default("/Users/notsuhas/.t3/worktrees/envden/t3-97f9f53b-161054af94131d11", "current directory"))
	c.Action(func(i *commander.Invocation) error { return trackAction(i, scanners) })

	return c
}
