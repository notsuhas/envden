package program

import (
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/dailyuse"
	"github.com/notsuhas/envden/go/cli/program/devicesandvault"
	"github.com/notsuhas/envden/go/cli/program/files"
	"github.com/notsuhas/envden/go/cli/program/getstarted"
	"github.com/notsuhas/envden/go/cli/program/maintenance"
	"github.com/notsuhas/envden/go/cli/version"
	"github.com/spf13/cobra"
)

func CreateProgram() *cobra.Command {
	c := command.New("envden", "Encrypted whole-file env sync over your private network")
	c.Version = version.Version
	c.Flags().BoolP("version", "V", false, "Print the version")
	c.SetVersionTemplate("{{.Version}}\n")
	c.AddCommand(getstarted.SetupCommand())
	c.AddCommand(getstarted.JoinCommand())
	c.AddCommand(dailyuse.StatusCommand())
	c.AddCommand(dailyuse.PushCommand())
	c.AddCommand(dailyuse.PullCommand())
	c.AddCommand(dailyuse.DiffCommand())
	c.AddCommand(dailyuse.ResolveCommand())
	c.AddCommand(dailyuse.HistoryCommand())
	c.AddCommand(files.TrackCommand())
	c.AddCommand(files.UntrackCommand())
	c.AddCommand(files.LocalOnlyCommand())
	c.AddCommand(files.RmCommand())
	c.AddCommand(files.AliasCommand())
	c.AddCommand(devicesandvault.DeviceCommand())
	c.AddCommand(devicesandvault.VaultCommand())
	c.AddCommand(devicesandvault.ServerCommand())
	c.AddCommand(devicesandvault.UnlockCommand())
	c.AddCommand(maintenance.ConfigCommand())
	c.AddCommand(maintenance.DoctorCommand())
	c.AddCommand(maintenance.UpdateCommand())
	c.AddCommand(maintenance.UiCommand())
	c.AddCommand(maintenance.AgentCommand())
	c.AddCommand(maintenance.ShellCommand())
	c.AddCommand(maintenance.ServeCommand())
	c.AddCommand(maintenance.VersionCommand())

	command.AddHelpCommands(c)

	return c
}
