package dailyuse

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	cm "github.com/notsuhas/envden/go/cli/model/conflicts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/settings"
	sync "github.com/notsuhas/envden/go/cli/sync"
	"github.com/notsuhas/envden/go/cli/sync/local"
	e "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
)

func resolveAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}
	if i.Values["list"] == true {
		records, err := local.ConflictRecords(env.Adapters.Home)
		if err != nil {
			return err
		}
		text := conflictsText(records)
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
			return e.New(e.InvalidInput, "Resolution requires a terminal; use --list, or config agent-merge on before --keep-mine/--take-server")
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
	lines := append([]string{"Resolved " + result.Path}, result.PlacementReports...)
	if len(result.Preserved) > 0 {
		lines = append(lines, "Backups saved in "+result.Backups)
	}
	text := output.SanitizeConsole(strings.Join(lines, "\n"))
	if i.Values["json"] == true {
		text, err = output.TerminalJSON(result)
		if err != nil {
			return err
		}
	}

	return runtime.Print(i, text)
}

var variantPattern = regexp.MustCompile(`\.variant-(\d+)$`)

func conflictsText(records []cm.Record) string {
	if len(records) == 0 {
		return "No conflicts"
	}
	lines := []string{"Conflicts:"}
	for _, record := range records {
		note := ""
		if record.Deleted {
			note = " (deleted on the server)"
		} else if record.MineDeleted {
			note = " (deleted here)"
		}
		lines = append(lines, "  "+filepath.Join(record.Root, record.Path)+note, "    edit "+record.File)
		for _, path := range record.Alternatives {
			source := "copy"
			match := variantPattern.FindStringSubmatch(path)
			if len(match) > 0 {
				index, _ := strconv.Atoi(match[1])
				if index == 0 {
					source = "this device"
				} else if index == 1 {
					source = "server"
				} else if index-2 < len(record.Targets) {
					source = filepath.Join(record.Targets[index-2].Root, record.Path)
				}
			}
			lines = append(lines, fmt.Sprintf("    saved %s: %s", source, path))
		}
	}
	lines = append(lines, "Edit the file, then run envden resolve <file>, or pass --keep-mine or --take-server")

	return output.SanitizeConsole(strings.Join(lines, "\n"))
}
