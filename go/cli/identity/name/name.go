package name

import (
	"strconv"
	"strings"
	"unicode"
)

func Fit(value string, reserved int) string {
	length := 0
	for i, r := range value {
		size := len(string(r))
		if length+size > 64-reserved {
			return value[:i]
		}
		length += size
	}
	return value
}

func Suggested(hostname string) string {
	host := strings.Map(func(r rune) rune {
		if unicode.Is(unicode.Cc, r) || unicode.Is(unicode.Cf, r) {
			return -1
		}
		return r
	}, hostname)
	host = strings.Split(host, ".")[0]
	value := strings.TrimSpace(Fit(strings.TrimSpace(host), 0))
	if value == "" {
		return "device"
	}
	return value
}

func Unique(value string, taken []string) string {
	names := map[string]bool{}
	for _, n := range taken {
		names[n] = true
	}
	if !names[value] {
		return value
	}
	for n := 2; ; n++ {
		suffix := "-" + strconv.Itoa(n)
		candidate := Fit(value, len(suffix)) + suffix
		if !names[candidate] {
			return candidate
		}
	}
}
