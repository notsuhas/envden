package process

import (
	"bytes"
	"context"
	e "github.com/notsuhas/envden/go/core/errors"
	"golang.org/x/text/encoding/unicode"
	"io"
	"os"
	"os/exec"
	"time"
)

type Options struct {
	Env        map[string]string
	Cwd        string
	Timeout    int
	ManagerBin string
	Stdin      string
	Input      []byte
	Stdout     string
	Stderr     string
}
type Subprocess struct {
	Cmd    *exec.Cmd
	Stdout bytes.Buffer
	Stderr bytes.Buffer
	cancel context.CancelFunc
}
type Output struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

func SpawnTrusted(name string, args []string, options Options) (*Subprocess, error) {
	resolved, err := ResolveTrustedExecutable(name)
	if err != nil {
		return nil, err
	}
	ctx := context.Background()
	cancel := func() {}
	if options.Timeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, time.Duration(options.Timeout)*time.Millisecond)
	}
	cmd := exec.CommandContext(ctx, resolved, args...)
	cmd.Dir = options.Cwd
	for key, value := range SanitizedEnvironment(options.Env, nil, options.ManagerBin) {
		cmd.Env = append(cmd.Env, key+"="+value)
	}
	child := &Subprocess{Cmd: cmd, cancel: cancel}
	cmd.Stdout = &child.Stdout
	cmd.Stderr = &child.Stderr
	if options.Stdout == "inherit" {
		cmd.Stdout = os.Stdout
	} else if options.Stdout == "ignore" {
		cmd.Stdout = io.Discard
	}
	if options.Stderr == "inherit" {
		cmd.Stderr = os.Stderr
	} else if options.Stderr == "ignore" {
		cmd.Stderr = io.Discard
	}
	if options.Stdin == "inherit" {
		cmd.Stdin = os.Stdin
	} else if options.Input != nil {
		cmd.Stdin = bytes.NewReader(options.Input)
	}
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}
	return child, nil
}
func (p *Subprocess) Wait() (Output, error) {
	err := p.Cmd.Wait()
	p.cancel()
	out := Output{Stdout: decodeOutput(p.Stdout.Bytes(), true), Stderr: decodeOutput(p.Stderr.Bytes(), true), ExitCode: processExitCode(p.Cmd.ProcessState)}
	if _, ok := err.(*exec.ExitError); ok {
		return out, nil
	}
	return out, err
}

type ExitError struct{ ExitCode int }

func (e *ExitError) Error() string { return "Subprocess failed" }
func ExecTrusted(name string, args []string, options Options) (Output, error) {
	child, err := SpawnTrusted(name, args, options)
	if err != nil {
		return Output{}, err
	}
	out, err := child.Wait()
	if err != nil {
		return out, err
	}
	if out.ExitCode != 0 {
		return out, e.Wrap(e.InvalidInput, "Subprocess failed", &ExitError{out.ExitCode})
	}
	return out, nil
}
func ExecTrustedSync(name string, args []string, options Options) (string, error) {
	if options.Timeout == 0 {
		options.Timeout = 5000
	}
	options.Env = nil
	options.ManagerBin = ""
	out, err := SpawnTrustedSync(name, args, options)
	if err != nil {
		return "", err
	}
	if out.ExitCode != 0 {
		return "", e.New(e.InvalidInput, "Subprocess failed")
	}
	return decodeOutput(out.Stdout, false), nil
}

type SyncOutput struct {
	Stdout   []byte
	Stderr   []byte
	ExitCode int
}

func SpawnTrustedSync(name string, args []string, options Options) (SyncOutput, error) {
	child, err := SpawnTrusted(name, args, options)
	if err != nil {
		return SyncOutput{}, err
	}
	out, err := child.Wait()
	return SyncOutput{Stdout: bytes.Clone(child.Stdout.Bytes()), Stderr: bytes.Clone(child.Stderr.Bytes()), ExitCode: out.ExitCode}, err
}

func decodeOutput(raw []byte, stripBOM bool) string {
	decoder := unicode.UTF8.NewDecoder()
	if stripBOM {
		decoder = unicode.UTF8BOM.NewDecoder()
	}
	text, _ := decoder.String(string(raw))
	return text
}
