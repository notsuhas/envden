package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func ServerCommand() *cobra.Command {
	c := command.New("server", "Move, switch or repair the server")
	c0 := command.New("move", "Move the vault to a new server")
	command.AddFlag(c0, command.Flag{Syntax: "--setup-token <token>", Description: "Setup token, visible to other processes; use the prompt in a terminal"})
	command.AddFlag(c0, command.Flag{Syntax: "--resume", Description: "Resume an interrupted move", Conflicts: []string{"abort"}})
	command.AddFlag(c0, command.Flag{Syntax: "--abort", Description: "Abort an unfinished move"})
	command.AddArgument(c0, command.Argument{Term: "[server]", Description: "Destination server address"})
	command.Action(c0, serverMoveAction)
	c.AddCommand(c0)
	c1 := command.New("switch", "Follow a signed move when the old server is unreachable")
	command.AddArgument(c1, command.Argument{Term: "<server>", Description: "Destination server address"})
	command.Action(c1, serverSwitchAction)
	c.AddCommand(c1)
	c2 := command.New("repair", "After a server restore, re-upload this device's data, or finish the restore with --finish")
	command.AddFlag(c2, command.Flag{Syntax: "--repair-token <token>", Description: "Repair token; prefer stdin for upload, use a terminal for --finish"})
	command.AddFlag(c2, command.Flag{Syntax: "--finish", Description: "Check every device's upload and finish the restore"})
	command.AddFlag(c2, command.Flag{Syntax: "--without <device...>", Description: "Drop unavailable devices; they rejoin as new devices"})
	command.AddFlag(c2, command.Flag{Syntax: "--accept-lost", Description: "Accept the newest verified older version of a missing file"})
	command.Action(c2, serverRepairAction)
	c.AddCommand(c2)

	return c
}
