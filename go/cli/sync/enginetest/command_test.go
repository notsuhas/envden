package enginetest

import (
	"bytes"
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/dailyuse"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/sync/local"
)

func TestCommandFreshHomeSyncGates(t *testing.T) {
	var help bytes.Buffer
	p := program.CreateProgram()
	p.SetOut(&help)
	must(t, p.Help())
	text := help.String()

	for _, name := range []string{"setup", "join", "push", "pull", "status", "diff", "resolve", "rm", "alias", "device", "server", "serve", "update", "config", "agent", "shell", "doctor", "version"} {
		if !strings.Contains(text, name) {
			t.Fatal("missing command", name)
		}
	}

	run := func(args ...string) (int, string, string) {
		home := t.TempDir()
		a := contracts.Adapters{Home: home, UserHome: home, Now: clock, Timing: lock.Timing{Now: clock}}
		var stdout, stderr bytes.Buffer
		err := program.Run(context.Background(), a, args, program.RunOptions{Stdout: &stdout, Stderr: &stderr, Env: map[string]string{"ENVDEN_TELEMETRY": "0", "ENVDEN_NO_UPDATE_CHECK": "1"}})
		code := 0
		if err != nil {
			code = output.ReportError(&stderr, err)
		}

		return code, stdout.String(), stderr.String()
	}
	code, _, stderr := run("push", "--yes")
	equal(t, code, 1)

	if !strings.Contains(stderr, "Not set up yet. Run envden setup or envden join") {
		t.Fatal(stderr)
	}

	code, stdout, _ := run("status", "--json")
	equal(t, code, 0)
	var status map[string]any
	must(t, json.Unmarshal([]byte(stdout), &status))
	equal(t, status["configured"], any(false))
	_, _, stderr = run("setup")

	if !strings.Contains(stderr, "--server <url> or --host-server") {
		t.Fatal(stderr)
	}

	_, _, stderr = run("push")

	if !strings.Contains(stderr, "--yes") {
		t.Fatal(stderr)
	}

	code, _, stderr = run("resolve", "file", "--keep-mine")
	equal(t, code, 2)

	if !strings.Contains(stderr, "agent-merge") {
		t.Fatal(stderr)
	}
}

func TestCommandResolutionChoices(t *testing.T) {
	for _, choice := range []string{"edit", "keep-mine", "take-server"} {
		t.Run(choice, func(t *testing.T) {
			f := newFixture(t)
			f.layout("copy")
			target := f.state(f.second).Links[0]
			f.write(f.aStore, "TOKEN=remote\n")
			f.push(f.first)
			f.write(target.Store, "TOKEN=mine\n")
			equal(t, f.pull(f.second).Conflicts, 1)
			records, err := local.ConflictRecords(f.second.Home)
			must(t, err)
			f.write(records[0].File, "TOKEN=edited\n")
			c := dailyuse.ResolveCommand()
			var output bytes.Buffer
			c.SetOut(&output)
			runtime.Bind(c, runtime.Environment{Context: f.ctx, Adapters: f.second, Interactive: true})
			defer runtime.Release(c)
			args := []string{}

			if choice != "edit" {
				args = append(args, "--"+choice)
			}

			_, err = command.Execute(c, args)
			must(t, err)
			expected := map[string]string{"edit": "TOKEN=edited\n", "keep-mine": "TOKEN=mine\n", "take-server": "TOKEN=remote\n"}[choice]
			equal(t, f.read(target.Store), expected)
			equal(t, f.read(filepath.Join(target.Root, ".env")), expected)
		})
	}
}

func TestDiffReportsUnapprovedCheckout(t *testing.T) {
	f := newFixture(t)
	t.Chdir(f.checkout.Root)
	f.repo(&f.first, nil)
	for _, args := range [][]string{nil, {"--all"}, {"--json"}} {
		c := dailyuse.DiffCommand()
		var out bytes.Buffer
		c.SetOut(&out)
		runtime.Bind(c, runtime.Environment{Context: f.ctx, Adapters: f.first, Interactive: false})
		_, err := command.Execute(c, args)
		runtime.Release(c)
		if len(args) > 0 && args[0] == "--all" {
			must(t, err)
		}
		has := strings.Contains(out.String(), "Skipped checkout requiring approval; run envden track")
		if has != (len(args) == 0 || args[0] != "--json") {
			t.Fatal(args, out.String())
		}
	}
}

func TestUnknownOptionDoesNotRemoveFile(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(f.checkout.Root, ".env")

	for _, args := range [][]string{{"--dry-run", "rm", "--yes", path}, {"rm", "--dry-run", "--yes", path}, {"rm", "--yes=false", path}} {
		var stdout, stderr bytes.Buffer
		err := program.Run(f.ctx, f.first, args, program.RunOptions{Stdout: &stdout, Stderr: &stderr, Env: map[string]string{"ENVDEN_NO_UPDATE_CHECK": "1"}})
		if err == nil || !strings.Contains(stderr.String(), "unknown option") {
			t.Fatalf("%v: err=%v stderr=%s", args, err, stderr.String())
		}
		equal(t, f.read(path), original)
		equal(t, f.read(f.aStore), original)
	}
}
