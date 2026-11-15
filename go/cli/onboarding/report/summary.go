package report

import (
	"fmt"
	"strings"

	"github.com/notsuhas/envden/go/cli/state/model"
)

func syncedFiles(s *model.State, home string) string {
	count := 0
	roots := []string{}
	seen := map[string]bool{}
	for _, link := range s.Links {
		if link.LocalOnly {
			continue
		}

		count++
		root := link.Root
		if root == home {
			root = "~"
		} else if strings.HasPrefix(root, home+"/") {
			root = "~" + strings.TrimPrefix(root, home)
		}

		if !seen[root] {
			seen[root] = true
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

	word := "files"
	if count == 1 {
		word = "file"
	}

	return fmt.Sprintf("%d env %s in %s", count, word, where)
}

func SetupSummary(s *model.State, home string) []string {
	files := syncedFiles(s, home)
	server := "the server"
	if s.Server != nil {
		server = s.Server.Address
	}

	tracking := "tracking no env files yet"
	next := "Track a checkout with: envden track <path>"
	if files != "" {
		tracking = "tracking " + files
		next = "Add another device with: envden device add"
	}

	return []string{fmt.Sprintf("Setup complete. Vault on %s, this device is %s, %s.", server, s.DeviceName, tracking), next}
}

func JoinSummary(s *model.State, home string) string {
	text := "No env files synced yet."
	if files := syncedFiles(s, home); files != "" {
		text = "Synced " + files + "."
	}

	return "Joined as " + s.DeviceName + ". " + text
}
