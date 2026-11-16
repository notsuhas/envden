package progress

import (
	"fmt"

	"github.com/notsuhas/envden/go/cli/output"
)

type Scan struct {
	indicator *Spinner
	label     string
}

func ScanProgress(where string, enabled bool, terminal interface{ Spinner() *Spinner }) *Scan {
	s := &Scan{}
	if enabled {
		s.indicator = terminal.Spinner()
		s.label = "Looking for repos in " + output.SanitizeTerminal(where) + " …"
		s.indicator.Start(s.label + " 0 found")
	}

	return s
}

func (s *Scan) Found(count int) {
	if s.indicator != nil {
		s.indicator.Message(fmt.Sprintf("%s %d found", s.label, count))
	}
}

func (s *Scan) Done(count int) {
	if s.indicator != nil {
		noun := "repos"
		if count == 1 {
			noun = "repo"
		}

		s.indicator.Stop(fmt.Sprintf("Found %d %s with env files", count, noun))
	}
}

func (s *Scan) Abort() {
	if s.indicator != nil {
		s.indicator.Clear()
	}
}
