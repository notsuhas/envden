package merge

import (
	"bytes"
	"regexp"
	"strings"
)

// The parser views bytes as Latin-1, so JS whitespace includes NBSP but not UTF-8 sequences.
const ws = "[\\t\\v\\f\\r \\x{00a0}]"

var assignment = regexp.MustCompile("^" + ws + "*(#" + ws + "*)?(export" + ws + "+)?([A-Za-z_][A-Za-z0-9_]*)" + ws + "*=([^\\r]*)$")

var comment = regexp.MustCompile("^" + ws + "*#")

func latin(raw []byte) string {
	var b strings.Builder
	for _, c := range raw {
		b.WriteRune(rune(c))
	}

	return b.String()
}

func trim(s string) string { return strings.Trim(s, "\t\v\f\r\n \u00a0") }

func ParseEnv(input []byte) Result {
	skip := 0
	if bytes.HasPrefix(input, []byte{239, 187, 191}) {
		skip = 3
	}
	content := input[skip:]
	result := Result{Kind: "parsed", Head: bytes.Clone(input[:skip]), Entries: []*Entry{}}
	keys := map[string]bool{}
	start := 0
	for offset := 0; offset < len(content); {
		end := bytes.IndexByte(content[offset:], 10)
		if end < 0 {
			end = len(content)
		} else {
			end += offset + 1
		}
		body := content[offset:end]
		body = bytes.TrimSuffix(body, []byte{'\n'})
		if end > 0 && content[end-1] == 10 {
			body = bytes.TrimSuffix(body, []byte{'\r'})
		}
		offset = end
		text := latin(body)
		m := assignment.FindStringSubmatch(text)
		if m == nil {
			if trim(text) != "" && !comment.MatchString(text) {
				return conflict("unsupported-syntax", "")
			}
			continue
		}
		key := m[3]
		value := strings.TrimLeft(m[4], "\t\v\f\r\n \u00a0")
		quote := ""
		if len(value) > 0 && strings.ContainsRune("\"'`", rune(value[0])) {
			quote = value[:1]
		}
		v := ValidateValue(value, quote, key, latin(content[offset:]))
		if v.Kind == "conflict" {
			return v
		}
		if keys[key] {
			return conflict("duplicate-key", key)
		}
		keys[key] = true
		result.Entries = append(result.Entries, &Entry{key, bytes.Clone(content[start:offset]), m[2] != "", quote, m[1] == ""})
		start = offset
	}
	result.Tail = bytes.Clone(content[start:])

	return result
}

func ValidateValue(value, quote, key, remaining string) Result {
	if quote != "" {
		end := 1
		for end < len(value) {
			if value[end] == '\\' && quote != "'" {
				end += 2
				continue
			}
			if value[end] == quote[0] {
				break
			}
			end++
		}
		if end >= len(value) {
			if strings.Contains(remaining, quote) {
				return conflict("multiline-value", key)
			}

			return conflict("unterminated-quote", key)
		}
		rest := strings.TrimLeft(value[end+1:], "\t\v\f\r\n \u00a0")
		if rest != "" && !strings.HasPrefix(rest, "#") {
			return conflict("unsupported-syntax", key)
		}
	} else if strings.HasSuffix(value, "\\") {
		return conflict("multiline-value", key)
	}

	return Result{Kind: "valid"}
}
