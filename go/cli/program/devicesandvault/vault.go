package devicesandvault

import (
	"github.com/notsuhas/envden/go/lib/commander"
)

func VaultCommand() *commander.Command {
	c := commander.New("vault").Description("Re-key the vault, replace the recovery kit, or change or reset the password")
	c0 := commander.New("rotate").Description("Re-key the vault so removed devices can't read new changes")
	c0.Action(vaultAction("rotate"))
	c.AddCommand(c0)
	c1 := commander.New("kit").Description("Manage the recovery kit")
	c10 := commander.New("replace").Description("Replace a lost kit; needs the master password")
	c10.AddOption(commander.NewOption("--kit-out <file>", "Write the new recovery kit as JSON to a private file instead of a PDF"))
	c10.Action(vaultAction("replace"))
	c1.AddCommand(c10)
	c.AddCommand(c1)
	c2 := commander.New("password").Description("Change or reset the master password")
	c20 := commander.New("change").Description("Change the password; needs the old one and the kit")
	c20.Action(vaultAction("change"))
	c2.AddCommand(c20)
	c21 := commander.New("reset").Description("Reset a forgotten password with the kit")
	c21.Action(vaultAction("reset"))
	c2.AddCommand(c21)
	c.AddCommand(c2)

	return c
}
