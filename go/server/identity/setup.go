package identity

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"github.com/notsuhas/envden/go/server/shared"
)

func InitializeSetup(storage adapters.Storage, pub []byte, replacement string) (token string, err error) {
	pin, err := keys.ServerPin(pub)
	if err != nil {
		return "", err
	}

	namespace := make([]byte, 32)
	key := []byte{}
	if replacement == "" {
		token, err := storage.SetupToken()
		if err != nil {
			return "", err
		}
		if token != nil {
			return "", nil
		}
		issued, err := storage.State(namespace, adapters.StateSetupIssued, key)
		if err != nil {
			return "", err
		}
		if issued != nil {
			return "", nil
		}
		ids, err := storage.VaultIDs()
		if err != nil {
			return "", err
		}
		if len(ids) > 0 {
			return "", nil
		}
	}

	var secret []byte
	if replacement != "" {
		t, err := proofs.DecodeToken("setup", replacement)
		if err != nil {
			return "", err
		}

		secret = t.Secret
		if !bytes.Equal(t.ServerPin, pin) {
			return "", enverrors.New(enverrors.InvalidInput, "Setup token pin mismatch")
		}
	} else {
		secret = crypto.RandomBytes(20)
	}
	_, err = shared.Transaction(storage, func() (bool, error) {
		tokenKey, err := proofs.TokenKey("setup", secret)
		if err != nil {
			return false, err
		}
		if err := storage.SetSetupToken(tokenKey); err != nil {
			return false, err
		}
		if err := storage.WriteState(namespace, []adapters.StateWrite{{Kind: adapters.StateSetupIssued, Key: key, Bytes: []byte{1}}}); err != nil {
			return false, err
		}

		return true, nil
	})
	if err != nil {
		return "", err
	}

	return proofs.EncodeToken("setup", secret, pin)
}

func ReissueSetup(storage adapters.Storage, pub []byte) (string, error) {
	ids, err := storage.VaultIDs()
	if err != nil {
		return "", err
	}
	if len(ids) > 0 {
		return "", nil
	}
	pin, err := keys.ServerPin(pub)
	if err != nil {
		return "", err
	}
	token, err := proofs.EncodeToken("setup", crypto.RandomBytes(20), pin)
	if err != nil {
		return "", err
	}

	return InitializeSetup(storage, pub, token)
}
