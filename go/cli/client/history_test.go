package client

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/notsuhas/envden/go/cli/version"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestTSHistory(t *testing.T) {
	raw, e := os.ReadFile("testdata/history.json")
	if e != nil {
		t.Fatal(e)
	}

	var vectors struct{ Genesis, Unknown, Header string }
	if e = json.Unmarshal(raw, &vectors); e != nil {
		t.Fatal(e)
	}

	genesis, _ := Binary(vectors.Genesis)
	unknown, _ := Binary(vectors.Unknown)
	header, _ := Binary(vectors.Header)
	if _, e = DecodeHistoryEntries([][]byte{genesis, unknown}, nil, "999.0.0", nil); !errors.Is(e, errors.UpdateRequired) {
		t.Fatal(e)
	}

	unknown[len(unknown)-1] ^= 1
	if _, e = DecodeHistoryEntries([][]byte{genesis, unknown}, nil, "999.0.0", nil); !errors.Is(e, errors.InvalidData) {
		t.Fatal(e)
	}

	decoded, e := DecodeHistoryEntries([][]byte{genesis}, nil, "", nil)
	if e != nil {
		t.Fatal(e)
	}

	if _, e = DecodeHistoryHeader(header, decoded.Entries, nil, "999.0.0", nil); !errors.Is(e, errors.UpdateRequired) {
		t.Fatal(e)
	}

	if _, e = DecodeHistoryHeader(header, decoded.Entries, nil, version.Version, nil); !errors.Is(e, errors.InvalidData) {
		t.Fatal(e)
	}
}
