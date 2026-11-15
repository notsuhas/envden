package service

import (
	"encoding/binary"
	"testing"
	"unicode/utf16"
)

func TestServiceText(t *testing.T) {
	text := "--port 1234"
	words := utf16.Encode([]rune(text))
	raw := make([]byte, len(words)*2)
	for i, w := range words {
		binary.LittleEndian.PutUint16(raw[i*2:], w)
	}
	for _, r := range []struct {
		raw      []byte
		platform string
	}{{raw, "win32"}, {append([]byte{255, 254}, raw...), "darwin"}, {[]byte(text), "linux"}} {
		if got := serviceText(r.raw, r.platform); got != text {
			t.Fatal(got)
		}
	}
}
