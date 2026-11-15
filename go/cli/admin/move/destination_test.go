package move

import (
	"github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"testing"
)

func TestRequireDestination(t *testing.T) {
	pin := []byte{1}
	swap := m.Swap{Entries: []b.Signed[c.Entry]{{Body: c.Entry{EntryPayload: c.EntryPayload{Kind: 5, Payload: p.ServerMoved{NewPin: pin, NewAddress: "https://destination"}}}}}}
	if err := requireDestination(swap, pin, "https://destination"); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		swap    m.Swap
		pin     []byte
		address string
	}{{m.Swap{}, pin, "https://destination"}, {swap, []byte{2}, "https://destination"}, {swap, pin, "https://other"}} {
		if err := requireDestination(c.swap, c.pin, c.address); !errors.Is(err, errors.InvalidInput) {
			t.Fatal(err)
		}
	}
}
