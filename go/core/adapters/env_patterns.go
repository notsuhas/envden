package adapters

import "strings"

const (
	maxPatternLength       = 1024
	maxPatternGroups       = 10
	maxPatternAlternatives = 16
)

// UnsupportedEnvPattern refuses globs outside the grammar where every implementation is known to decide alike.
func UnsupportedEnvPattern(pattern string) bool {
	return !supportedPattern(pattern)
}

func supportedPattern(pattern string) bool {
	if len(pattern) > maxPatternLength {
		return false
	}

	groups, alternatives := 0, 1
	for _, segment := range strings.Split(strings.TrimPrefix(pattern, "!"), "/") {
		if segment != "**" && !segmentSupported(segment, &groups, &alternatives) {
			return false
		}
	}

	return groups <= maxPatternGroups && alternatives <= maxPatternAlternatives
}

func segmentSupported(segment string, groups, alternatives *int) bool {
	if segment == "" {
		return false
	}

	for i := 0; i < len(segment); i++ {
		switch c := segment[i]; {
		case c == '*' && i+1 < len(segment) && segment[i+1] == '*':
			return false
		case c == '*' || c == '?':
		case c == '{':
			end := strings.IndexByte(segment[i:], '}')
			if end < 0 || !groupSupported(segment, i, i+end) {
				return false
			}

			*groups++
			*alternatives = min(*alternatives*(strings.Count(segment[i:i+end], ",")+1), maxPatternAlternatives+1)
			i += end
		case !patternLiteral(c):
			return false
		}
	}

	return true
}

// Options are non-empty literals or `*` with no ranges; a starred group never touches an outside `*`.
func groupSupported(segment string, open, end int) bool {
	options := strings.Split(segment[open+1:end], ",")
	starred := strings.Contains(segment[open+1:end], "*")
	touchesStar := open > 0 && segment[open-1] == '*' || end+1 < len(segment) && segment[end+1] == '*'
	if starred && touchesStar {
		return false
	}

	for _, option := range options {
		if option == "" || strings.Contains(option, "**") || strings.Contains(option, "..") {
			return false
		}

		for i := 0; i < len(option); i++ {
			if option[i] != '*' && !patternLiteral(option[i]) {
				return false
			}
		}
	}

	return true
}

func patternLiteral(c byte) bool {
	return c >= 0x20 && c <= 0x7e && !strings.ContainsRune(`*?[]{}\,!()|+@/`, rune(c))
}
