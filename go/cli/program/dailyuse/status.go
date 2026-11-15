package dailyuse

import "github.com/notsuhas/envden/go/cli/program/runtime"
import "github.com/notsuhas/envden/go/cli/status"
import "github.com/notsuhas/envden/go/cli/notice"
import "github.com/notsuhas/envden/go/cli/output"
import "github.com/notsuhas/envden/go/cli/output/render/sync/diff"
import "os"
import "github.com/notsuhas/envden/go/lib/commander"

func StatusCommand() *commander.Command {
	c := commander.New("status").Description("Show what changed here, what's newer on the server and what needs attention")
	c.AddOption(commander.NewOption("--json", "Machine-readable status"))
	c.AddOption(commander.NewOption("--refresh-cache", "").HideHelp())
	c.Action(func(i *commander.Invocation) error {
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
