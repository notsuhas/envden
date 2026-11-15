package restore

import (
	"fmt"

	"github.com/notsuhas/envden/go/cli/history/list"
	"github.com/notsuhas/envden/go/cli/output"
)

func RestoreText(r Result) string {
	switch r.Kind {
	case "unchanged":
		return output.SanitizeConsole(fmt.Sprintf("%s already matches version %d", r.Path, r.Version))
	case "cancelled":
		return "Restore cancelled"
	}

	return output.SanitizeConsole(fmt.Sprintf("Restored %s to version %d as a local edit: %s\nReview it with envden diff, then run envden push to publish it", r.Path, r.Version, list.ChangesText(r.Changes)))
}
