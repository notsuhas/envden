package adapters

// PlacementMode is "link" or "copy".
type PlacementMode string

const (
	PlacementLink PlacementMode = "link"
	PlacementCopy PlacementMode = "copy"
)

// PlacementState is linked | relinkable | detached | missing.
type PlacementState string

const (
	PlacementLinked     PlacementState = "linked"
	PlacementRelinkable PlacementState = "relinkable"
	PlacementDetached   PlacementState = "detached"
	PlacementMissing    PlacementState = "missing"
)

// Placement is how a store file appears in a checkout.
type Placement interface {
	Mode() PlacementMode
	Supported(dir string) (bool, error)
	// Place: prepare may be nil; replacingLink is the exact text of a user's link envden may replace, or "".
	Place(storePath, checkoutPath string, prepare func(path string) error, replacingLink *string) error
	// Remove: storePath may be nil.
	Remove(storePath *string, checkoutPath string) error
	Inspect(storePath, checkoutPath string) (PlacementState, error)
}
