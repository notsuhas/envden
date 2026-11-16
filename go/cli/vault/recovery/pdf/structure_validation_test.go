package pdf

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestPDFStructureRejectsCorruption(t *testing.T) {
	raw, err := os.ReadFile("testdata/reference.json")
	if err != nil {
		t.Fatal(err)
	}

	var cases []struct{ PDF []byte }
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}

	length := lengthPattern.FindStringSubmatch(string(cases[0].PDF))
	for _, tc := range []struct {
		name, old, replacement, message string
	}{
		{"header", "%PDF-1.7", "%PDF-9.9", "invalid PDF header"},
		{"startxref", "startxref\n", "startxref\n9", "invalid startxref offset"},
		{"xref offset", "0000000016 00000 n", "0000000017 00000 n", "invalid object boundary"},
		{"length", length[0], "/Length " + strings.Repeat("0", len(length[1])), "invalid stream length"},
		{"reference", "/Contents [ 8 0 R ]", "/Contents [ 9 0 R ]", "dangling object reference"},
		{"size", "/Size 9", "/Size 8", "invalid trailer size"},
		{"zlib", "stream\nx", "stream\n!", "zlib"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			bad := bytes.Replace(cases[0].PDF, []byte(tc.old), []byte(tc.replacement), 1)
			if bytes.Equal(bad, cases[0].PDF) {
				t.Fatal("corruption did not change fixture")
			}

			if _, err := parsePDF(bad); err == nil || !strings.Contains(err.Error(), tc.message) {
				t.Fatalf("expected %q, got %v", tc.message, err)
			}
		})
	}
}
