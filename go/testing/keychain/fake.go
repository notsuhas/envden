package keychain

import "github.com/notsuhas/envden/go/core/adapters"

type Operations struct {
	ID        string
	OwnerOnly func() (bool, error)
	Get       func(name string, required bool) ([]byte, error)
	Set       func(name string, value []byte) error
	Delete    func(name string) error
}

type fake struct{ operations Operations }

func CreateFakeKeychainAdapter(operations ...Operations) adapters.Keychain {
	var o Operations
	if len(operations) > 0 {
		o = operations[0]
	}
	return &fake{o}
}

func (a *fake) ID() string {
	if a.operations.ID != "" {
		return a.operations.ID
	}
	return "fake-keychain"
}

func (a *fake) OwnerOnly() (bool, error) {
	if a.operations.OwnerOnly == nil {
		panic("Unexpected fake operation: keychain.ownerOnly")
	}
	return a.operations.OwnerOnly()
}

func (a *fake) Get(name string, required bool) ([]byte, error) {
	if a.operations.Get == nil {
		panic("Unexpected fake operation: keychain.get")
	}
	return a.operations.Get(name, required)
}

func (a *fake) Set(name string, value []byte) error {
	if a.operations.Set == nil {
		panic("Unexpected fake operation: keychain.set")
	}
	return a.operations.Set(name, value)
}

func (a *fake) Delete(name string) error {
	if a.operations.Delete == nil {
		panic("Unexpected fake operation: keychain.delete")
	}
	return a.operations.Delete(name)
}
