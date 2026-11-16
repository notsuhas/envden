package pdf

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"reflect"
	"testing"
	"time"

	"github.com/notsuhas/envden/go/lib/pako"
)

func TestPDFLibBytes(t *testing.T) {
	raw, err := os.ReadFile("testdata/reference.json")
	if err != nil {
		t.Fatal(err)
	}

	checkPDFLibBytes(t, raw)
}

func TestPDFLibLiveReference(t *testing.T) {
	// opt-in like the server's live comparison, since it needs bun and the TS node_modules
	if os.Getenv("ENVDEN_TS_PARITY") != "1" {
		return
	}

	cmd := exec.Command("bun", "testdata/reference.mjs", "--stdout")
	cmd.Env = append(os.Environ(), "TZ=UTC")
	raw, err := cmd.Output()
	if err != nil {
		t.Fatal("pdf-lib reference:", err)
	}

	checkPDFLibBytes(t, raw)
}

func checkPDFLibBytes(t *testing.T, raw []byte) {
	t.Helper()
	saved := time.Local
	time.Local = time.UTC
	t.Cleanup(func() { time.Local = saved })
	var cases []struct {
		Kit struct {
			VaultID, SecretKey, Server, Device string
			Date                               int64
		}
		Document                 Document
		MetadataTime             int64
		PDF, Content, Compressed []byte
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}

	for i, c := range cases {
		if got := pako.Deflate(c.Content); !bytes.Equal(got, c.Compressed) {
			t.Errorf("case %d: pako content differs", i)
		}

		document, err := KitDocument(c.Kit.VaultID, c.Kit.SecretKey, c.Kit.Server, c.Kit.Device, c.Kit.Date)
		if err != nil {
			t.Fatal(err)
		}

		if !reflect.DeepEqual(document, c.Document) {
			t.Errorf("case %d: kit document differs", i)
		}

		got, err := RenderKit(document, c.MetadataTime)
		if err != nil {
			t.Fatal(err)
		}

		if !bytes.Equal(got, c.PDF) {
			first := 0
			for first < min(len(got), len(c.PDF)) && got[first] == c.PDF[first] {
				first++
			}

			t.Errorf("case %d: PDF differs at offset %d (Go %d bytes, pdf-lib %d bytes)", i, first, len(got), len(c.PDF))
		}
	}
}
