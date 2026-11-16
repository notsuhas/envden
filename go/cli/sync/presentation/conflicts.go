package presentation

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/model/conflicts"
	"github.com/notsuhas/envden/go/cli/output"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var variantPattern = regexp.MustCompile(`\.variant-(\d+)$`)

func ConflictsText(records []conflicts.Record) string {
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

func ResolvedText(result conflicts.Resolved) string {
	lines := append([]string{"Resolved " + result.Path}, result.PlacementReports...)
	if len(result.Preserved) > 0 {
		lines = append(lines, "Backups saved in "+result.Backups)
	}
	return output.SanitizeConsole(strings.Join(lines, "\n"))
}
