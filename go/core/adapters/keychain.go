// Package adapters holds the adapter interfaces every implementation satisfies.
package adapters

// Keychain is where a device keeps its private keys.
type Keychain interface {
	ID() string
	// OwnerOnly reports whether only this OS user can read the stored keys.
	OwnerOnly() (bool, error)
	// Get returns nil, nil for a missing key unless required.
	Get(name string, required bool) ([]byte, error)
	Set(name string, value []byte) error
	Delete(name string) error
}
