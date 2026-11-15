package pairing

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	"testing"
)

func TestMailboxSides(t *testing.T) {
	for _, slot := range []a.MailboxSlot{a.SlotKE1, a.SlotKE2, a.SlotKE3, a.SlotPairJoiner} {
		for _, owner := range []bool{false, true} {
			for _, write := range []bool{false, true} {
				expected := slot == a.SlotKE2 || owner
				if write {
					expected = owner == (slot == a.SlotKE2)
				}
				if got := MailboxSide(owner, write, slot); got != expected {
					t.Fatal(owner, write, slot)
				}
			}
		}
	}
}
