package agent

import "github.com/notsuhas/envden/go/cli/contracts"

func ManageShell(a contracts.Adapters, action, shell string) error {
	if shell == "none" {
		return nil
	}
	s := a.Shell(shell)
	if action == "install" {
		return s.Install(a.Executable)
	}
	return s.Uninstall()
}
