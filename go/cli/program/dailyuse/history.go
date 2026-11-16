package dailyuse

import (
	"github.com/notsuhas/envden/go/cli/history/restore"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/spf13/cobra"
)

func HistoryCommand() *cobra.Command {
	c := command.New("history", "List the versions the server keeps, or restore one as a local edit")
	command.AddFlag(c, command.Flag{Syntax: "--all", Description: "Include every tracked file", Conflicts: []string{"restore"}})
	opt := command.Flag{Syntax: "--restore <version>", Description: "Write that version into the checkout without pushing"}
	opt.Parse = func(value string) (any, error) { return restore.ParseVersion(value) }
	command.AddFlag(c, opt)
	command.AddFlag(c, command.Flag{Syntax: "--yes", Description: "Confirm the restore"})
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Print the result as JSON"})
	command.AddArgument(c, command.Argument{Term: "[file]", Description: "Env file path"})
	command.Action(c, historyAction)

	return c
}
