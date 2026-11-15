package dailyuse

import (
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	sync "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/lib/commander"
)

func diffAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}
	options := sync.CommandOptions(env.Adapters, i.Values, env.Interactive, nil)
	result, err := sync.Diff(env.Context, env.Adapters, options)
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
	blocks := []string{}
	for _, file := range result {
		if !file.Differs {
			continue
		}
		name := filepath.Join(file.Root, file.Path)
		if file.Kind == "conflict" {
			blocks = append(blocks, name+"\n  can't compare keys: "+strings.ReplaceAll(file.Reason, "-", " "))
			continue
		}
		lines := []string{name}
		for _, item := range []struct {
			keys   []string
			prefix string
		}{{file.Added, "  + "}, {file.Removed, "  - "}, {file.Changed, "  ~ "}} {
			for _, key := range item.keys {
				lines = append(lines, item.prefix+key)
			}
		}
		if len(lines) == 1 {
			lines = append(lines, "  only comments or formatting changed")
		}
		blocks = append(blocks, strings.Join(lines, "\n"))
	}
	if len(blocks) == 0 {
		return runtime.Print(i, "No changes since the last sync")
	}

	return runtime.Print(i, output.SanitizeConsole(strings.Join(blocks, "\n\n")))
}
