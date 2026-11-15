package program

import (
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/dailyuse"
	"github.com/notsuhas/envden/go/cli/program/devicesandvault"
	"github.com/notsuhas/envden/go/cli/program/files"
	"github.com/notsuhas/envden/go/cli/program/getstarted"
	"github.com/notsuhas/envden/go/cli/program/maintenance"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/lib/commander"
	"io"
)

func CreateProgram() *commander.Command {
	c := commander.New("envden").Description("Encrypted whole-file env sync over your private network").Version(version.Version)
	c.OutputError = func(message string, w io.Writer) { io.WriteString(w, output.SanitizeTerminal(message)+"\n") }
	c.CommandsGroup("Get started:")
	c.AddCommand(getstarted.SetupCommand())
	c.AddCommand(getstarted.JoinCommand())
	c.CommandsGroup("Daily use:")
	c.AddCommand(dailyuse.StatusCommand())
	c.AddCommand(dailyuse.PushCommand())
	c.AddCommand(dailyuse.PullCommand())
	c.AddCommand(dailyuse.DiffCommand())
	c.AddCommand(dailyuse.ResolveCommand())
	c.AddCommand(dailyuse.HistoryCommand())
	c.CommandsGroup("Files:")
	c.AddCommand(files.TrackCommand())
	c.AddCommand(files.UntrackCommand())
	c.AddCommand(files.LocalOnlyCommand())
	c.AddCommand(files.RmCommand())
	c.AddCommand(files.AliasCommand())
	c.CommandsGroup("Devices and vault:")
	c.AddCommand(devicesandvault.DeviceCommand())
	c.AddCommand(devicesandvault.VaultCommand())
	c.AddCommand(devicesandvault.ServerCommand())
	c.AddCommand(devicesandvault.UnlockCommand())
	c.CommandsGroup("Maintenance:")
	c.AddCommand(maintenance.ConfigCommand())
	c.AddCommand(maintenance.DoctorCommand())
	c.AddCommand(maintenance.UpdateCommand())
	c.AddCommand(maintenance.UiCommand())
	c.AddCommand(maintenance.AgentCommand())
	c.AddCommand(maintenance.ShellCommand())
	c.AddCommand(maintenance.ServeCommand())
	c.AddCommand(maintenance.VersionCommand())
	return c
}
