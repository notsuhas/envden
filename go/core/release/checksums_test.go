package release

import (
	"strings"
	"testing"
)

func TestChecksums(t *testing.T) {
	a, b := strings.Repeat("a", 64), strings.Repeat("B", 64)
	hashes, err := ParseSha256Sums(a + "  envden-linux-x64\r\n" + b + " *envden-windows-x64.exe\n")
	if err != nil || hashes["envden-linux-x64"] != a || hashes["envden-windows-x64.exe"] != strings.ToLower(b) {
		t.Fatal(hashes, err)
	}
	for _, text := range []string{"", a[1:] + "  envden", strings.Repeat("g", 64) + "  envden", a + " envden", a + "  envden x", a + "  envden\n" + a + "  envden"} {
		_, err := ParseSha256Sums(text)
		if err == nil {
			t.Fatal("accepted", text)
		}
	}
}

func TestJSWhitespace(t *testing.T) {
	a := strings.Repeat("a", 64)
	if _, err := ParseSha256Sums(" \ufeff " + a + "  file\ufeff "); err != nil {
		t.Fatal(err)
	}
	for _, text := range []string{"\u0085" + a + "  file", a + "  file\vname"} {
		if _, err := ParseSha256Sums(text); err == nil {
			t.Fatal("accepted non-JS whitespace", text)
		}
	}
}
