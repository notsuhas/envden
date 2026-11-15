package maintenance

import "github.com/notsuhas/envden/go/cli/program/runtime"
import "github.com/notsuhas/envden/go/cli/updates"
import "github.com/notsuhas/envden/go/cli/updates/self"
import "github.com/notsuhas/envden/go/cli/updates/check"
import "github.com/notsuhas/envden/go/cli/output"
import "github.com/notsuhas/envden/go/cli/output/prompts"
import "github.com/notsuhas/envden/go/lib/commander"

func UpdateCommand() *commander.Command {
	c := commander.New("update").Description("Update envden through the method it was installed with")
	c.AddOption(commander.NewOption("--check", "Check for a release without installing"))
	c.AddOption(commander.NewOption("--post-install", "Refresh installed integrations"))
	c.Action(func(i *commander.Invocation) error {
		env, e := runtime.Get(i)
		if e != nil {
			return e
		}
		a := env.Adapters
		if i.Values["postInstall"] == true {
			self.RefreshInstallation(a, runtime.Writer(i.Command, true))
			return nil
		}
		var result check.Result
		if i.Values["check"] == true {
			result, e = updates.RunUpdateCheck(env.Context, a, a.Now(), true, env.Env)
		} else {
			binary := env.Binary
			if binary == "" {
				binary = a.Executable
			}
			result, e = self.SelfUpdate(env.Context, a, self.Options{Binary: binary, Env: env.Env, Confirm: func(line string) (bool, error) { return prompts.Consent("Run "+line+"?", false) }, Stderr: runtime.Writer(i.Command, true)})
		}
		if e != nil {
			return e
		}
		text, e := output.TerminalJSON(result)
		if e != nil {
			return e
		}
		return runtime.Print(i, text)
	})
	return c
}
