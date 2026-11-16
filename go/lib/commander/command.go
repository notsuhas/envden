package commander

import (
	"io"
	"os"
	"strings"
)

type Command struct {
	CommandName, DescriptionText, VersionText, Group string
	Parent                                           *Command
	Commands                                         []*Command
	Options                                          []*Option
	Arguments                                        []*Argument
	HelpWidth                                        int
	Stdout, Stderr                                   io.Writer
	OutputError                                      func(string, io.Writer)
	ShowHelpAfterError                               bool
	UnknownOptions, PassThrough                      bool
	currentGroup                                     string
	action                                           func(*Invocation) error
	hooks                                            map[string][]func(*Command, *Command) error
}

type Invocation struct {
	Command *Command
	Args    []string
	Values  map[string]any
}

type ExitError struct {
	Code     string
	ExitCode int
	Message  string
}

func (e *ExitError) Error() string { return e.Message }

func New(name string) *Command {
	return &Command{CommandName: name, hooks: make(map[string][]func(*Command, *Command) error)}
}

func (c *Command) Name(name string) *Command { c.CommandName = name; return c }

func (c *Command) Description(text string) *Command { c.DescriptionText = text; return c }

func (c *Command) Version(text string) *Command { c.VersionText = text; return c }

func (c *Command) CommandsGroup(heading string) *Command { c.currentGroup = heading; return c }

func (c *Command) AddCommand(child *Command) *Command {
	child.Parent = c
	if child.Group == "" {
		child.Group = c.currentGroup
	}
	c.Commands = append(c.Commands, child)

	return c
}

func (c *Command) AddOption(option *Option) *Command { c.Options = append(c.Options, option); return c }

func (c *Command) Option(flags, description string) *Command {
	return c.AddOption(NewOption(flags, description))
}

func (c *Command) RequiredOption(flags, description string) *Command {
	option := NewOption(flags, description)
	option.Mandatory = true

	return c.AddOption(option)
}

func (c *Command) Argument(term, description string) *Command {
	return c.AddArgument(NewArgument(term, description))
}

func (c *Command) AddArgument(argument *Argument) *Command {
	c.Arguments = append(c.Arguments, argument)

	return c
}

func (c *Command) Action(action func(*Invocation) error) *Command { c.action = action; return c }

func (c *Command) Hook(event string, hook func(*Command, *Command) error) *Command {
	c.hooks[event] = append(c.hooks[event], hook)

	return c
}

func (c *Command) output(stderr bool) io.Writer {
	for p := c; p != nil; p = p.Parent {
		if stderr && p.Stderr != nil {
			return p.Stderr
		}
		if !stderr && p.Stdout != nil {
			return p.Stdout
		}
	}
	if stderr {
		return os.Stderr
	}

	return os.Stdout
}

func (c *Command) fail(code, message string) error {
	text := "error: " + message + "\n"
	if c.OutputError != nil {
		c.OutputError(text, c.output(true))
	} else {
		_, _ = io.WriteString(c.output(true), text)
	}
	if c.ShowHelpAfterError {
		_, _ = io.WriteString(c.output(true), "\n"+c.Help())
	}

	return &ExitError{Code: code, ExitCode: 1, Message: text}
}

func (c *Command) path() string {
	if c.Parent == nil {
		return c.CommandName
	}

	return c.Parent.path() + " " + c.CommandName
}

func (c *Command) usage() string {
	parts := []string{c.path(), "[options]"}
	if len(c.Commands) > 0 {
		parts = append(parts, "[command]")
	}
	for _, a := range c.Arguments {
		parts = append(parts, a.Term)
	}

	return strings.Join(parts, " ")
}
