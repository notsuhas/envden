package state

import (
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
)

const NotSetUp = "Not set up yet. Run envden setup or envden join"

func RequireConfigured(s *model.State) (*model.State, error) {
	if s != nil && s.CreationPending != "" {
		return nil, errors.New(errors.Conflict, "Setup didn't finish. Run envden setup again to finish it")
	}
	if s == nil || s.Server == nil || s.VaultID == "" {
		return nil, errors.New(errors.NotFound, NotSetUp)
	}
	return s, nil
}
func PromptCancelled() error { return errors.New(errors.InvalidInput, "Cancelled") }
