package devicesandvault

import "github.com/notsuhas/envden/go/lib/commander"

func DeviceCommand() *commander.Command {
	c := commander.New("device").Description("Add, list, rename and remove devices")
	c0 := commander.New("add").Description("Show a pairing code for a new device")
	c0.Action(deviceAddAction)
	c.AddCommand(c0)
	c1 := commander.New("ls").Description("List devices and the version each last used")
	c1.AddOption(commander.NewOption("--json", "Print the result as JSON"))
	c1.AddOption(commander.NewOption("--verbose", "Include device ids"))
	c1.Action(deviceListAction)
	c.AddCommand(c1)
	c2 := commander.New("rename").Description("Rename this device")
	c2.AddArgument(commander.NewArgument("<name>", "New name, unique in the vault"))
	c2.Action(deviceRenameAction)
	c.AddCommand(c2)
	c3 := commander.New("rm").Description("Remove a device and re-key the vault so it can't read new changes")
	c3.AddOption(commander.NewOption("--kit-out <file>", "Write the new recovery kit as JSON to a private file instead of a PDF"))
	c3.AddOption(commander.NewOption("--new-kit", "Also replace the recovery kit as part of the removal"))
	c3.AddArgument(commander.NewArgument("<device>", "Device name or ID"))
	c3.Action(deviceRemoveAction)
	c.AddCommand(c3)
	return c
}
