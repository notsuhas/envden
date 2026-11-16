package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"time"

	"github.com/notsuhas/envden/go/cli"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/output/telemetry"
	"github.com/notsuhas/envden/go/cli/program"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/report"
	"github.com/notsuhas/envden/go/core/process"
	"golang.org/x/term"
)

func main() { os.Exit(run()) }

func run() int {
	ctx := context.Background()
	if len(os.Args) > 1 && os.Args[1] == telemetry.TelemetrySendCommand {
		telemetry.DeliverTelemetry(ctx, os.Getenv(telemetry.TelemetryBody), client.DefaultFetch)

		return 0
	}

	now := func() int64 { return time.Now().UnixMilli() }
	a, err := cli.CreateAdapters(nil, now)
	if err != nil {
		return output.ReportError(os.Stderr, err)
	}

	env := telemetry.SystemEnvironment()
	interactive := term.IsTerminal(int(os.Stdin.Fd())) && term.IsTerminal(int(os.Stdout.Fd()))
	binary, _ := os.Executable()
	err = program.Run(ctx, a, os.Args[1:], program.RunOptions{Binary: binary, Stdout: os.Stdout, Stderr: os.Stderr, Interactive: interactive, Env: env})
	if err == nil {
		return 0
	}

	var exit *command.ExitError
	if errors.As(err, &exit) {
		return exit.ExitCode
	}

	_ = program.RecordFailure(a, err)
	code := output.ReportError(os.Stderr, err)
	report.ReportProblem(err, a, report.Effects{OSRelease: report.OSRelease(), Env: env, Interactive: interactive, Argv: os.Args[1:], Which: func(c string) string { p, _ := exec.LookPath(c); return p }, Choose: prompts.Choose, Print: func(s string) { fmt.Fprintln(os.Stderr, output.SanitizeTerminal(s)) }, Launch: launch, Open: openBrowser})

	return code
}

func launch(args []string) error {
	signal.Ignore(os.Interrupt)
	defer signal.Reset(os.Interrupt)
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = cmd.Run()

	return nil
}

func openBrowser(url string) (bool, error) {
	command := []string{"xdg-open", url}
	if runtime.GOOS == "darwin" {
		command = []string{"open", url}
	}

	if runtime.GOOS == "windows" {
		command = []string{"rundll32", "url.dll,FileProtocolHandler", url}
	}

	_, err := process.ExecTrusted(command[0], command[1:], process.Options{Stdout: "ignore", Stderr: "ignore"})
	if err != nil {
		return false, nil //nolint:nilerr // Browser launch failure is reported as an expected outcome.
	}

	return true, nil
}
