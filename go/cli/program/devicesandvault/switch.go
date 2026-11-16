package devicesandvault

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/move"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/program/access"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/session"
	"github.com/notsuhas/envden/go/cli/state/model"
)

func serverSwitchAction(i *command.Invocation) error {
	a, p, _, err := access.Runtime(i)
	if err != nil {
		return err
	}

	var unlock move.Unlock
	if p.Interactive {
		unlock = func(ctx context.Context, cl *client.Client, vault []byte) (*model.Window, error) {
			return session.Login(ctx, cl, vault, session.Password{Prompt: func(retry bool) (string, error) {
				label := "Master password"
				if retry {
					label = "Wrong master password. Try again"
				}

				return p.Secret(label, nil)
			}}, "")
		}
	}

	if err = move.SwitchServer(runtime.Context(i), a, i.Args[0], a.Now, a.Fetcher, unlock); err != nil {
		return err
	}

	return runtime.Print(i, "Server switched")
}
