package state

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
)

func TestConfigured(t *testing.T) {
	if _, e := RequireConfigured(nil); !errors.Is(e, errors.NotFound) || e.Error() != NotSetUp {
		t.Fatal(e)
	}

	s := model.EmptyState("test")
	s.CreationPending = "pending"
	if _, e := RequireConfigured(s); !errors.Is(e, errors.Conflict) {
		t.Fatal(e)
	}

	s.CreationPending = ""
	s.Server = &model.Server{}
	s.VaultID = "vault"
	if got, e := RequireConfigured(s); e != nil || got != s {
		t.Fatal(got, e)
	}

	if !errors.Is(PromptCancelled(), errors.InvalidInput) {
		t.Fatal("cancel code")
	}
}
