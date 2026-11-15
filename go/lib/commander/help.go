package commander

import (
	"golang.org/x/term"
	"os"
	"regexp"
	"strings"
	"unicode/utf16"
)

type helpItem struct{ term, description, group string }

var ansi = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

func width(s string) int { return len(utf16.Encode([]rune(ansi.ReplaceAllString(s, "")))) }

func (c *Command) Help() string {
	w := c.HelpWidth
	if w == 0 {
		if file, ok := c.output(false).(*os.File); ok {
			if columns, _, err := term.GetSize(int(file.Fd())); err == nil {
				w = columns
			}
		}
		if w == 0 {
			w = 80
		}
	}
	var args, options, commands []helpItem
	for _, a := range c.Arguments {
		if a.Description != "" {
			args = append(args, helpItem{a.name(), extra(a.Description, a.ChoiceValues, a.DefaultValue, a.DefaultDescription, ""), "Arguments:"})
		}
	}
	if c.VersionText != "" {
		options = append(options, helpItem{"-V, --version", "output the version number", "Options:"})
	}
	for _, o := range c.Options {
		if !o.Hidden {
			options = append(options, helpItem{o.Flags, extra(o.Description, o.ChoiceValues, o.DefaultValue, o.DefaultDescription, o.EnvVar), "Options:"})
		}
	}
	options = append(options, helpItem{"-h, --help", "display help for command", "Options:"})
	for _, sub := range c.Commands {
		term := sub.CommandName
		if len(sub.Options) > 0 {
			term += " [options]"
		}
		for _, a := range sub.Arguments {
			term += " " + a.Term
		}
		group := sub.Group
		if group == "" {
			group = "Commands:"
		}
		commands = append(commands, helpItem{term, sub.DescriptionText, group})
	}
	if len(c.Commands) > 0 {
		commands = append(commands, helpItem{"help [command]", "display help for command", "Commands:"})
	}
	pad := 0
	for _, items := range [][]helpItem{args, options, commands} {
		for _, item := range items {
			pad = max(pad, width(item.term))
		}
	}
	result := "Usage: " + c.usage() + "\n\n"
	if c.DescriptionText != "" {
		result += boxWrap(c.DescriptionText, w) + "\n\n"
	}
	for _, items := range [][]helpItem{args, options, commands} {
		var groups []string
		for _, item := range items {
			if !contains(groups, item.group) {
				groups = append(groups, item.group)
			}
		}
		for _, group := range groups {
			result += group + "\n"
			for _, item := range items {
				if item.group != group {
					continue
				}
				result += "  " + item.term
				if item.description != "" {
					text := item.description
					remaining := w - pad - 4
					indent := 2
					if remaining >= 40 && !regexp.MustCompile(`\n[^\S\r\n]`).MatchString(text) {
						text = boxWrap(text, remaining)
						indent = pad + 4
					}
					result += strings.Repeat(" ", pad-width(item.term)+2) + strings.ReplaceAll(text, "\n", "\n"+strings.Repeat(" ", indent))
				}
				result += "\n"
			}
			result += "\n"
		}
	}
	return strings.TrimSuffix(result, "\n")
}

var chunks = regexp.MustCompile(`\s*\S+`)

func boxWrap(text string, w int) string {
	if w < 40 {
		return text
	}
	var lines []string
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		parts := chunks.FindAllString(line, -1)
		if len(parts) == 0 {
			lines = append(lines, "")
			continue
		}
		current := parts[0]
		for _, part := range parts[1:] {
			if width(current)+width(part) <= w {
				current += part
			} else {
				lines = append(lines, current)
				current = strings.TrimLeft(part, " \t")
			}
		}
		lines = append(lines, current)
	}
	return strings.Join(lines, "\n")
}
func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
