package files

import (
	"fmt"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/lib/commander"
)

func rmAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	options := sync.RemoveOptions{Yes: i.Values["yes"] == true, Interactive: env.Interactive, Now: env.Adapters.Now, Confirm: func(message string) (bool, error) { return prompts.Consent(message, false) }, Report: func(message string) {
		_, _ = fmt.Fprintln(runtime.Writer(i.Command, i.Values["json"] == true), output.SanitizeTerminal(message))
	}}
	result, err := sync.RemoveFile(env.Context, env.Adapters, i.Args[0], options)
	if err != nil {
		return err
	}

	if i.Values["json"] == true {
		raw, err := output.TerminalJSON(result)
		if err != nil {
			return err
		}

		return runtime.Print(i, raw)
	}

	for _, path := range result.Skipped {
		if err = runtime.Print(i, output.SanitizeTerminal("Skipped "+path+": run envden track to approve this checkout")); err != nil {
			return err
		}
	}

	text := "Removed unpublished file locally"
	if result.Kind == "blocked" {
		text = "Removal held back; approve the skipped checkout first"
	} else if result.Publish == "next-push" {
		text = "Removed locally; run envden push to delete everywhere"
	}

	return runtime.Print(i, text)
}

func aliasAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	if err = sync.AliasUnlinkedRepo(env.Context, env.Adapters, i.Args[0], i.Args[1]); err != nil {
		return err
	}

	return runtime.Print(i, "Alias saved")
}
