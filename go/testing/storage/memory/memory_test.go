package memory

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

func TestSelectedOperationsAndCopies(t *testing.T) {
	db := CreateMemoryStorageAdapter([]string{"configureVault", "vault", "putBlob", "getBlob"})
	v := []byte{1}
	state := adapters.StoredVault{ServerMoved: []byte{2}}
	if err := db.ConfigureVault(v, state, nil, nil); err != nil {
		t.Fatal(err)
	}
	state.ServerMoved[0] = 99
	out, err := db.Vault(v)
	if err != nil || out.ServerMoved[0] != 2 {
		t.Fatal(out, err)
	}
	out.ServerMoved[0] = 98
	next, _ := db.Vault(v)
	if next.ServerMoved[0] != 2 {
		t.Fatal(next)
	}
	defer func() {
		if got := recover(); got != "Unexpected fake operation: storage.head" {
			t.Fatal(got)
		}
	}()
	_, _ = db.Head(v)
}

func TestMemorySpecificSemantics(t *testing.T) {
	db := CreateMemoryStorageAdapter()
	v := make([]byte, 32)
	if err := db.ConfigureVault(v, adapters.StoredVault{}, nil, nil); err != nil {
		t.Fatal(err)
	}
	key := adapters.SessionKey{Kind: adapters.SessionLogin, Device: []byte{1}, Purpose: "unlock"}
	if err := db.PutSession(v, key, []byte{9}, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ConsumeSession(v, key, 120000); err != nil {
		t.Fatal(err)
	}
	if b, err := db.Session(v, key, 0); err != nil || b != nil {
		t.Fatal("memory consumes expired sessions", b, err)
	}
	var receipt string
	for i := 0; i < 5; i++ {
		r, err := db.Charge(v, adapters.RateBucket{Kind: "non-member"}, 0)
		if err != nil {
			t.Fatal(err)
		}
		receipt = r.Receipt
	}
	if receipt != "5" {
		t.Fatal(receipt)
	}
	if _, err := db.Refund(receipt, 1); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		if _, err := db.Charge(v, adapters.RateBucket{Kind: "non-member"}, 900001); err != nil {
			t.Fatal(err)
		}
	}
	r, err := db.Charge(v, adapters.RateBucket{Kind: "non-member"}, 900002)
	if err != nil || r.Until != 2700001 {
		t.Fatal("memory preserves strikes on refund", r, err)
	}
}
