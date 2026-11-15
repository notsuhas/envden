package merge

import (
	"bytes"
	"fmt"
	"slices"
	"strings"
	"testing"
)

func TestSeededOneSidedBytes(t *testing.T) {
	seed := uint32(173)
	random := func() uint32 { seed = seed*1664525 + 1013904223; return seed }
	for i := 0; i < 300; i++ {
		newline := "\r\n"
		if random()%2 != 0 {
			newline = "\n"
		}
		rows := []string{}
		n := int(random()%10) + 1
		for j := 0; j < n; j++ {
			rows = append(rows, fmt.Sprintf("# comment %d%sKEY_%d='%d'%s", j, newline, j, random(), newline))
		}
		base := []byte(strings.Join(rows, ""))
		idx := int(random()) % len(rows)
		rows = append(rows[:idx], rows[idx+1:]...)
		slices.Reverse(rows)
		rows = append(rows, fmt.Sprintf("ADDED=%d%s# tail %d", random(), newline, random()))
		changed := []byte(strings.Join(rows, ""))
		for _, sides := range [][2][]byte{{base, changed}, {changed, base}} {
			got := MergeEnv(base, sides[0], sides[1])
			if got.Kind != "clean" || !bytes.Equal(got.Bytes, changed) {
				t.Fatalf("iteration %d: %+v", i, got)
			}
		}
	}
}

func TestIndependentSourceLines(t *testing.T) {
	for _, newline := range []string{"\n", "\r\n"} {
		for _, ending := range []string{"", newline} {
			for i := 0; i < 100; i++ {
				base := fmt.Sprintf("A=%d%sB=%d%s", i, newline, i, newline)
				local := fmt.Sprintf("A=%d%sB=%d%s", i, newline, i+1, newline)
				remote := fmt.Sprintf("B=%d%sA=%d%s", i, newline, i+2, ending)
				got := MergeEnv([]byte(base), []byte(local), []byte(remote))
				if got.Kind != "clean" {
					t.Fatal(got)
				}
				lines := map[string]bool{}
				for _, s := range []string{base, local, remote} {
					for _, line := range strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n") {
						lines[line] = true
					}
				}
				for _, line := range strings.Split(strings.ReplaceAll(string(got.Bytes), "\r\n", "\n"), "\n") {
					if !lines[line] {
						t.Fatalf("new source line %q", line)
					}
				}
			}
		}
	}
}
