package tailscale

import "github.com/notsuhas/envden/go/core/process"

func runCommand(args []string) (CommandResult, error) {
	child, err := process.SpawnTrusted("tailscale", args, process.Options{})
	if err != nil {
		return CommandResult{}, err
	}
	out, err := child.Wait()
	return CommandResult{ExitCode: out.ExitCode, Stdout: out.Stdout, Stderr: out.Stderr}, err
}
