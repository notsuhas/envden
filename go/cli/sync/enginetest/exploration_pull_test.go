package enginetest

import (
	"strings"
	"testing"
)

func TestFailedPlacementStillChecksConflictFreePull(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("copy")
	m := newExploration(f, targets)
	m.targets[1][0].Root += "-fault"
	m.commits = append(m.commits, value{"TOKEN=expected\n", true})
	m.doPull(1, 0, false)
	found := false
	for _, v := range m.violations {
		if strings.Contains(v, "I2-pull-not-converged") {
			found = true
		}
	}
	equal(t, found, true)
}
