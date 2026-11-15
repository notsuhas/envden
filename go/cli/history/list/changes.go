package list

import (
	"github.com/notsuhas/envden/go/core/merge"
)

type KeyChanges struct {
	Added   []string `json:"added"`
	Changed []string `json:"changed"`
	Removed []string `json:"removed"`
}

func VersionKind(state int) string {
	switch state {
	case 2:
		return "deleted"
	case 3:
		return "restored"
	case 4:
		return "lost"
	default:
		return "live"
	}
}

func VersionChanges(content [][]byte, complete bool) []any {
	result := []any{}
	for i, current := range content {
		if i+1 == len(content) && !complete {
			result = append(result, "unknown")
			continue
		}
		var previous []byte
		if i+1 < len(content) {
			previous = content[i+1]
		}
		diff := merge.DiffEnvKeys(previous, current)
		if diff.Kind == "conflict" {
			result = append(result, "unparsed")
			continue
		}
		result = append(result, KeyChanges{diff.Added, diff.Changed, diff.Removed})
	}
	return result
}
