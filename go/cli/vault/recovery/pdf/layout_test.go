package pdf

import (
	"bytes"
	"compress/zlib"
	"io"
	"os"
	"path/filepath"
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
	if err := reader.Close(); err != nil {
		t.Fatal(err)
	}

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

	if first != filepath.Join(dir, "envden Recovery Kit ABCDEF.pdf") || second != filepath.Join(dir, "envden Recovery Kit ABCDEF (2).pdf") {
		t.Fatal(first, second)
	}

	raw, err := os.ReadFile(first)
	if err != nil || string(raw) != "first" {
		t.Fatal(string(raw), err)
	}

	for _, path := range []string{first, second} {
		stat, err := os.Stat(path)
		if err != nil || stat.Mode().Perm() != 0600 {
			t.Fatal(stat, err)
		}
	}
}

func TestUnbrokenWordsWrapInsideTheMargin(t *testing.T) {
	url := "https://" + strings.Repeat("envden-server-", 12) + "example.ts.net:4280"
	text := "Run envden join " + url + " on the new device."
	got := lines(text, 467.28)
	if strings.Join(got, "") != text || len(got) < 3 {
		t.Fatalf("%q", got)
	}

	for _, line := range got {
		if width(strings.TrimRight(line, " "), "Helvetica", 11) > 467.28 {
			t.Fatalf("line past the margin: %q", line)
		}
	}
}
