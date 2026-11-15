package jsonvalue

import (
	"testing"
)

func TestOrderAndNoHTMLEscaping(t *testing.T) {
	raw := `{"z":"<>&","a":{"b":1,"a":2},"list":[]}`
	value, e := Parse([]byte(raw))
	if e != nil {
		t.Fatal(e)
	}
	data, e := Marshal(value)
	if e != nil || string(data) != raw {
		t.Fatal(string(data), e)
	}
}

func TestUnicodeSeparators(t *testing.T) {
	value := "literal\\u2028 and actual\u2028separator\u2029"
	raw, e := Marshal(value)
	want := "\"literal\\\\u2028 and actual\u2028separator\u2029\""
	if e != nil || string(raw) != want {
		t.Fatalf("%q != %q: %v", raw, want, e)
	}
}
