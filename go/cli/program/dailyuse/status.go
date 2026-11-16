package dailyuse

import (
	"os"

	"github.com/notsuhas/envden/go/cli/notice"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/render/sync/diff"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/status"
	"github.com/spf13/cobra"
)

func StatusCommand() *cobra.Command {
	c := command.New("status", "Show what changed here, what's newer on the server and what needs attention")
	command.AddFlag(c, command.Flag{Syntax: "--json", Description: "Machine-readable status"})
	command.AddFlag(c, command.Flag{Syntax: "--refresh-cache", Description: "", Hidden: true})
	command.Action(c, func(i *command.Invocation) error {
		env, e := runtime.Get(i)
		if e != nil {
			return e
		}

		a := env.Adapters
		cwd, _ := os.Getwd()
		if i.Values["refreshCache"] == true {
			notice.CommandNotice(env.Context, a, a.Now(), true, cwd, false, env.Env, notice.DefaultHooks(runtime.Writer(i.Command, true)))

			return nil
		}

		report, e := status.StatusReport(env.Context, a, status.DefaultSources())
		if e != nil {
			return e
		}

		notice.CommandNotice(env.Context, a, a.Now(), false, cwd, true, env.Env, notice.DefaultHooks(runtime.Writer(i.Command, true)))
		text := diff.StatusText(report, diff.Place{Cwd: cwd, UserHome: output.RealHome(a.UserHome)})
		if i.Values["json"] == true {
			text, e = output.TerminalJSON(report)
			if e != nil {
				return e
			}
		}

		return runtime.Print(i, text)
	})

	return c
}
