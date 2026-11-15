package dailyuse

import (
	"os"

	"github.com/notsuhas/envden/go/cli/history/files"
	"github.com/notsuhas/envden/go/cli/history/list"
	"github.com/notsuhas/envden/go/cli/history/restore"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
)

func historyAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	a := env.Adapters
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	var file *string
	if len(i.Args) > 0 && i.Args[0] != "" {
		file = &i.Args[0]
	}

	json, _ := i.Values["json"].(bool)
	if value, ok := i.Values["restore"].(string); ok {
		version, err := restore.ParseVersion(value)
		if err != nil {
			return err
		}

		if file == nil {
			return errors.New(errors.InvalidInput, "Name the env file to restore")
		}

		yes, _ := i.Values["yes"].(bool)
		r, err := restore.RestoreVersion(env.Context, a, restore.Options{Cwd: cwd, File: *file, Version: version, Yes: yes, Interactive: env.Interactive, Confirm: func(message string) (bool, error) { return prompts.Consent(message, false) }, Now: a.Now, Fetcher: a.Fetcher})
		if err != nil {
			return err
		}

		text := restore.RestoreText(r)
		if json {
			text, err = output.TerminalJSON(r)
			if err != nil {
				return err
			}
		}

		return runtime.Print(i, text)
	}

	all, _ := i.Values["all"].(bool)
	r, err := list.FileHistory(env.Context, a, list.Options{Selection: files.Selection{Cwd: cwd, File: file, All: all}, Now: a.Now, Fetcher: a.Fetcher})
	if err != nil {
		return err
	}

	text := list.HistoryText(r, a.Now(), "")
	if json {
		text, err = output.TerminalJSON(r)
		if err != nil {
			return err
		}
	}

	return runtime.Print(i, text)
}
