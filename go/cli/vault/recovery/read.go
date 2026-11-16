package recovery

import (
	"os"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/textcase"
)

func ReadKit(path string, secret func(string, func(string) string) (string, error), input func(string, string, bool, func(string) string) (string, error)) (KitInput, error) {
	if path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return KitInput{}, errors.Wrap(errors.InvalidInput, "Can't read the recovery kit file", err)
		}

		return ParseKit(string(raw))
	}

	key, err := secret("Recovery secret key", SecretKeyProblem)
	if err != nil {
		return KitInput{}, err
	}

	id, err := input("Vault ID", "", true, VaultIDProblem)
	if err != nil {
		return KitInput{}, err
	}

	return KitInput{VaultID: textcase.Trim(id), SecretKey: textcase.Trim(key)}, nil
}
