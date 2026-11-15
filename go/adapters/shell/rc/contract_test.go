package rc

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	suite "github.com/notsuhas/envden/go/testing/shell"
)

func TestContract(t *testing.T) {
	for _, shell := range []string{"zsh", "bash", "fish", "powershell"} {
		t.Run(shell, func(t *testing.T) {
			suite.ShellContract(t, func(home string) adapters.Shell { return CreateRCShellAdapter(shell, Options{Home: home}) })
		})
	}
}
