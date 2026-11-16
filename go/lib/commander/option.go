package commander

import (
	"encoding/json"
	"strings"
)

type Option struct {
	Flags, Description, Short, Long, Key, EnvVar            string
	Required, Optional, Variadic, Negate, Hidden, Mandatory bool
	DefaultValue                                            any
	DefaultDescription                                      string
	ChoiceValues, ConflictKeys                              []string
	Parse                                                   func(string) (any, error)
}

func NewOption(flags, description string) *Option {
	o := &Option{Flags: flags, Description: description, Required: strings.Contains(flags, "<"), Optional: strings.Contains(flags, "["), Variadic: strings.Contains(flags, "...")}
	for _, part := range strings.Fields(strings.ReplaceAll(flags, ",", " ")) {
		if strings.HasPrefix(part, "--") {
			o.Long = part
		} else if strings.HasPrefix(part, "-") {
			o.Short = part
		}
	}
	name := strings.TrimPrefix(o.Long, "--")
	if name == "" {
		name = strings.TrimPrefix(o.Short, "-")
	}
	o.Negate = strings.HasPrefix(name, "no-")
	name = strings.TrimPrefix(name, "no-")
	pieces := strings.Split(name, "-")
	for i := 1; i < len(pieces); i++ {
		pieces[i] = strings.ToUpper(pieces[i][:1]) + pieces[i][1:]
	}
	o.Key = strings.Join(pieces, "")

	return o
}

func (o *Option) Choices(values ...string) *Option { o.ChoiceValues = values; return o }

func (o *Option) HideHelp() *Option { o.Hidden = true; return o }

func (o *Option) Default(value any, description ...string) *Option {
	o.DefaultValue = value
	if len(description) > 0 {
		o.DefaultDescription = description[0]
	}

	return o
}

func (o *Option) Conflicts(keys ...string) *Option { o.ConflictKeys = keys; return o }

func (o *Option) Env(name string) *Option { o.EnvVar = name; return o }

type Argument struct {
	Term, Description  string
	DefaultValue       any
	DefaultDescription string
	ChoiceValues       []string
}

func NewArgument(term, description string) *Argument {
	return &Argument{Term: term, Description: description}
}

func (a *Argument) Default(value any, description ...string) *Argument {
	a.DefaultValue = value
	if len(description) > 0 {
		a.DefaultDescription = description[0]
	}

	return a
}

func (a *Argument) Choices(values ...string) *Argument { a.ChoiceValues = values; return a }

func (a *Argument) name() string { return strings.TrimSuffix(strings.Trim(a.Term, "<>[]"), "...") }

func extra(description string, choices []string, value any, label, env string) string {
	var parts []string
	if len(choices) > 0 {
		quoted := make([]string, len(choices))
		for i, v := range choices {
			quoted[i] = jsonText(v)
		}
		parts = append(parts, "choices: "+strings.Join(quoted, ", "))
	}
	if value != nil {
		if label == "" {
			label = jsonText(value)
		}
		parts = append(parts, "default: "+label)
	}
	if env != "" {
		parts = append(parts, "env: "+env)
	}
	if len(parts) > 0 {
		if description != "" {
			description += " "
		}
		description += "(" + strings.Join(parts, ", ") + ")"
	}

	return description
}

func jsonText(value any) string { b, _ := json.Marshal(value); return string(b) }
