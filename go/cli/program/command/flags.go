package command

import (
	"fmt"
	"slices"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

type Flag struct {
	Syntax, Description string
	Choices, Conflicts  []string
	Hidden, Negate      bool
	Parse               func(string) (any, error)
}

type flagValue struct {
	spec              Flag
	value             any
	failure           error
	boolean, variadic bool
}

func (v *flagValue) String() string {
	if v.value == nil {
		return ""
	}
	return fmt.Sprint(v.value)
}
func (v *flagValue) Type() string {
	if v.boolean {
		return "bool"
	}
	if v.variadic {
		return "strings"
	}
	return "string"
}
func (v *flagValue) Set(s string) error {
	if v.boolean {
		if s != "true" {
			return fmt.Errorf("boolean flag does not accept a value")
		}
		v.value = !v.spec.Negate
		return nil
	}
	if len(v.spec.Choices) > 0 && !slices.Contains(v.spec.Choices, s) {
		return fmt.Errorf("allowed choices are %s", strings.Join(v.spec.Choices, ", "))
	}
	var value any = s
	if v.spec.Parse != nil {
		var err error
		value, err = v.spec.Parse(s)
		if err != nil {
			v.failure = err
			return err
		}
	}
	if v.variadic {
		values, _ := v.value.([]string)
		v.value = append(values, s)
	} else {
		v.value = value
	}
	return nil
}

func AddFlag(c *cobra.Command, spec Flag) {
	fields := strings.Fields(spec.Syntax)
	name := strings.TrimPrefix(fields[0], "--")
	spec.Negate = strings.HasPrefix(name, "no-")
	v := &flagValue{spec: spec, boolean: len(fields) == 1, variadic: strings.Contains(spec.Syntax, "...")}
	if spec.Negate {
		v.value = true
	}
	description := spec.Description
	if len(spec.Choices) > 0 {
		description += " (choices: " + strings.Join(spec.Choices, ", ") + ")"
	}
	c.Flags().Var(v, name, description)
	f := c.Flags().Lookup(name)
	f.Hidden = spec.Hidden
	if v.boolean {
		f.NoOptDefVal = "true"
	}
	for _, conflict := range spec.Conflicts {
		if c.Annotations == nil {
			c.Annotations = map[string]string{}
		}
		c.Annotations["conflict:"+name] = conflict
	}
}

func validateFlags(c *cobra.Command) error {
	var err error
	c.Flags().Visit(func(f *pflag.Flag) {
		if err != nil {
			return
		}
		conflict := c.Annotations["conflict:"+f.Name]
		c.Flags().Visit(func(other *pflag.Flag) {
			if key(other.Name) == conflict {
				err = fmt.Errorf("--%s cannot be used with --%s", f.Name, other.Name)
			}
		})
	})
	return err
}
