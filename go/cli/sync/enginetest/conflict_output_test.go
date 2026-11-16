package enginetest

import (
	"strings"
	"testing"

	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/presentation"
)

func TestConflictListNamesEditsAndVariants(t *testing.T) {
	equal(t, strings.ToLower(presentation.ConflictsText(nil)), "no conflicts")
	record := conflictmodel.Record{Root: "/repo", Path: ".env", File: "/home/conflicts/ABC", Alternatives: []string{}, Targets: []state.Link{{Root: "/other"}}}
	saved := record
	saved.Path = ".env.local"
	saved.Deleted = true
	saved.Alternatives = []string{"/c/ABC.variant-1", "/c/ABC.variant-2"}
	text := presentation.ConflictsText([]conflictmodel.Record{record, saved})

	for _, line := range []string{"  /repo/.env\n    edit /home/conflicts/ABC", "  /repo/.env.local (deleted on the server)", "    saved server: /c/ABC.variant-1", "    saved /other/.env.local: /c/ABC.variant-2", "envden resolve"} {
		if !strings.Contains(text, line) {
			t.Fatalf("missing %q in %q", line, text)
		}
	}
}

func TestResolutionNamesFilePlacementAndBackups(t *testing.T) {
	result := conflictmodel.Resolved{Kind: "resolved", Path: ".env", Preserved: []string{"/b/1"}, PlacementReports: []string{"Copied .env into /repo"}, Backups: "/home/conflicts/backups", SavedBackups: []conflictmodel.Backup{}}
	text := presentation.ResolvedText(result)

	for _, part := range []string{".env", "Copied .env into /repo", "/home/conflicts/backups"} {
		if !strings.Contains(text, part) {
			t.Fatalf("missing %q in %q", part, text)
		}
	}

	result.Preserved = nil
	result.PlacementReports = nil
	equal(t, len(strings.Split(presentation.ResolvedText(result), "\n")), 1)
}
