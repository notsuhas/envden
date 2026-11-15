package chain_test

import (
	"encoding/json"
	"errors"
	"os"
	"testing"

	d "github.com/notsuhas/envden/go/core/chain/devices"
	sw "github.com/notsuhas/envden/go/core/chain/swaps"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
)

func TestUnexpectedFailuresRemainErrors(t *testing.T) {
	failure := errors.New("programmer failure")
	entryWrite := c.EntryCodec.Write
	c.EntryCodec.Write = func(c.Entry) []byte { panic(failure) }
	defer func() { c.EntryCodec.Write = entryWrite }()
	if _, err := d.ApplyEntry(nil, c.Signed[c.Entry]{}); err != failure {
		t.Fatalf("got %v", err)
	}
	swapWrite := m.SwapCodec.Write
	m.SwapCodec.Write = func(m.Swap) []byte { panic(failure) }
	defer func() { m.SwapCodec.Write = swapWrite }()
	if _, err := sw.ValidateSwap(m.Swap{}, sw.Context{}); err != failure {
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
	original := c.EntryCodec.Write
	count := 0
	c.EntryCodec.Write = func(entry c.Entry) []byte { count++; return original(entry) }
	defer func() { c.EntryCodec.Write = original }()
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
		got, err := d.ApplyEntry(decode[*d.State](row.Args[0]), decode[c.Signed[c.Entry]](row.Args[1]))
		if err != nil || got.Kind != "valid" || count != 1 {
			t.Fatalf("got %v, %v, %d encodes", got.Kind, err, count)
		}
	}
}
