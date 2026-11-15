package content

import (
	"reflect"
	"strings"
	"testing"
)

func TestMaskArguments(t *testing.T) {
	for _, r := range []struct{ args, want []string }{{[]string{"setup", "--setup-token", "secret", "--server", "url"}, []string{"setup", "--setup-token", "[redacted]", "--server", "url"}}, {[]string{"join", "--recovery-kit=secret"}, []string{"join", "--recovery-kit=[redacted]"}}, {[]string{"setup", "--password=secret", "extra"}, []string{"setup", "--password=[redacted]", "[redacted]"}}} {
		if got := MaskArguments(r.args); !reflect.DeepEqual(got, r.want) {
			t.Fatal(got)
		}
	}
}

func TestRedactionAndIssue(t *testing.T) {
	text := RedactSecrets("export PASSWORD=secret\nTOKEN='secret'\nEK1-ABCDE-12345")
	if strings.Contains(text, "secret") || !strings.Contains(text, "EK1-[redacted]") {
		t.Fatal(text)
	}

	url := IssueURL("a b", strings.Repeat("❤️", 10000))
	if len(url) > 7000 || !strings.Contains(url, "Truncated") {
		t.Fatal(len(url))
	}

	if got := IssueTitle([]string{"--yes", "push"}, "INTERNAL"); got != "envden push fails with INTERNAL" {
		t.Fatal(got)
	}
}
