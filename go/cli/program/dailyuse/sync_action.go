package dailyuse

import (
	"fmt"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	sync "github.com/notsuhas/envden/go/cli/sync"
	e "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
)

func syncText(direction string, result sync.Result) string {
	verb := "Pulled"
	if direction == "push" {
		verb = "Pushed"
	}
	moved := ""
	if result.Changed > 0 {
		moved = fmt.Sprintf("%s %s", verb, plural(result.Changed, "file"))
	}
	if result.Conflicts == 0 {
		if moved != "" {
			return moved
		}
		if direction == "push" {
			return "Nothing to push"
		}

		return "Up to date"
	}
	pending := plural(result.Conflicts, "conflict") + " to resolve"
	if moved != "" {
		return moved + "; " + pending
	}

	return pending + "; nothing " + strings.ToLower(verb)
}

func plural(n int, noun string) string {
	if n != 1 {
		noun += "s"
	}

	return fmt.Sprintf("%d %s", n, noun)
}

func syncAction(direction string) func(*commander.Invocation) error {
	return func(i *commander.Invocation) error {
		env, err := runtime.Get(i)
		if err != nil {
			return err
		}
		options := sync.CommandOptions(env.Adapters, i.Values, env.Interactive, func(message string) {
			if i.Values["json"] != true {
				_ = runtime.Print(i, output.SanitizeTerminal(message))
			}
		})
		var result sync.Result
		if direction == "push" {
			result, err = sync.Push(env.Context, env.Adapters, options)
		} else {
			result, err = sync.Pull(env.Context, env.Adapters, options)
		}
		if err != nil {
			return err
		}
		text := syncText(direction, result)
		if i.Values["json"] == true {
			raw, err := output.TerminalJSON(result)
			if err != nil {
				return err
			}
			if err = runtime.Print(i, raw); err != nil {
				return err
			}
		} else if result.Conflicts == 0 {
			if err = runtime.Print(i, text); err != nil {
				return err
			}
		}
		if result.Conflicts > 0 || result.Kind == "conflict" {
			return e.New(e.Conflict, text)
		}

		return nil
	}
}
