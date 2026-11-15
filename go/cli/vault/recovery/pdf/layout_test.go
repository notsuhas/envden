package pdf

import (
	"bytes"
	"compress/zlib"
	"io"
	"os"
	"strings"
	"testing"
)

func TestPDFLibContent(t *testing.T) {
	t.Setenv("TZ", "Asia/Kolkata")
	document, err := KitDocument(strings.Repeat("A", 52), "EK1-AAAA-AAAA-AAAA-AAAA-AAAA", "http://local", "test", 0)
	if err != nil {
		t.Fatal(err)
	}
	document.Details[0].Value = "1970-01-01 05:30 GMT+5:30"
	raw, err := RenderKit(document, 0)
	if err != nil {
		t.Fatal(err)
	}
	start := bytes.Index(raw, []byte("stream\n")) + 7
	end := bytes.Index(raw, []byte("\nendstream"))
	reader, err := zlib.NewReader(bytes.NewReader(raw[start:end]))
	if err != nil {
		t.Fatal(err)
	}
	content, err := io.ReadAll(reader)
	reader.Close()
	if err != nil {
		t.Fatal(err)
	}
	expected, err := os.ReadFile("testdata/pdf-lib-content.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(content, expected) {
		t.Fatalf("pdf-lib drawing operators differ:\n%s", content)
	}
}

func TestSavePreservesExistingKit(t *testing.T) {
	dir := t.TempDir()
	id := "ABCDEF123"
	first, err := WriteKitPDF(dir, id, []byte("first"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := WriteKitPDF(dir, id, []byte("second"))
	if err != nil {
		t.Fatal(err)
	}
	if first == second || !strings.HasSuffix(second, " (2).pdf") {
		t.Fatal(first, second)
	}
	raw, err := os.ReadFile(first)
	if err != nil || string(raw) != "first" {
		t.Fatal(string(raw), err)
	}
	stat, err := os.Stat(second)
	if err != nil || stat.Mode().Perm() != 0600 {
		t.Fatal(stat, err)
	}
}
