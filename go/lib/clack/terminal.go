package clack

import (
	"fmt"
	"golang.org/x/term"
	"io"
	"os"
	"runtime"
	"strings"
)

type Terminal struct {
	Input         io.Reader
	Output        io.Writer
	Columns, Rows int
	Color         bool
	ASCII         bool
}

func New(input io.Reader, output io.Writer) *Terminal {
	t := &Terminal{Input: input, Output: output, Columns: 80, Rows: 20, ASCII: os.Getenv("TERM") == "linux"}
	if f, ok := output.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		t.Color = os.Getenv("TERM") != "dumb"
		if w, h, err := term.GetSize(int(f.Fd())); err == nil {
			t.Columns = w
			t.Rows = h
		}
	}
	if _, ok := os.LookupEnv("NO_COLOR"); ok {
		t.Color = false
	}
	if value, ok := os.LookupEnv("FORCE_COLOR"); ok {
		t.Color = value != "0"
	}
	if runtime.GOOS == "windows" {
		t.ASCII = os.Getenv("WT_SESSION") == "" && os.Getenv("TERM_PROGRAM") == "" && os.Getenv("CI") == ""
	}
	return t
}
func (t *Terminal) style(style, text string) string {
	if !t.Color || text == "" {
		return text
	}
	codes := map[string][2]int{"gray": {90, 39}, "cyan": {36, 39}, "green": {32, 39}, "red": {31, 39}, "yellow": {33, 39}, "blue": {34, 39}, "magenta": {35, 39}, "dim": {2, 22}, "inverse": {7, 27}, "hidden": {8, 28}, "strikethrough": {9, 29}, "reset": {0, 0}}
	names := strings.Split(style, ",")
	for i := len(names) - 1; i >= 0; i-- {
		code := codes[names[i]]
		open := fmt.Sprintf("\x1b[%dm", code[0])
		close := fmt.Sprintf("\x1b[%dm", code[1])
		text = open + strings.ReplaceAll(text, close, open) + close
	}
	return text
}
func (t *Terminal) sym(unicode, ascii string) string {
	if t.ASCII {
		return ascii
	}
	return unicode
}
func (t *Terminal) write(text string) { io.WriteString(t.Output, text) }
func move(rows int) string {
	if rows < 0 {
		return fmt.Sprintf("\x1b[%dA", -rows)
	}
	if rows > 0 {
		return fmt.Sprintf("\x1b[%dB", rows)
	}
	return ""
}

func (p *prompt) insert(key rune) {
	r := []rune(p.value)
	r = append(r, 0)
	copy(r[p.cursor+1:], r[p.cursor:])
	r[p.cursor] = key
	p.cursor++
	p.value = string(r)
}
func (p *prompt) navigate(direction int) {
	if p.kind == "text" || p.kind == "password" {
		p.cursor = max(0, min(len([]rune(p.value)), p.cursor+direction))
		return
	}
	if p.kind == "confirm" {
		p.yes = !p.yes
		return
	}
	n := len(p.options.Options)
	for range n {
		p.index = (p.index + direction + n) % n
		if !p.options.Options[p.index].Disabled {
			return
		}
	}
}
