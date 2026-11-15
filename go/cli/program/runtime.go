package program

import (
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/process"
	"github.com/notsuhas/envden/go/lib/commander"
)

func SetExecutionRoots(home string) func(*commander.Command, *commander.Command) error {
	return func(*commander.Command, *commander.Command) error {
		s, _ := store.LoadState(home)
		roots := []string{}
		if s != nil {
			for _, checkout := range s.Approved {
				roots = append(roots, checkout.Root)
			}
		}

		process.SetUntrustedRoots(roots)

		return nil
	}
}
