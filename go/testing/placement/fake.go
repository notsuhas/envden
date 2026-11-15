package placement

import "github.com/notsuhas/envden/go/core/adapters"

type Operations struct {
	Mode      adapters.PlacementMode
	Supported func(dir string) (bool, error)
	Place     func(storePath, checkoutPath string, prepare func(path string) error, replacingLink *string) error
	Remove    func(storePath *string, checkoutPath string) error
	Inspect   func(storePath, checkoutPath string) (adapters.PlacementState, error)
}

type fake struct{ operations Operations }

func CreateFakePlacementAdapter(operations ...Operations) adapters.Placement {
	var o Operations
	if len(operations) > 0 {
		o = operations[0]
	}
	return &fake{o}
}

func (f *fake) Mode() adapters.PlacementMode {
	if f.operations.Mode != "" {
		return f.operations.Mode
	}
	return adapters.PlacementCopy
}

func (f *fake) Supported(dir string) (bool, error) {
	if f.operations.Supported == nil {
		panic("Unexpected fake operation: placement.supported")
	}
	return f.operations.Supported(dir)
}

func (f *fake) Place(storePath, checkoutPath string, prepare func(path string) error, replacingLink *string) error {
	if f.operations.Place == nil {
		panic("Unexpected fake operation: placement.place")
	}
	return f.operations.Place(storePath, checkoutPath, prepare, replacingLink)
}

func (f *fake) Remove(storePath *string, checkoutPath string) error {
	if f.operations.Remove == nil {
		panic("Unexpected fake operation: placement.remove")
	}
	return f.operations.Remove(storePath, checkoutPath)
}

func (f *fake) Inspect(storePath, checkoutPath string) (adapters.PlacementState, error) {
	if f.operations.Inspect == nil {
		panic("Unexpected fake operation: placement.inspect")
	}
	return f.operations.Inspect(storePath, checkoutPath)
}
