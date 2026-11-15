package persistence

import (
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
)

func ClearJoiner(a contracts.Adapters) error {
	if err := a.Keychain.Delete("envden/" + a.Home + "/pair-receive"); err != nil {
		return err
	}

	for _, file := range []string{"pair-pin", "pair-joiner", "pair-expiry"} {
		if err := Remove(filepath.Join(a.Home, "state", file)); err != nil {
			return err
		}
	}

	return nil
}

func Remove(path string) error {
	err := os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}

	return err
}
