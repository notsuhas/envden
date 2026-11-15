package output

import "strings"

func SanitizeTerminal(value string) string { return sanitize(value, false) }
func SanitizeConsole(value string) string  { return sanitize(value, true) }

func sanitize(value string, whitespace bool) string {
	return strings.Map(func(r rune) rune {
		if whitespace && (r == '\n' || r == '\t') {
			return r
		}
		if r <= 31 || r >= 127 && r <= 159 || r == 0x061c || r == 0x200e || r == 0x200f || r >= 0x202a && r <= 0x202e || r >= 0x2066 && r <= 0x2069 {
			return -1
		}
		return r
	}, value)
}
