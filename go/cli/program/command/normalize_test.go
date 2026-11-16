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
	for _, syntax := range []string{"--values"} {
		root := New("test", "")
		AddFlag(root, Flag{Syntax: "--values <value...>"})
		args := []string{syntax, "first"}
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

// an attached value ends a variadic option, so the next words are operands
func TestAttachedVariadicValueStopsCollecting(t *testing.T) {
	for _, next := range []string{"b", "-1"} {
		root := New("test", "")
		AddFlag(root, Flag{Syntax: "--values <value...>"})
		var got any
		Action(root, func(in *Invocation) error { got = in.Values["values"]; return nil })
		root.SetErr(io.Discard)
		if _, err := Execute(root, []string{"--values=a", next}); err == nil {
			t.Errorf("%s: accepted as a value: %v", next, got)
		}
	}

	root := New("test", "")
	AddFlag(root, Flag{Syntax: "--values <value...>"})
	AddArgument(root, Argument{Term: "[rest...]"})
	var values, rest any
	Action(root, func(in *Invocation) error { values, rest = in.Values["values"], in.Args; return nil })
	if _, err := Execute(root, []string{"--values=a", "b"}); err != nil || !reflect.DeepEqual(values, []string{"a"}) {
		t.Fatalf("values=%v rest=%v err=%v", values, rest, err)
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
