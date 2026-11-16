package dailyuse

import (
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	"github.com/notsuhas/envden/go/cli/sync/presentation"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func resolveAction(i *command.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	if i.Values["list"] == true {
		records, err := local.ConflictRecords(env.Adapters.Home)
		if err != nil {
			return err
		}

		text := presentation.ConflictsText(records)
		if i.Values["json"] == true {
			text, err = output.TerminalJSON(records)
			if err != nil {
				return err
			}
		}

		return runtime.Print(i, text)
	}

	keep, take := i.Values["keepMine"] == true, i.Values["takeServer"] == true
	if (keep || take) && !env.Interactive {
		config, err := settings.ReadConfig(env.Adapters.Home)
		if err != nil {
			return err
		}

		if !config.AgentMerge {
			return envdenerrors.New(envdenerrors.InvalidInput, "Resolution requires a terminal; use --list, or config agent-merge on before --keep-mine/--take-server")
		}
	}

	options := sync.ResolveOptions{Now: env.Adapters.Now, Choice: "edit"}
	if keep {
		options.Choice = "keep-mine"
	} else if take {
		options.Choice = "take-server"
	}

	if len(i.Args) > 0 {
		options.File = i.Args[0]
	}

	options.Repo, _ = i.Values["repo"].(string)
	result, err := sync.ResolveConflict(env.Context, env.Adapters, options)
	if err != nil {
		return err
	}

	text := presentation.ResolvedText(result)
	if i.Values["json"] == true {
		text, err = output.TerminalJSON(result)
		if err != nil {
			return err
		}
	}

	return runtime.Print(i, text)
}
