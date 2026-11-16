package pdf

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestPDFLibParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/reference.json")
	if err != nil {
		t.Fatal(err)
	}

	checkPDFLibParity(t, raw)
}

func checkPDFLibParity(t *testing.T, raw []byte) {
	t.Helper()
	saved := time.Local
	time.Local = time.UTC
	t.Cleanup(func() { time.Local = saved })
	var cases []struct {
		Kit struct {
			VaultID, SecretKey, Server, Device string
			Date                               int64
		}
		Document     Document
		MetadataTime int64
		PDF, Content []byte
		Text         string
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}

	if len(cases) == 0 {
		t.Fatal("missing pdf-lib cases")
	}

	for i, c := range cases {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			document, err := KitDocument(c.Kit.VaultID, c.Kit.SecretKey, c.Kit.Server, c.Kit.Device, c.Kit.Date)
			if err != nil {
				t.Fatal(err)
			}

			if !reflect.DeepEqual(document, c.Document) {
				t.Error("kit document differs")
			}

			got, err := RenderKit(document, c.MetadataTime)
			if err != nil {
				t.Fatal(err)
			}

			actual, err := parsePDF(got)
			if err != nil {
				t.Fatal("Go PDF:", err)
			}

			expected, err := parsePDF(c.PDF)
			if err != nil {
				t.Fatal("pdf-lib PDF:", err)
			}

			if !reflect.DeepEqual(actual, expected) {
				t.Error("inflated streams or objects differ from pdf-lib")
			}

			if len(actual) != 8 || !strings.Contains(actual[0].dictionary, "/Kids [ 4 0 R ]\n/Count 1") || !strings.Contains(actual[3].dictionary, "/Type /Page\n") {
				t.Fatal("expected one recovery-kit page")
			}

			if !bytes.Equal(actual[7].stream, c.Content) {
				t.Error("decompressed drawing operators differ from pdf-lib")
			}

			text := extractedText(t, actual)
			if text == "" || text != extractedText(t, expected) || text != c.Text {
				t.Error("extracted text differs from pdf-lib")
			}
		})
	}
}

var drawnTextPattern = regexp.MustCompile(`<([0-9A-Fa-f]*)> Tj`)

func extractedText(t *testing.T, objects []parsedObject) string {
	t.Helper()
	var parts []string
	for _, object := range objects {
		for _, match := range drawnTextPattern.FindAllSubmatch(object.stream, -1) {
			raw, err := hex.DecodeString(string(match[1]))
			if err != nil {
				t.Fatal(err)
			}

			latin1 := make([]rune, len(raw))
			for i, b := range raw {
				latin1[i] = rune(b)
			}

			parts = append(parts, string(latin1))
		}
	}

	return strings.Join(parts, " ")
}
