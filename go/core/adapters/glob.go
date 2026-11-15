package adapters

import (
	"regexp"
	"strings"
)

func globMatch(pattern, target string) bool {
	negate := false
	for strings.HasPrefix(pattern, "!") {
		negate = !negate
		pattern = pattern[1:]
	}
	expression, ok := globExpression([]rune(pattern))
	if !ok {
		return false
	}
	re, err := regexp.Compile("^(?:" + expression + ")$")
	if err != nil {
		return false
	}

	return re.MatchString(target) != negate
}

func globExpression(p []rune) (string, bool) {
	var out strings.Builder
	for i := 0; i < len(p); i++ {
		switch p[i] {
		case '\\':
			if i+1 < len(p) {
				i++
				out.WriteString(regexp.QuoteMeta(string(p[i])))
			} else {
				out.WriteString(`\\`)
			}
		case '*':
			end := i
			for end+1 < len(p) && p[end+1] == '*' {
				end++
			}
			if end == i+1 && (i == 0 || p[i-1] == '/') && (end+1 == len(p) || p[end+1] == '/') {
				if end+1 < len(p) {
					out.WriteString(`(?:[\s\S]*/)?`)
					end++
				} else {
					out.WriteString(`[\s\S]*`)
				}
			} else {
				if i == len(p)-1 && i >= 3 && string(p[i-3:i]) == "**/" {
					out.WriteString(`[^/]+`)
				} else {
					out.WriteString(`[^/]*`)
				}
			}
			i = end
		case '?':
			out.WriteString(`[^/]`)
		case '[':
			j := i + 1
			if j < len(p) && (p[j] == '!' || p[j] == '^') {
				j++
			}
			if j < len(p) && p[j] == ']' {
				j++
			}
			for j < len(p) && p[j] != ']' {
				j++
			}
			if j == len(p) {
				out.WriteString(`\[`)
				continue
			}
			content := string(p[i+1 : j])
			if strings.HasPrefix(content, "!") {
				content = "^" + content[1:]
			}
			out.WriteString("[" + content + "]")
			i = j
		case '{':
			depth := 1
			j := i + 1
			start := j
			parts := []string{}
			for ; j < len(p); j++ {
				if p[j] == '\\' {
					j++
					continue
				}
				if p[j] == '{' {
					depth++
				}
				if p[j] == '}' {
					depth--
					if depth == 0 {
						break
					}
				}
				if p[j] == ',' && depth == 1 {
					part, ok := globExpression(p[start:j])
					if !ok {
						return "", false
					}
					parts = append(parts, part)
					start = j + 1
				}
			}
			if j == len(p) {
				if len(parts) == 0 {
					return "", false
				}
				out.WriteString("(?:" + strings.Join(parts, "|") + ")")

				return out.String(), true
			}
			part, ok := globExpression(p[start:j])
			if !ok {
				return "", false
			}
			parts = append(parts, part)
			out.WriteString("(?:" + strings.Join(parts, "|") + ")")
			i = j
		default:
			out.WriteString(regexp.QuoteMeta(string(p[i])))
		}
	}

	return out.String(), true
}
