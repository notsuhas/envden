package textcase

import "testing"

func TestECMAScriptTrim(t *testing.T) {
	if got := Trim("\ufeff a \ufeff"); got != "a" {
		t.Fatal(got)
	}
	if got := Trim("\u0085a\u0085"); got != "\u0085a\u0085" {
		t.Fatal(got)
	}
}
