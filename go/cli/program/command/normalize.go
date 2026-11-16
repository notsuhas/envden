package command

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/spf13/cobra"
)

func prepare(c *cobra.Command, args []string) ([]string, error) {
	result := []string{}
	var unknown error
	help := false
	for i := 0; i < len(args); i++ {
		token := args[i]
		if token == "--" {
			if help {
				return []string{"--help"}, nil
			}
			if unknown != nil {
				return nil, unknown
			}
			if c.HasSubCommands() && len(result) == 0 && i+1 < len(args) {
				for _, child := range c.Commands() {
					if child.Name() == args[i+1] {
						rest, err := prepare(child, append([]string{"--"}, args[i+2:]...))
						return append([]string{child.Name()}, rest...), err
					}
				}
			}
			return append(result, args[i:]...), nil
		}
		if token == "help" && c.HasSubCommands() && unknown == nil && len(result) == 0 {
			target := c
			path := []string{}
			for _, name := range args[i+1:] {
				if !target.HasSubCommands() {
					break
				}
				var found *cobra.Command
				for _, child := range target.Commands() {
					if child.Name() == name {
						found = child
						break
					}
				}
				if found == nil {
					return nil, fmt.Errorf("unknown command %q", name)
				}
				target = found
				path = append(path, name)
			}
			return append(path, "--help"), nil
		}
		if !strings.HasPrefix(token, "-") {
			for _, child := range c.Commands() {
				if token == child.Name() && unknown == nil && !help {
					rest, err := prepare(child, args[i+1:])
					return append(append(result, token), rest...), err
				}
			}
			result = append(result, token)
			continue
		}
		if c.Version != "" && (token == "--version" || strings.HasPrefix(token, "-V")) {
			return []string{"--version"}, nil
		}
		if token == "--help" || token == "-h" {
			result = append(result, "--help")
			help = true
			continue
		}
		name, raw, attached := strings.Cut(strings.TrimPrefix(token, "--"), "=")
		f := c.Flags().Lookup(name)
		if f == nil || name == "version" {
			if unknown == nil {
				unknown = fmt.Errorf("unknown option %q", token)
			}
			continue
		}
		v, ok := f.Value.(*flagValue)
		if !ok {
			result = append(result, token)
			continue
		}
		if v.boolean && attached {
			if unknown == nil {
				unknown = fmt.Errorf("unknown option %q", token)
			}
			continue
		}
		result = append(result, token)
		if !v.boolean && !attached {
			if i+1 >= len(args) {
				return nil, fmt.Errorf("option --%s requires a value", name)
			}
			i++
			raw = args[i]
			result[len(result)-1] = "--" + name + "=" + raw
		}
		if len(v.spec.Choices) > 0 && !slices.Contains(v.spec.Choices, raw) {
			return nil, fmt.Errorf("invalid value %q for --%s; allowed choices are %s", raw, name, strings.Join(v.spec.Choices, ", "))
		}
		if v.spec.Parse != nil {
			if _, err := v.spec.Parse(raw); err != nil {
				var invalid *InvalidArgumentError
				if errors.As(err, &invalid) {
					return nil, fmt.Errorf("invalid value %q for --%s: %w", raw, name, err)
				}
				return nil, err
			}
		}
		if v.variadic {
			for i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				i++
				result = append(result, "--"+name+"="+args[i])
			}
		}
	}
	if help {
		return []string{"--help"}, nil
	}
	return result, unknown
}
