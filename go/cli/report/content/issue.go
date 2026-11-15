package content

import (
	"regexp"
	"strings"
	"unicode/utf16"
)

const Repository = "notsuhas/envden"

const NewIssueURL = "https://github.com/" + Repository + "/issues/new"

func encode(text string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for _, v := range []byte(text) {
		if v >= 'a' && v <= 'z' || v >= 'A' && v <= 'Z' || v >= '0' && v <= '9' || strings.ContainsRune("-_.!~*'()", rune(v)) {
			b.WriteByte(v)
		} else {
			b.WriteByte('%')
			b.WriteByte(hex[v>>4])
			b.WriteByte(hex[v&15])
		}
	}

	return b.String()
}

func IssueTitle(args []string, code string) string {
	command := ""
	for _, arg := range args {
		if regexp.MustCompile(`^[a-z][a-z-]*$`).MatchString(arg) {
			command = arg
			break
		}
	}

	return strings.Join(strings.Fields("envden "+command+" fails with "+code), " ")
}

func IssueURL(title, report string) string {
	url := func(body string) string { return NewIssueURL + "?title=" + encode(title) + "&body=" + encode(body) }
	report = strings.ToValidUTF8(report, "�")
	if len(url(report)) <= 7000 {
		return url(report)
	}

	suffix := "\n\n(Truncated. The full report is on the reporter's machine.)"
	budget := 7000 - len(url(suffix))
	units := utf16.Encode([]rune(report))
	prefix := func(n int) string { return string(utf16.Decode(units[:n])) }
	low, high := 0, len(units)
	for low < high {
		middle := (low + high + 1) / 2
		if len(encode(prefix(middle))) <= budget {
			low = middle
		} else {
			high = middle - 1
		}
	}

	return url(prefix(low) + suffix)
}
