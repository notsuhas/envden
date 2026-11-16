package commander

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

func (c *Command) Parse(args []string) (*Invocation, error) {
	result := &Invocation{Command: c, Values: map[string]any{}}
	for _, o := range c.Options {
		if o.DefaultValue != nil {
			result.Values[o.Key] = o.DefaultValue
		} else if o.Negate {
			result.Values[o.Key] = true
		}
		if o.EnvVar != "" {
			if v, ok := os.LookupEnv(o.EnvVar); ok {
				result.Values[o.Key] = v
			}
		}
	}
	positional := false
	var unknown []string
	helpRequested := false
	supplied := map[string]bool{}
	for i := 0; i < len(args); i++ {
		token := args[i]
		if token == "--" && !positional {
			positional = true
			if len(c.Commands) > 0 {
				if len(unknown) > 0 {
					unknown = append(unknown, token)
				} else {
					result.Args = append(result.Args, token)
				}
			}
			continue
		}
		if !positional {
			if token == "--help" || token == "-h" {
				unknown = append(unknown, token)
				helpRequested = true
				continue
			}
			if (token == "--version" || strings.HasPrefix(token, "-V") && !strings.HasPrefix(token, "--")) && c.VersionText != "" {
				_, _ = io.WriteString(c.output(false), c.VersionText+"\n")

				return result, &ExitError{Code: "commander.version"}
			}
			if token == "help" && len(c.Commands) > 0 && len(result.Args) == 0 && len(unknown) == 0 {
				target := c
				for _, name := range args[i+1:] {
					found := false
					for _, sub := range target.Commands {
						if sub.CommandName == name {
							target = sub
							found = true
							break
						}
					}
					if !found {
						return result, c.fail("commander.unknownCommand", "unknown command '"+name+"'"+suggest(name, c.commandNames()))
					}
				}
				_, _ = io.WriteString(c.output(false), target.Help())

				return result, &ExitError{Code: "commander.helpDisplayed"}
			}

			if strings.HasPrefix(token, "-") && token != "-" {
				flag, value, hasValue := token, "", false
				if strings.HasPrefix(token, "--") {
					flag, value, hasValue = strings.Cut(token, "=")
				}
				var option *Option
				for _, o := range c.Options {
					if (flag == o.Long || flag == o.Short) && (!hasValue || o.Required || o.Optional) {
						option = o
						break
					}
				}
				if option == nil && len(flag) > 2 && !strings.HasPrefix(flag, "--") {
					for _, o := range c.Options {
						if flag[:2] == o.Short {
							option = o
							if o.Required || o.Optional {
								value = flag[2:]
								hasValue = true
							} else {
								args = append(args[:i+1], append([]string{"-" + flag[2:]}, args[i+1:]...)...)
							}
							break
						}
					}
				}
				if option == nil {
					unknown = append(unknown, token)
					continue
				}
				o := option
				if o.Required || o.Optional {
					if !hasValue && i+1 < len(args) && (!strings.HasPrefix(args[i+1], "-") || isNegative(args[i+1])) {
						i++
						value = args[i]
						hasValue = true
					}
					if !hasValue && o.Required {
						return result, c.fail("commander.optionMissingArgument", "option '"+o.Flags+"' argument missing")
					}
					if hasValue {
						parsed, err := parseValue(o, value)
						if err != nil {
							return result, c.optionParseError(o, value, err)
						}
						if o.Variadic {
							values, _ := result.Values[o.Key].([]string)
							if !supplied[o.Key] {
								values = nil
							}
							values = append(values, value)
							for i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
								i++
								v := args[i]
								if _, err := parseValue(o, v); err != nil {
									return result, c.optionParseError(o, v, err)
								}
								values = append(values, v)
							}
							result.Values[o.Key] = values
						} else {
							result.Values[o.Key] = parsed
						}
					} else {
						result.Values[o.Key] = true
					}
				} else {
					result.Values[o.Key] = !o.Negate
				}
				supplied[o.Key] = true
				continue
			}
		}
		if len(unknown) > 0 {
			unknown = append(unknown, token)
		} else {
			result.Args = append(result.Args, token)
		}
		if c.PassThrough {
			positional = true
		}
	}
	if len(result.Args) > 0 {
		for _, sub := range c.Commands {
			if result.Args[0] == sub.CommandName {
				return sub.Parse(append(result.Args[1:], unknown...))
			}
		}
	}
	if helpRequested {
		_, _ = io.WriteString(c.output(false), c.Help())
		return result, &ExitError{Code: "commander.helpDisplayed"}
	}
	unknownOption := ""
	if len(unknown) > 0 {
		unknownOption = unknown[0]
		if c.UnknownOptions {
			result.Args = append(result.Args, unknown...)
			unknownOption = ""
		}
	}

	if len(c.Commands) > 0 && c.action == nil && (len(result.Args) > 0 || unknownOption == "") {
		if len(result.Args) > 0 {
			name := result.Args[0]

			return result, c.fail("commander.unknownCommand", "unknown command '"+name+"'"+suggest(name, c.commandNames()))
		}
		_, _ = io.WriteString(c.output(true), c.Help())

		return result, &ExitError{Code: "commander.help", ExitCode: 1}
	}
	for _, o := range c.Options {
		if o.Mandatory && result.Values[o.Key] == nil {
			return result, c.fail("commander.missingMandatoryOptionValue", "required option '"+o.Flags+"' not specified")
		}
		if !supplied[o.Key] {
			continue
		}
		for _, key := range o.ConflictKeys {
			if !supplied[key] {
				continue
			}
			for _, other := range c.Options {
				if other.Key == key {
					return result, c.fail("commander.conflictingOption", "option '"+o.Flags+"' cannot be used with option '"+other.Flags+"'")
				}
			}
		}
	}
	if unknownOption != "" {
		return result, c.fail("commander.unknownOption", "unknown option '"+unknownOption+"'"+suggest(unknownOption, c.optionNames()))
	}
	for i, a := range c.Arguments {
		if i >= len(result.Args) {
			if strings.HasPrefix(a.Term, "<") {
				return result, c.fail("commander.missingArgument", "missing required argument '"+a.name()+"'")
			}
			if v, ok := a.DefaultValue.(string); ok {
				result.Args = append(result.Args, v)
			}
			continue
		}
		if len(a.ChoiceValues) > 0 && !contains(a.ChoiceValues, result.Args[i]) {
			return result, c.fail("commander.invalidArgument", fmt.Sprintf("command-argument value '%s' is invalid for argument '%s'. Allowed choices are %s.", result.Args[i], a.name(), strings.Join(a.ChoiceValues, ", ")))
		}
	}
	variadic := len(c.Arguments) > 0 && strings.Contains(c.Arguments[len(c.Arguments)-1].Term, "...")
	if !variadic && len(result.Args) > len(c.Arguments) {
		return result, c.fail("commander.excessArguments", fmt.Sprintf("too many arguments%s. Expected %d %s but got %d: %s.", c.excessContext(), len(c.Arguments), plural(len(c.Arguments), "argument"), len(result.Args), strings.Join(result.Args, ", ")))
	}
	if err := c.runHooks("preAction", c); err != nil {
		return result, err
	}
	if c.action != nil {
		if err := c.action(result); err != nil {
			return result, err
		}
	}

	return result, c.runHooks("postAction", c)
}

func (c *Command) optionParseError(o *Option, value string, err error) error {
	var invalid *InvalidArgumentError
	if !errors.As(err, &invalid) {
		return err
	}
	return c.fail("commander.invalidArgument", fmt.Sprintf("option '%s' argument '%s' is invalid. %s", o.Flags, value, err.Error()))
}
