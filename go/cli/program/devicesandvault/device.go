package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func DeviceCommand() *cobra.Command {
	c := command.New("device", "Add, list, rename and remove devices")
	c0 := command.New("add", "Show a pairing code for a new device")
	command.Action(c0, deviceAddAction)
	c.AddCommand(c0)
	c1 := command.New("ls", "List devices and the version each last used")
	command.AddFlag(c1, command.Flag{Syntax: "--json", Description: "Print the result as JSON"})
	command.AddFlag(c1, command.Flag{Syntax: "--verbose", Description: "Include device ids"})
	command.Action(c1, deviceListAction)
	c.AddCommand(c1)
	c2 := command.New("rename", "Rename this device")
	command.AddArgument(c2, command.Argument{Term: "<name>", Description: "New name, unique in the vault"})
	command.Action(c2, deviceRenameAction)
	c.AddCommand(c2)
	c3 := command.New("rm", "Remove a device and re-key the vault so it can't read new changes")
	command.AddFlag(c3, command.Flag{Syntax: "--kit-out <file>", Description: "Write the new recovery kit as JSON to a private file instead of a PDF"})
	command.AddFlag(c3, command.Flag{Syntax: "--new-kit", Description: "Also replace the recovery kit as part of the removal"})
	command.AddArgument(c3, command.Argument{Term: "<device>", Description: "Device name or ID"})
	command.Action(c3, deviceRemoveAction)
	c.AddCommand(c3)

	return c
}
