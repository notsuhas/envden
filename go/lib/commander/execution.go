package commander

import (
	"strings"
)

func (c *Command) excessContext() string {
	if c.Parent != nil {
		return " for '" + c.CommandName + "'"
	}

	return ""
}

func plural(n int, s string) string {
	if n == 1 {
		return s
	}

	return s + "s"
}

func (c *Command) runHooks(event string, target *Command) error {
	if event == "preAction" && c.Parent != nil {
		if err := c.Parent.runHooks(event, target); err != nil {
			return err
		}
	}
	for _, hook := range c.hooks[event] {
		if err := hook(c, target); err != nil {
			return err
		}
	}
	if event == "postAction" && c.Parent != nil {
		return c.Parent.runHooks(event, target)
	}

	return nil
}

func parseValue(o *Option, value string) (any, error) {
	if len(o.ChoiceValues) > 0 && !contains(o.ChoiceValues, value) {
		return nil, choiceError("Allowed choices are " + strings.Join(o.ChoiceValues, ", ") + ".")
	}
	if o.Parse != nil {
		return o.Parse(value)
	}

	return value, nil
}

func isNegative(s string) bool { return len(s) > 1 && s[0] == '-' && s[1] >= '0' && s[1] <= '9' }

func (c *Command) optionNames() []string {
	var names []string
	for _, o := range c.Options {
		if !o.Hidden && o.Long != "" {
			names = append(names, o.Long)
		}
	}
	if c.VersionText != "" {
		names = append(names, "--version")
	}

	return append(names, "--help")
}

func (c *Command) commandNames() []string {
	var names []string
	for _, s := range c.Commands {
		names = append(names, s.CommandName)
	}

	return append(names, "help")
}

type choiceError string

func (err choiceError) Error() string { return string(err) }
