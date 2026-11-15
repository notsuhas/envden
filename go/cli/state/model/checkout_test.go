package model

import (
	"encoding/json"
	"testing"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
)

func TestPreserveCheckoutJSON(t *testing.T) {
	raw := `{"identity":"fixture","rootDevice":3,"root":"/repo","repoId":"example/repo","gitDir":"/repo/.git","registeredWorktree":false}`
	var checkout Checkout
	if err := json.Unmarshal([]byte(raw), &checkout); err != nil {
		t.Fatal(err)
	}

	encoded, err := jsonvalue.Marshal(checkout)
	if err != nil || string(encoded) != raw {
		t.Fatal(string(encoded), err)
	}

	checkout.Root = "/moved"
	encoded, err = jsonvalue.Marshal(checkout)
	if err != nil {
		t.Fatal(err)
	}

	var again Checkout
	if err = json.Unmarshal(encoded, &again); err != nil || again.Root != "/moved" || again.RegisteredWorktree == nil || *again.RegisteredWorktree {
		t.Fatal(again, err)
	}
}
