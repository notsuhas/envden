package program

import (
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/process"
	"github.com/spf13/cobra"
)

func SetExecutionRoots(home string) func(*cobra.Command, *cobra.Command) error {
	return func(*cobra.Command, *cobra.Command) error {
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
