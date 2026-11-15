package clack

import "strings"

func (t *Terminal) Intro(text string) {
	t.write(t.style("gray", t.sym("┌", "T")) + "  " + text + "\n")
}

func (t *Terminal) Outro(text string) {
	t.write(t.style("gray", t.sym("│", "|")) + "\n" + t.style("gray", t.sym("└", "—")) + "  " + text + "\n\n")
}

func (t *Terminal) Cancel(text string) {
	t.write(t.style("gray", t.sym("└", "—")) + "  " + t.style("red", text) + "\n\n")
}

func (t *Terminal) Log(kind, text string) {
	bar := t.style("gray", t.sym("│", "|"))
	symbols := map[string]string{"info": t.sym("●", "•"), "success": t.sym("◆", "*"), "step": t.sym("◇", "o"), "warn": t.sym("▲", "!"), "error": t.sym("■", "x")}
	colors := map[string]string{"info": "blue", "success": "green", "step": "green", "warn": "yellow", "error": "red"}
	symbol := bar
	if s, ok := symbols[kind]; ok {
		symbol = t.style(colors[kind], s)
	}
	lines := strings.Split(text, "\n")
	result := bar + "\n" + symbol
	if lines[0] != "" {
		result += "  " + lines[0]
	}
	for _, line := range lines[1:] {
		result += "\n" + bar
		if line != "" {
			result += "  " + line
		}
	}
	t.write(result + "\n")
}

func (t *Terminal) Note(text, title string) {
	bar := t.style("gray", t.sym("│", "|"))
	lines := append([]string{""}, strings.Split(text, "\n")...)
	lines = append(lines, "")
	width := len([]rune(title))
	for _, line := range lines {
		width = max(width, len([]rune(line)))
	}
	width += 2
	t.write(bar + "\n" + t.style("green", t.sym("◇", "o")) + "  " + t.style("reset", title) + " " + t.style("gray", strings.Repeat(t.sym("─", "-"), max(width-len([]rune(title))-1, 1))+t.sym("╮", "+")) + "\n")
	for _, line := range lines {
		t.write(bar + "  " + line + strings.Repeat(" ", width-len([]rune(line))) + bar + "\n")
	}
	t.write(t.style("gray", t.sym("├", "+")+strings.Repeat(t.sym("─", "-"), width+2)+t.sym("╯", "+")) + "\n")
}
