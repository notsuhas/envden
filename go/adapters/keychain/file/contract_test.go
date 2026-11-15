package file

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	suite "github.com/notsuhas/envden/go/testing/keychain"
)

func TestContract(t *testing.T) {
	suite.KeychainContract(t, func(root string) adapters.Keychain { return CreateFileKeychainAdapter(Options{Home: root}) })
}
