package pairing

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

func TestMailboxSides(t *testing.T) {
	for _, slot := range []adapters.MailboxSlot{adapters.SlotKE1, adapters.SlotKE2, adapters.SlotKE3, adapters.SlotPairJoiner} {
		for _, owner := range []bool{false, true} {
			for _, write := range []bool{false, true} {
				expected := slot == adapters.SlotKE2 || owner
				if write {
					expected = owner == (slot == adapters.SlotKE2)
				}
				if got := MailboxSide(owner, write, slot); got != expected {
					t.Fatal(owner, write, slot)
				}
			}
		}
	}
}
