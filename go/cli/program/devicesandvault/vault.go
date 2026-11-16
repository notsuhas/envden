package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func VaultCommand() *cobra.Command {
	c := command.New("vault", "Re-key the vault, replace the recovery kit, or change or reset the password")
	c0 := command.New("rotate", "Re-key the vault so removed devices can't read new changes")
	command.Action(c0, vaultAction("rotate"))
	c.AddCommand(c0)
	c1 := command.New("kit", "Manage the recovery kit")
	c10 := command.New("replace", "Replace a lost kit; needs the master password")
	command.AddFlag(c10, command.Flag{Syntax: "--kit-out <file>", Description: "Write the new recovery kit as JSON to a private file instead of a PDF"})
	command.Action(c10, vaultAction("replace"))
	c1.AddCommand(c10)
	c.AddCommand(c1)
	c2 := command.New("password", "Change or reset the master password")
	c20 := command.New("change", "Change the password; needs the old one and the kit")
	command.Action(c20, vaultAction("change"))
	c2.AddCommand(c20)
	c21 := command.New("reset", "Reset a forgotten password with the kit")
	command.Action(c21, vaultAction("reset"))
	c2.AddCommand(c21)
	c.AddCommand(c2)

	return c
}
