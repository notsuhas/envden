package keychain

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
)

func CreateMemoryKeychainAdapter(operations []string) adapters.Keychain {
	values := map[string][]byte{}
	o := Operations{}
	for _, op := range operations {
		switch op {
		case "ownerOnly":
			o.OwnerOnly = func() (bool, error) { return true, nil }
		case "get":
			o.Get = func(name string, _ bool) ([]byte, error) { return bytes.Clone(values[name]), nil }
		case "set":
			o.Set = func(name string, value []byte) error { values[name] = append([]byte{}, value...); return nil }
		case "delete":
			o.Delete = func(name string) error { delete(values, name); return nil }
		}
	}
	return CreateFakeKeychainAdapter(o)
}
