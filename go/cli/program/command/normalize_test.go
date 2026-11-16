package command

import (
	"io"
	"reflect"
	"testing"
)

func TestDashOperands(t *testing.T) {
	for _, operand := range []string{"-", "-1", "-.5", "-1e2", "-1E-2", "-0.25e+3"} {
		for _, args := range [][]string{{operand, "--json"}, {"--json", operand}, {"--", operand}} {
			t.Run(operand+"/"+args[0], func(t *testing.T) {
				root := New("test", "")
				leaf := New("config", "")
				AddArgument(leaf, Argument{Term: "<key>"})
				AddFlag(leaf, Flag{Syntax: "--json"})
				var got []string
				Action(leaf, func(in *Invocation) error { got = in.Args; return nil })
				root.AddCommand(leaf)
				root.SetOut(io.Discard)
				root.SetErr(io.Discard)
				_, err := Execute(root, append([]string{"config"}, args...))
				if err != nil || !reflect.DeepEqual(got, []string{operand}) {
					t.Fatalf("%v: args=%v err=%v", args, got, err)
				}
			})
		}
	}
}

func TestVariadicDashValues(t *testing.T) {
	for _, syntax := range []string{"--values", "--values=first"} {
		root := New("test", "")
		AddFlag(root, Flag{Syntax: "--values <value...>"})
		args := []string{syntax}
		if syntax == "--values" {
			args = append(args, "first")
		}
		args = append(args, "-", "-1", "-.5", "-1e2")
		var got any
		Action(root, func(in *Invocation) error { got = in.Values["values"]; return nil })
		root.SetErr(io.Discard)
		_, err := Execute(root, args)
		want := []string{"first", "-", "-1", "-.5", "-1e2"}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("%v: values=%v err=%v", args, got, err)
		}
	}
}

func TestRejectNonNumericDashOptions(t *testing.T) {
	for _, operand := range []string{"-1.", "-1x", "-1e", "-."} {
		root := New("test", "")
		AddArgument(root, Argument{Term: "[key]"})
		root.SetErr(io.Discard)
		if _, err := Execute(root, []string{operand}); err == nil {
			t.Errorf("accepted %q", operand)
		}
	}
}
