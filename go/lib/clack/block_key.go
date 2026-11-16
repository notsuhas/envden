package clack

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/charmbracelet/x/ansi"
)

func blockedKey(input []byte) (string, int) {
	if input[0] == 27 {
		if len(input) < 2 {
			return "", 0
		}
		if input[1] == '[' || input[1] == 'O' {
			for i := 2; i < len(input); i++ {
				if input[i] >= 64 && input[i] <= 126 {
					return string(input[:i+1]), i + 1
				}
			}
			return "", 0
		}
		_, n := utf8.DecodeRune(input[1:])
		return string(input[:n+1]), n + 1
	}
	if !utf8.FullRune(input) {
		return "", 0
	}
	_, n := utf8.DecodeRune(input)
	return string(input[:n]), n
}

type blockedLine struct {
	value  []rune
	cursor int
}

func (l *blockedLine) echo(key string) string {
	switch key {
	case "\r", "\n":
		l.value = nil
		l.cursor = 0
		return "\r\n"
	case "\x1b[D", "\x02":
		if l.cursor == 0 {
			return ""
		}
		l.cursor--
		return fmt.Sprintf("\x1b[%dD", ansi.StringWidth(string(l.value[l.cursor])))
	case "\x1b[C", "\x06":
		if l.cursor == len(l.value) {
			return ""
		}
		width := ansi.StringWidth(string(l.value[l.cursor]))
		l.cursor++
		return fmt.Sprintf("\x1b[%dC", width)
	case "\x7f", "\x08":
		if l.cursor == 0 {
			return ""
		}
		l.value = append(l.value[:l.cursor-1], l.value[l.cursor:]...)
		l.cursor--
		return l.redraw()
	}
	if strings.HasPrefix(key, "\x1b") || key[0] < 32 && key != "\t" {
		return ""
	}
	r, _ := utf8.DecodeRuneInString(key)
	l.value = append(l.value, 0)
	copy(l.value[l.cursor+1:], l.value[l.cursor:])
	l.value[l.cursor] = r
	l.cursor++
	if l.cursor == len(l.value) {
		return key
	}
	return l.redraw()
}

func (l *blockedLine) redraw() string {
	return fmt.Sprintf("\x1b[1G\x1b[0J%s\x1b[%dG", string(l.value), ansi.StringWidth(strings.ReplaceAll(string(l.value[:l.cursor]), "\t", " "))+1)
}
