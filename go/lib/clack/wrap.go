package clack

import (
	"fmt"
	"golang.org/x/text/unicode/norm"
	"golang.org/x/text/width"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

var sgr = regexp.MustCompile(`^\x1b\[([0-9]+)m`)
var escape = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

func visible(s string) int {
	n := 0
	for _, r := range escape.ReplaceAllString(s, "") {
		if r < 32 || unicode.Is(unicode.Mn, r) || r == 0x200d || r == 0xfe0f {
			continue
		}
		switch width.LookupRune(r).Kind() {
		case width.EastAsianWide, width.EastAsianFullwidth:
			n += 2
		default:
			n++
		}
	}
	return n
}
func wrap(text string, columns int) string {
	if columns < 1 {
		columns = 1
	}
	var output []string
	for _, line := range strings.Split(strings.ReplaceAll(norm.NFC.String(text), "\r\n", "\n"), "\n") {
		output = append(output, wrapLine(line, columns))
	}
	return strings.Join(output, "\n")
}
func wrapLine(text string, columns int) string {
	rows := []string{""}
	length := 0
	for i, word := range strings.Split(text, " ") {
		if i > 0 {
			if length >= columns {
				rows = append(rows, "")
				length = 0
			}
			rows[len(rows)-1] += " "
			length++
		}
		n := visible(word)
		if n > columns {
			remaining := columns - length
			if (n-1)/columns < 1+(n-remaining-1)/columns {
				rows = append(rows, "")
			}
			for len(word) > 0 {
				if match := sgr.FindString(word); match != "" {
					rows[len(rows)-1] += match
					word = word[len(match):]
					continue
				}
				r, size := utf8.DecodeRuneInString(word)
				character := string(r)
				current := visible(rows[len(rows)-1])
				if current+visible(character) > columns {
					rows = append(rows, "")
				}
				rows[len(rows)-1] += character
				word = word[size:]
				if visible(rows[len(rows)-1]) == columns && word != "" {
					rows = append(rows, "")
				}
			}
			if len(rows) > 1 && visible(rows[len(rows)-1]) == 0 {
				last := len(rows) - 1
				rows[last-1] += rows[last]
				rows = rows[:last]
			}
			length = visible(rows[len(rows)-1])
			continue
		}
		if length+n > columns && length > 0 && n > 0 {
			rows = append(rows, "")
			length = 0
		}
		rows[len(rows)-1] += word
		length += n
	}
	raw := strings.Join(rows, "\n")
	var out strings.Builder
	code := 0
	for len(raw) > 0 {
		if match := sgr.FindStringSubmatch(raw); len(match) > 0 {
			code, _ = strconv.Atoi(match[1])
			if code == 39 {
				code = 0
			}
			out.WriteString(match[0])
			raw = raw[len(match[0]):]
			continue
		}
		r, size := utf8.DecodeRuneInString(raw)
		if r == '\n' {
			if close := closing(code); close != 0 {
				out.WriteString(fmt.Sprintf("\x1b[%dm", close))
			}
			out.WriteRune(r)
			if closing(code) != 0 {
				out.WriteString(fmt.Sprintf("\x1b[%dm", code))
			}
		} else {
			out.WriteRune(r)
		}
		raw = raw[size:]
	}
	return out.String()
}
func closing(code int) int {
	switch {
	case code >= 30 && code <= 37 || code >= 90 && code <= 97:
		return 39
	case code >= 40 && code <= 47 || code >= 100 && code <= 107:
		return 49
	}
	switch code {
	case 1, 2:
		return 22
	case 3:
		return 23
	case 4:
		return 24
	case 7:
		return 27
	case 8:
		return 28
	case 9:
		return 29
	}
	return 0
}
