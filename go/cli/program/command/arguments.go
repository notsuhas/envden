package command

import (
	"fmt"
	"slices"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/spf13/cobra"
)

type Argument struct {
	Term, Description, Default, DefaultDescription string
	Choices                                        []string
}

func AddArgument(c *cobra.Command, a Argument) {
	c.Use += " " + a.Term
	if c.Annotations == nil {
		c.Annotations = map[string]string{}
	}
	index := len(strings.Fields(c.Use)) - 2
	c.Annotations[fmt.Sprintf("default:%d", index)] = a.Default
	if c.Long == "" {
		c.Long = c.Short
	}
	c.Long = strings.TrimSpace(c.Long + "\n" + a.Term + ": " + a.Description)
	if len(a.Choices) > 0 {
		c.Long += " (choices: " + strings.Join(a.Choices, ", ") + ")"
	}
	if a.DefaultDescription != "" {
		c.Long += " (default: " + a.DefaultDescription + ")"
	}
	previous := c.Args
	c.Args = func(cmd *cobra.Command, args []string) error {
		if previous != nil {
			if err := previous(cmd, args); err != nil {
				return err
			}
		}
		if strings.HasPrefix(a.Term, "<") && len(args) <= index {
			return fmt.Errorf("missing required argument %s", a.Term)
		}
		if len(args) > index && len(a.Choices) > 0 && !slices.Contains(a.Choices, args[index]) {
			return fmt.Errorf("invalid argument %q for %s; allowed choices are %s", output.SanitizeTerminal(args[index]), a.Term, strings.Join(a.Choices, ", "))
		}
		return nil
	}
}

func arguments(c *cobra.Command, args []string) []string {
	args = append([]string{}, args...)
	terms := strings.Fields(c.Use)[1:]
	for i := len(args); i < len(terms); i++ {
		value := c.Annotations[fmt.Sprintf("default:%d", i)]
		if value != "" {
			args = append(args, value)
		}
	}
	return args
}

func validateArgs(c *cobra.Command, args []string, validate cobra.PositionalArgs) error {
	if err := validateFlags(c); err != nil {
		return err
	}
	terms := strings.Fields(c.Use)[1:]
	if (len(terms) == 0 || !strings.Contains(terms[len(terms)-1], "...")) && len(args) > len(terms) {
		return fmt.Errorf("too many arguments for %s: expected %d, got %d (%s)", c.Name(), len(terms), len(args), strings.Join(args, ", "))
	}
	if validate != nil {
		return validate(c, args)
	}
	return nil
}
