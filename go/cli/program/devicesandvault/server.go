package devicesandvault

import "github.com/notsuhas/envden/go/lib/commander"

func ServerCommand() *commander.Command {
	c := commander.New("server").Description("Move, switch or repair the server")
	c0 := commander.New("move").Description("Move the vault to a new server")
	c0.AddOption(commander.NewOption("--setup-token <token>", "Setup token, visible to other processes; use the prompt in a terminal"))
	c0.AddOption(commander.NewOption("--resume", "Resume an interrupted move").Conflicts("abort"))
	c0.AddOption(commander.NewOption("--abort", "Abort an unfinished move"))
	c0.AddArgument(commander.NewArgument("[server]", "Destination server address"))
	c0.Action(serverMoveAction)
	c.AddCommand(c0)
	c1 := commander.New("switch").Description("Follow a signed move when the old server is unreachable")
	c1.AddArgument(commander.NewArgument("<server>", "Destination server address"))
	c1.Action(serverSwitchAction)
	c.AddCommand(c1)
	c2 := commander.New("repair").Description("After a server restore, re-upload this device's data, or finish the restore with --finish")
	c2.AddOption(commander.NewOption("--repair-token <token>", "Repair token; prefer stdin for upload, use a terminal for --finish"))
	c2.AddOption(commander.NewOption("--finish", "Check every device's upload and finish the restore"))
	c2.AddOption(commander.NewOption("--without <device...>", "Drop unavailable devices; they rejoin as new devices"))
	c2.AddOption(commander.NewOption("--accept-lost", "Accept the newest verified older version of a missing file"))
	c2.Action(serverRepairAction)
	c.AddCommand(c2)
	return c
}
