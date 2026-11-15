package scan

import (
	"fmt"
	"strings"
)

type SkipCounts struct{ Remote, Identity, OwnLinks int }

func SkippedSummary(c SkipCounts, command string) string {
	parts := []string{}
	for _, r := range []struct {
		count     int
		one, many string
	}{{c.Remote, "repo without a usable git remote", "repos without a usable git remote"}, {c.Identity, "repo envden couldn't identify", "repos envden couldn't identify"}, {c.OwnLinks, "env file that is your own symlink", "env files that are your own symlinks"}} {
		if r.count > 0 {
			noun := r.many
			if r.count == 1 {
				noun = r.one
			}
			parts = append(parts, fmt.Sprintf("%d %s", r.count, noun))
		}
	}
	if len(parts) == 0 {
		return ""
	}
	list := parts[0]
	if len(parts) > 1 {
		list = strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
	}
	pronoun := "them"
	if c.Remote+c.Identity+c.OwnLinks == 1 {
		pronoun = "it"
	}
	return "Skipped " + list + ". Run " + command + " --verbose to list " + pronoun + "."
}
