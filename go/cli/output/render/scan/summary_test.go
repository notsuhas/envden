package scan

import "testing"

func TestSkippedSummary(t *testing.T) {
	for _, r := range []struct {
		counts SkipCounts
		want   string
	}{{SkipCounts{}, ""}, {SkipCounts{Remote: 1}, "Skipped 1 repo without a usable git remote. Run envden track --verbose to list it."}, {SkipCounts{Identity: 2, OwnLinks: 1}, "Skipped 2 repos envden couldn't identify and 1 env file that is your own symlink. Run envden track --verbose to list them."}} {
		if got := SkippedSummary(r.counts, "envden track"); got != r.want {
			t.Fatal(got)
		}
	}
}
