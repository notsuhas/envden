package devices

import (
	"fmt"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state/model"
)

func SetupSummary(state *model.State, userHome string) []string {
	files := syncedFiles(state, userHome)
	server := "the server"
	if state.Server != nil {
		server = state.Server.Address
	}

	tracking := "tracking no env files yet"
	next := "Track a checkout with: envden track <path>"
	if files != "" {
		tracking = "tracking " + files
		next = "Add another device with: envden device add"
	}

	return []string{output.SanitizeTerminal("Setup complete. Vault on " + server + ", this device is " + state.DeviceName + ", " + tracking + "."), next}
}

func JoinSummary(state *model.State, userHome string) []string {
	files := syncedFiles(state, userHome)
	summary := "No env files synced yet."
	if files != "" {
		summary = "Synced " + files + "."
	}

	return []string{output.SanitizeTerminal("Joined as " + state.DeviceName + ". " + summary)}
}

func syncedFiles(state *model.State, userHome string) string {
	count := 0
	roots := []string{}
	for _, link := range state.Links {
		if link.LocalOnly {
			continue
		}

		count++
		root := output.HomePath(link.Root, userHome)
		found := false
		for _, r := range roots {
			if r == root {
				found = true
			}
		}

		if !found {
			roots = append(roots, root)
		}
	}

	if count == 0 {
		return ""
	}

	where := strings.Join(roots, ", ")
	if len(roots) > 3 {
		where = fmt.Sprintf("%d checkouts", len(roots))
	}

	noun := "files"
	if count == 1 {
		noun = "file"
	}

	return fmt.Sprintf("%d env %s in %s", count, noun, where)
}
