package commander

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"testing"
)

func testProgram(w int) *Command {
	p := New("demo").Description("A command with grouped help and a long description which wraps at the configured terminal width.").Version("1.2.3")
	p.HelpWidth = w
	p.CommandsGroup("Daily use:")
	p.AddCommand(New("run").Description("Run a task and print a very long description which should wrap across multiple lines when the terminal is narrow enough.").Argument("<file>", "Input file").Option("--yes", "Confirm changes").Option("--name <name>", "Task name").Option("--count <n>", "Number of tasks").AddOption(NewOption("--mode <mode>", "Mode").Choices("fast", "slow").Default("slow")).AddOption(NewOption("--left", "Keep left").Conflicts("right")).Option("--right", "Keep right").Action(func(*Invocation) error { return nil }))
	p.CommandsGroup("Maintenance:")
	p.AddCommand(New("other").Description("Other commands").AddArgument(NewArgument("[shell]", "Shell").Choices("bash", "zsh").Default("bash")).Action(func(*Invocation) error { return nil }))
	p.AddCommand(New("batch").Description("Batch tasks").Argument("[files...]", "Files").Option("--tag <tags...>", "Tags").Option("--no-open", "Do not open").RequiredOption("--required <value>", "Required value").AddOption(NewOption("--hidden", "").HideHelp()).Action(func(*Invocation) error { return nil }))

	return p
}

func TestReference(t *testing.T) {
	var fixtures []struct {
		Width          int
		Args           []string
		Stdout, Stderr string
		Code           int
	}
	data, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		p := testProgram(f.Width)
		var out, stderr bytes.Buffer
		p.Stdout = &out
		p.Stderr = &stderr
		_, err := p.Parse(f.Args)
		code := 0
		var exit *ExitError
		if errors.As(err, &exit) {
			code = exit.ExitCode
		} else if err != nil {
			t.Fatal(err)
		}
		if out.String() != f.Stdout || stderr.String() != f.Stderr || code != f.Code {
			t.Errorf("width %d args %v\nstdout got %q want %q\nstderr got %q want %q\ncode %d want %d", f.Width, f.Args, out.String(), f.Stdout, stderr.String(), f.Stderr, code, f.Code)
		}
	}
}

func TestInvocation(t *testing.T) {
	var out bytes.Buffer
	program := New("demo")
	program.Stdout = &out
	program.Stderr = &out
	var hooks []string
	program.Hook("preAction", func(_, target *Command) error { hooks = append(hooks, "pre:"+target.CommandName); return nil })
	program.Hook("postAction", func(_, target *Command) error { hooks = append(hooks, "post:"+target.CommandName); return nil })
	program.AddCommand(New("run").Argument("[files...]", "Files").Option("--tag <tags...>", "Tags").Option("--no-open", "Open").Action(func(i *Invocation) error {
		if i.Values["open"] != false {
			t.Errorf("open = %v", i.Values["open"])
		}
		values := i.Values["tag"].([]string)
		if len(values) != 2 || values[0] != "x" || values[1] != "y" {
			t.Errorf("tags %v", values)
		}
		if len(i.Args) != 2 || i.Args[0] != "a" || i.Args[1] != "b" {
			t.Errorf("args %v", i.Args)
		}

		return nil
	}))
	if _, err := program.Parse([]string{"run", "a", "b", "--tag", "x", "y", "--no-open"}); err != nil {
		t.Fatal(err)
	}
	if len(hooks) != 2 || hooks[0] != "pre:run" || hooks[1] != "post:run" {
		t.Fatalf("hooks %v", hooks)
	}
}
