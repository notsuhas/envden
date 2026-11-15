package clack

import (
	"strings"
	"unicode/utf16"
)

func (p *prompt) frame() string {
	t := p.terminal
	bar, end := t.sym("│", "|"), t.sym("└", "—")
	symbol, color := t.sym("◆", "*"), "cyan"
	switch p.state {
	case "submit":
		symbol = t.sym("◇", "o")
		color = "green"
	case "cancel":
		symbol = t.sym("■", "x")
		color = "red"
	case "error":
		symbol = t.sym("▲", "x")
		color = "yellow"
	}
	header := t.style("gray", bar) + "\n" + t.style(color, symbol) + "  " + p.options.Message + "\n"
	if p.kind == "select" || p.kind == "multiselect" || p.kind == "confirm" {
		header = t.style("gray", bar) + "\n" + t.style(color, symbol) + "  " + strings.ReplaceAll(wrap(p.options.Message, t.Columns-3), "\n", "\n"+t.style(color, bar)+"  ") + "\n"
	}
	final := p.state == "submit" || p.state == "cancel"
	if final {
		value := p.value
		switch p.kind {
		case "password":
			value = strings.Repeat(t.sym("▪", "•"), len(utf16.Encode([]rune(value))))
		case "confirm":
			value = "No"
			if p.yes {
				value = "Yes"
			}
		case "select":
			if len(p.options.Options) > 0 {
				value = label(p.options.Options[p.index])
			}
		case "multiselect":
			var labels []string
			for _, o := range p.options.Options {
				if p.selected[o.Value] {
					labels = append(labels, label(o))
				}
			}
			value = strings.Join(labels, ", ")
			if value == "" && p.state == "submit" {
				value = "none"
			}
		}
		style := "dim"
		if p.state == "cancel" {
			style = "strikethrough,dim"
		}
		prefix := t.style("gray", bar)
		if value != "" {
			if p.kind == "multiselect" && value != "none" {
				var parts []string
				for _, o := range p.options.Options {
					if p.selected[o.Value] {
						parts = append(parts, t.style(style, label(o)))
					}
				}
				prefix += "  " + strings.Join(parts, t.style("dim", ", "))
			} else {
				prefix += "  " + t.style(style, value)
			}
		} else if p.kind != "text" && p.kind != "multiselect" {
			prefix += "  "
		}
		if p.state == "cancel" && value != "" {
			prefix += "\n" + t.style("gray", bar)
		}
		return header + prefix
	}
	prefix := t.style(color, bar) + "  "
	footer := t.style(color, end) + "\n"
	switch p.kind {
	case "text", "password":
		value := p.value
		if p.kind == "password" {
			value = strings.Repeat(t.sym("▪", "•"), len(utf16.Encode([]rune(value))))
		}
		cursor := p.cursor
		if p.kind == "password" {
			cursor = len(utf16.Encode([]rune(p.value)[:p.cursor]))
		}
		runes := []rune(value)
		if len(runes) == 0 && p.kind == "text" {
			if p.options.Placeholder != "" {
				r := []rune(p.options.Placeholder)
				value = t.style("inverse", string(r[0])) + t.style("dim", string(r[1:]))
			} else {
				value = t.style("inverse,hidden", "_")
			}
		} else if cursor >= len(runes) {
			if p.kind == "password" {
				value += t.style("inverse,hidden", "_")
			} else {
				value += "█"
			}
		} else {
			value = string(runes[:cursor]) + t.style("inverse", string(runes[cursor])) + string(runes[cursor+1:])
		}
		if p.state == "error" {
			if p.kind == "password" {
				value = strings.Repeat(t.sym("▪", "•"), len(utf16.Encode([]rune(p.value))))
			}
			footer = t.style("yellow", end) + "  " + t.style("yellow", p.validation) + "\n"
		}
		return header + prefix + value + "\n" + footer
	case "confirm":
		yes := t.style("green", t.sym("●", ">")) + " Yes"
		no := t.style("dim", t.sym("○", " ")) + " " + t.style("dim", "No")
		if !p.yes {
			yes = t.style("dim", t.sym("○", " ")) + " " + t.style("dim", "Yes")
			no = t.style("green", t.sym("●", ">")) + " No"
		}
		return header + prefix + yes + " " + t.style("dim", "/") + " " + no + "\n" + footer
	default:
		var rows []string
		for i, o := range p.options.Options {
			active := i == p.index
			icon := t.style("dim", t.sym("○", " "))
			name := t.style("dim", label(o))
			if active {
				icon = t.style("green", t.sym("●", ">"))
				name = label(o)
			}
			if p.kind == "multiselect" {
				icon = t.style("dim", t.sym("◻", "[ ]"))
				if active {
					icon = t.style("cyan", t.sym("◻", "[•]"))
				}
				if p.selected[o.Value] {
					icon = t.style("green", t.sym("◼", "[+]"))
				}
			}
			if o.Disabled {
				icon = t.style("gray", t.sym("○", " "))
				name = t.style("gray", label(o))
			}
			if active && o.Hint != "" {
				name += " " + t.style("dim", "("+o.Hint+")")
			}
			rows = append(rows, strings.ReplaceAll(wrap(icon+" "+name, t.Columns-visible(prefix)), "\n", "\n"+prefix))
		}
		instructions := t.style("dim", "↑/↓") + " to navigate • "
		if p.kind == "multiselect" {
			instructions += t.style("dim", "Space:") + " select • "
		}
		instructions += t.style("dim", "Enter:") + " confirm"
		rows = limitRows(rows, p.index, max(t.Rows-(strings.Count(header, "\n")+1)-(strings.Count(wrap(instructions, t.Columns-3), "\n")+3), 0), t.style("dim", "..."))
		return header + prefix + strings.Join(rows, "\n"+prefix) + "\n" + prefix + strings.ReplaceAll(wrap(instructions, t.Columns-3), "\n", "\n"+prefix) + "\n" + footer
	}
}
func label(o Option) string {
	if o.Label != "" {
		return o.Label
	}
	return o.Value
}
