package maintenance

import (
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/updates"
	"github.com/notsuhas/envden/go/cli/updates/check"
	"github.com/notsuhas/envden/go/cli/updates/self"
	"github.com/spf13/cobra"
)

func UpdateCommand() *cobra.Command {
	c := command.New("update", "Update envden through the method it was installed with")
	command.AddFlag(c, command.Flag{Syntax: "--check", Description: "Check for a release without installing"})
	command.AddFlag(c, command.Flag{Syntax: "--post-install", Description: "Refresh installed integrations"})
	command.Action(c, func(i *command.Invocation) error {
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
