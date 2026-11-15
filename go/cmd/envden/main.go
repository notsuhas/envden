package main

import (
	"github.com/notsuhas/envden/go/cli"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program"
	"github.com/notsuhas/envden/go/lib/commander"
	"os"
	"time"
)

func main() {
	p := program.CreateProgram()
	p.Hook("preAction", func(root, command *commander.Command) error {
		a, err := cli.CreateAdapters(nil, func() int64 { return time.Now().UnixMilli() })
		if err != nil {
			return err
		}
		return program.SetExecutionRoots(a.Home)(root, command)
	})
	_, err := p.Parse(os.Args[1:])
	if err == nil {
		return
	}
	if exit, ok := err.(*commander.ExitError); ok {
		os.Exit(exit.ExitCode)
	}
	os.Exit(output.ReportError(os.Stderr, err))
}
