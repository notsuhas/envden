package completion

import "testing"

func TestDeriveGapAction(t *testing.T) {
	for _, c := range []struct {
		missing, lost int
		accept        bool
		want          string
	}{{0, 0, false, "finish"}, {1, 0, true, "report"}, {0, 1, false, "report"}, {0, 1, true, "finish"}} {
		if got := DeriveGapAction(c.missing, c.lost, c.accept); got != c.want {
			t.Fatal(c, got)
		}
	}
}
