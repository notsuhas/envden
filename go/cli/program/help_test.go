package program

import (
	"bytes"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/program/command"
)

func TestParentHelp(t *testing.T) {
	for _, parent := range [][]string{nil, {"device"}, {"vault"}, {"vault", "kit"}, {"vault", "password"}, {"server"}, {"agent"}, {"shell"}} {
		for _, tail := range [][]string{{"help"}, {"--help"}} {
			args := append(append([]string{}, parent...), tail...)
			p := CreateProgram()
			var out, stderr bytes.Buffer
			p.SetOut(&out)
			p.SetErr(&stderr)
			_, err := command.Execute(p, args)
			if err != nil || !strings.Contains(out.String(), "display help for command") || stderr.Len() != 0 {
				t.Errorf("%v: %v stdout=%s stderr=%s", args, err, out.String(), stderr.String())
			}
		}
	}
}

func TestHelpTargetsImmediateChild(t *testing.T) {
	for _, row := range []struct {
		args []string
		fact string
		code int
	}{
		{[]string{"device", "help", "ls"}, "List devices", 0},
		{[]string{"device", "help", "ls", "extra", "--bogus"}, "List devices", 0},
		{[]string{"help", "device", "ls"}, "Add, list, rename", 0},
		{[]string{"device", "help", "--bogus"}, "Add, list, rename", 0},
		{[]string{"device", "help", "nope"}, "Add, list, rename", 1},
		{[]string{"device", "help", "help"}, "Add, list, rename", 1},
	} {
		p := CreateProgram()
		var out, stderr bytes.Buffer
		p.SetOut(&out)
		p.SetErr(&stderr)
		_, err := command.Execute(p, row.args)
		if row.code == 0 {
			if err != nil || !strings.Contains(out.String(), row.fact) || stderr.Len() != 0 {
				t.Errorf("%v: %v stdout=%s stderr=%s", row.args, err, out.String(), stderr.String())
			}
		} else if err == nil || !strings.Contains(stderr.String(), row.fact) || out.Len() != 0 {
			t.Errorf("%v: %v stdout=%s stderr=%s", row.args, err, out.String(), stderr.String())
		}
	}
}

func TestParseErrorsIdentifyError(t *testing.T) {
	for _, args := range [][]string{{"nope"}, {"--bogus"}, {"device", "nope"}, {"device", "ls", "--bogus"}, {"device", "rename"}} {
		p := CreateProgram()
		var out bytes.Buffer
		p.SetErr(&out)
		_, err := command.Execute(p, args)
		if err == nil || !strings.HasPrefix(out.String(), "error: ") {
			t.Errorf("%v: %v %q", args, err, out.String())
		}
	}
}
