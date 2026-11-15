package move

import (
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func TestRequireDestination(t *testing.T) {
	pin := []byte{1}
	swap := manifests.Swap{Entries: []encoding.Signed[codecs.Entry]{{Body: codecs.Entry{EntryPayload: codecs.EntryPayload{Kind: 5, Payload: entrypayloads.ServerMoved{NewPin: pin, NewAddress: "https://destination"}}}}}}
	if err := requireDestination(swap, pin, "https://destination"); err != nil {
		t.Fatal(err)
	}

	for _, c := range []struct {
		swap    manifests.Swap
		pin     []byte
		address string
	}{{manifests.Swap{}, pin, "https://destination"}, {swap, []byte{2}, "https://destination"}, {swap, pin, "https://other"}} {
		if err := requireDestination(c.swap, c.pin, c.address); !errors.Is(err, errors.InvalidInput) {
			t.Fatal(err)
		}
	}
}
