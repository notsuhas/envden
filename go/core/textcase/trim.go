package textcase

import "strings"

func Trim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		return r >= 9 && r <= 13 || r == 32 || r == 160 || r == 5760 || r >= 8192 && r <= 8202 || r == 8232 || r == 8233 || r == 8239 || r == 8287 || r == 12288 || r == 65279
	})
}
