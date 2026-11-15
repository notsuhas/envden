package devicesandvault

import (
	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/onboarding"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	rt "github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
	"os"
)

func serverMoveAction(i *commander.Invocation) error {
	env, err := rt.Get(i)
	if err != nil {
		return err
	}
	a := env.Adapters
	resume, _ := i.Values["resume"].(bool)
	abort, _ := i.Values["abort"].(bool)
	address := ""
	if len(i.Args) > 0 {
		address, err = onboarding.RequireServerAddress(i.Args[0])
		if err != nil {
			return err
		}
	}
	if address == "" && !resume && !abort {
		return errors.New(errors.InvalidInput, "Give the destination server address, or --resume or --abort for an unfinished move")
	}
	token, _ := i.Values["setupToken"].(string)
	if !resume && !abort {
		var supplied *string
		if _, ok := i.Values["setupToken"]; ok {
			supplied = &token
		}
		token, err = prompts.ReadToken("setup", supplied, os.Stdin, env.Interactive)
		if err != nil {
			return err
		}
	}
	password, err := prompts.Secret("Master password")
	if err != nil {
		return err
	}
	if err = move.MoveServer(env.Context, a, move.Options{Address: address, Token: token, Resume: resume, Abort: abort, Password: password, Now: a.Now, Fetcher: a.Fetcher}); err != nil {
		return err
	}
	return rt.Print(i, "Move complete")
}
