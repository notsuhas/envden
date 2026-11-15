package output

import (
	"bytes"
	"fmt"
	"testing"
)

func TestTerminalWriterPreservesLineTerminator(t *testing.T) {
	var b bytes.Buffer
	w := TerminalWriter{Writer: &b}
	_, _ = fmt.Fprintln(w, "unsafe\x1b[31m\nmessage")
	if b.String() != "unsafe[31mmessage\n" {
		t.Fatal(b.String())
	}
}
