package program

import (
	"bytes"
	"encoding/json"
	stderrors "errors"
	"math"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/spf13/cobra"
)

func TestCommandBehavior(t *testing.T) {
	raw, err := os.ReadFile("testdata/behavior.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Args          []string
		Code          int
		Acted, Hooked bool
		Values        map[string]any
		Parsed        []string
	}
	if err = json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		t.Run(string(mustJSON(row.Args)), func(t *testing.T) {
			p := CreateProgram()
			for j, value := range row.Parsed {
				if value == "<cwd>" {
					row.Parsed[j], err = os.Getwd()
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			var stdout, stderr bytes.Buffer
			p.SetOut(&stdout)
			p.SetErr(&stderr)
			acted, hooked := false, false
			var values map[string]any
			var parsed []string
			var wire func(*cobra.Command)
			wire = func(c *cobra.Command) {
				if !c.HasSubCommands() {
					command.Action(c, func(i *command.Invocation) error {
						acted = true
						values = i.Values
						for k, v := range values {
							if f, ok := v.(float64); ok && (math.IsNaN(f) || math.IsInf(f, 0)) {
								values[k] = nil
							}
						}
						parsed = i.Args
						return nil
					})
				}
				for _, child := range c.Commands() {
					wire(child)
				}
			}
			wire(p)
			p.PersistentPreRunE = func(*cobra.Command, []string) error { hooked = true; return nil }
			_, err := command.Execute(p, row.Args)
			code := 0
			if err != nil {
				var exit *command.ExitError
				if stderrors.As(err, &exit) {
					code = exit.ExitCode
				} else {
					code = output.ReportError(&stderr, err)
				}
			}
			if code != row.Code || acted != row.Acted || hooked != row.Hooked {
				t.Fatalf("code %d acted %v hooked %v; want %d %v %v; error %v", code, acted, hooked, row.Code, row.Acted, row.Hooked, err)
			}
			if acted && (string(mustJSON(values)) != string(mustJSON(row.Values)) || !reflect.DeepEqual(parsed, row.Parsed)) {
				t.Fatalf("values %s args %q; want %s %q", mustJSON(values), parsed, mustJSON(row.Values), row.Parsed)
			}
		})
	}
}

func TestActionsRequireRuntime(t *testing.T) {
	p := CreateProgram()
	_, err := command.Execute(p, []string{"push"})
	if !errors.Is(err, errors.Internal) || err.Error() != "Command runtime is not configured" {
		t.Fatal(err)
	}
}

func mustJSON(v any) []byte { b, _ := json.Marshal(v); return b }

func TestHelpFacts(t *testing.T) {
	for _, args := range [][]string{{"--help"}, {"--bogus", "rm", "--help"}, {"rm", "--help"}} {
		p := CreateProgram()
		var out bytes.Buffer
		p.SetOut(&out)
		_, err := command.Execute(p, args)
		if err != nil {
			t.Fatal(err)
		}
		facts := []string{"-V", "setup", "join", "status", "rm"}
		if args[0] == "rm" {
			facts = []string{"<path>", "--yes", "--json", "Remove an env file"}
		}
		for _, fact := range facts {
			if !strings.Contains(out.String(), fact) {
				t.Fatalf("%v: missing %q", args, fact)
			}
		}
		if strings.Contains(out.String(), "telemetry-send") {
			t.Fatal("hidden command shown")
		}
	}
}

func TestActionLifecycle(t *testing.T) {
	for _, row := range []struct {
		args []string
		fail bool
		want []string
	}{
		{[]string{"push", "--yes"}, false, []string{"pre", "action", "post"}},
		{[]string{"push", "--yes"}, true, []string{"pre", "action"}},
		{[]string{"push", "--yes=false"}, false, nil},
		{[]string{"push", "--help"}, false, nil},
		{[]string{"help", "push"}, false, nil},
		{[]string{"device"}, false, nil},
		{[]string{"history", "--restore", "abc", ".env"}, false, nil},
	} {
		t.Run(string(mustJSON(row.args)), func(t *testing.T) {
			p := CreateProgram()
			var out bytes.Buffer
			p.SetOut(&out)
			p.SetErr(&out)
			var trace []string
			p.PersistentPreRunE = func(*cobra.Command, []string) error { trace = append(trace, "pre"); return nil }
			p.PersistentPostRunE = func(*cobra.Command, []string) error { trace = append(trace, "post"); return nil }
			for _, c := range p.Commands() {
				if c.Name() == "push" {
					command.Action(c, func(*command.Invocation) error {
						trace = append(trace, "action")
						if row.fail {
							return errors.New(errors.InvalidInput, "action failed")
						}
						return nil
					})
				}
			}
			_, _ = command.Execute(p, row.args)
			if !reflect.DeepEqual(trace, row.want) {
				t.Fatalf("got %v want %v", trace, row.want)
			}
		})
	}
}
