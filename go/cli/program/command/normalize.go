package command

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/spf13/cobra"
)

func prepare(c *cobra.Command, args []string) ([]string, error) {
	result := []string{}
	operands := []string{}
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
				if args[i+1] == "help" {
					return prepareHelp(c, args[i+2:])
				}
				for _, child := range c.Commands() {
					if child.Name() == args[i+1] {
						rest, err := prepare(child, append([]string{"--"}, args[i+2:]...))
						return append([]string{child.Name()}, rest...), err
					}
				}
			}
			return append(append(append(result, "--"), operands...), args[i+1:]...), nil
		}
		if token == "help" && c.HasSubCommands() && unknown == nil && len(result) == 0 {
			return prepareHelp(c, args[i+1:])
		}
		if !maybeOption(token) || (!c.HasSubCommands() && negativeNumber(c, token)) {
			for _, child := range c.Commands() {
				if token == child.Name() && unknown == nil && !help {
					rest, err := prepare(child, args[i+1:])
					return append(append(result, token), rest...), err
				}
			}
			if c.HasSubCommands() {
				result = append(result, token)
			} else {
				operands = append(operands, token)
			}
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
		if v.variadic && !attached {
			for i+1 < len(args) && (!maybeOption(args[i+1]) || negativeNumber(c, args[i+1])) {
				i++
				result = append(result, "--"+name+"="+args[i])
			}
		}
	}
	if help {
		return []string{"--help"}, nil
	}
	if len(operands) > 0 {
		result = append(append(result, "--"), operands...)
	}
	return result, unknown
}

var negativeNumberPattern = regexp.MustCompile(`^-(\d+|\d*\.\d+)([eE][+-]?\d+)?$`)

func maybeOption(arg string) bool {
	return len(arg) > 1 && arg[0] == '-'
}

func negativeNumber(c *cobra.Command, arg string) bool {
	if !negativeNumberPattern.MatchString(arg) {
		return false
	}
	for command := c; command != nil; command = command.Parent() {
		for digit := '0'; digit <= '9'; digit++ {
			if command.Flags().ShorthandLookup(string(digit)) != nil {
				return false
			}
		}
	}
	return true
}
