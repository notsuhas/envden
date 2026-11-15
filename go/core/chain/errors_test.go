package chain_test

import (
	"encoding/json"
	"errors"
	"os"
	"testing"

	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	"github.com/notsuhas/envden/go/core/chain/swaps"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
)

func TestUnexpectedFailuresRemainErrors(t *testing.T) {
	failure := errors.New("programmer failure")
	entryWrite := codecs.EntryCodec.Write
	codecs.EntryCodec.Write = func(codecs.Entry) []byte { panic(failure) }
	defer func() { codecs.EntryCodec.Write = entryWrite }()
	if _, err := devicechain.ApplyEntry(nil, codecs.Signed[codecs.Entry]{}); !errors.Is(err, failure) {
		t.Fatalf("got %v", err)
	}
	swapWrite := manifests.SwapCodec.Write
	manifests.SwapCodec.Write = func(manifests.Swap) []byte { panic(failure) }
	defer func() { manifests.SwapCodec.Write = swapWrite }()
	if _, err := swaps.ValidateSwap(manifests.Swap{}, swaps.Context{}); !errors.Is(err, failure) {
		t.Fatalf("got %v", err)
	}
}

func TestEntryBodyEncodedOnce(t *testing.T) {
	raw, err := os.ReadFile("testdata/typescript.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []vector
	if err = json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	original := codecs.EntryCodec.Write
	count := 0
	codecs.EntryCodec.Write = func(entry codecs.Entry) []byte { count++; return original(entry) }
	defer func() { codecs.EntryCodec.Write = original }()
	for _, row := range rows {
		if row.Name != "applyEntry" {
			continue
		}
		var result struct{ Kind string }
		if err = json.Unmarshal(row.Result, &result); err != nil {
			t.Fatal(err)
		}
		if result.Kind != "valid" {
			continue
		}
		count = 0
		got, err := devicechain.ApplyEntry(decode[*devicechain.State](row.Args[0]), decode[codecs.Signed[codecs.Entry]](row.Args[1]))
		if err != nil || got.Kind != "valid" || count != 1 {
			t.Fatalf("got %v, %v, %d encodes", got.Kind, err, count)
		}
	}
}
