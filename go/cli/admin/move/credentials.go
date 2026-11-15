package move

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
)

func moveCredentials(a contracts.Adapters, directory, tokenText string) (*proofs.Token, []byte, string, error) {
	slot := "envden/" + a.Home + "/move-token"
	pinText, err := files.OptionalRead(filepath.Join(directory, "move-pin"))
	if err != nil {
		return nil, nil, slot, err
	}

	if tokenText != "" {
		if err = a.Keychain.Set(slot, []byte(tokenText)); err != nil {
			return nil, nil, slot, err
		}
	}

	saved, err := a.Keychain.Get(slot, false)
	if err != nil {
		return nil, nil, slot, err
	}

	if saved != nil {
		token, e := proofs.DecodeToken("setup", string(saved))

		return &token, token.ServerPin, slot, e
	}

	if pinText != nil {
		pin, e := client.Binary(*pinText)

		return nil, pin, slot, e
	}

	return nil, nil, slot, errors.New(errors.InvalidInput, "A setup token is required for a new move")
}
